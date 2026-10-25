"use client";

// Onglet "Rendez-vous passés" — centre d'historique (spec CEO 16/07/2026), refonte
// d'affichage 25/10/2026 (lignes denses, barre d'outils, états chargement/vide/erreur).
// Filtrage/tri/pagination faits côté client (une seule requête par changement de
// dates/recherche) pour que les compteurs de statut restent exacts quel que soit le
// chip actif. "Effectué"/"Honoré" fusionnés en "Terminé" (une seule valeur de complétion
// dans statut_rdv). "Absent" filtre sur presence_status, pas sur statut. "En cours"
// regroupe en_attente / nouveau / confirme (RDV pas encore clôturés).
// Pas de setState synchrone dans un effet : l'état de chargement est dérivé de la clé
// de la requête (résultat.cle !== cle courante).
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { HelpCenterGuide } from "./HelpCenterGuide";
import { jourConakry } from "@/lib/heure";
import { telechargerExportServeur } from "@/lib/export/telechargementClient";
import {
  ChampDate, DetailRdvModal, EnteteColonnes, RdvLigne, RdvPasseStyles, SqueletteLignes,
  isoVersJma, jmaVersIso, type ActionsLigne, type RdvHisto,
} from "./RdvPasseUi";

type StatutFiltre = "tous" | "en_cours" | "termine" | "annule" | "absent";
type SortBy = "recent" | "ancien";
type Periode = "tout" | "aujourdhui" | "7j" | "30j" | "mois" | "perso";

const STATUTS: { key: StatutFiltre; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "en_cours", label: "En cours" },
  { key: "termine", label: "Terminé" },
  { key: "annule", label: "Annulé" },
  { key: "absent", label: "Absent" },
];
const PERIODES: { key: Periode; label: string }[] = [
  { key: "aujourdhui", label: "Aujourd'hui" },
  { key: "7j", label: "7 jours" },
  { key: "30j", label: "30 jours" },
  { key: "mois", label: "Ce mois" },
  { key: "perso", label: "Personnalisé" },
];
const STATUTS_EN_COURS = ["en_attente", "nouveau", "confirme"];
const PLAFOND_API = 1000;
const VIDE: RdvHisto[] = [];

function ajouterJours(iso: string, n: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function bornesPeriode(p: Periode): { from: string; to: string } {
  if (p === "tout" || p === "perso") return { from: "", to: "" };
  const auj = jourConakry(new Date());
  if (!auj) return { from: "", to: "" };
  if (p === "aujourdhui") return { from: auj, to: auj };
  if (p === "7j") return { from: ajouterJours(auj, -6), to: auj };
  if (p === "30j") return { from: ajouterJours(auj, -29), to: auj };
  return { from: `${auj.slice(0, 8)}01`, to: auj };
}

function actionsPour(r: RdvHisto): ActionsLigne {
  if (r.presence_status === "absent" || r.statut === "annule") return "annule";
  if (r.statut === "termine") return "termine";
  return "attente";
}

function Coche({ color }: { color: string }) {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>;
}

export function RdvPasseTab({ onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const ui = toUiTokens(C);

  const [res, setRes] = useState<{ cle: string; rdvs: RdvHisto[]; erreur: boolean } | null>(null);
  const [essai, setEssai] = useState(0);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [periode, setPeriode] = useState<Periode>("tout");
  const [preset, setPreset] = useState({ from: "", to: "" });
  const [texteFrom, setTexteFrom] = useState("");
  const [texteTo, setTexteTo] = useState("");
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [statutFiltre, setStatutFiltre] = useState<StatutFiltre>("tous");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [reglagesOpen, setReglagesOpen] = useState(false);
  const [filtresMobile, setFiltresMobile] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openSuivi, setOpenSuivi] = useState<string | null>(null);
  const [suiviText, setSuiviText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailRdv, setDetailRdv] = useState<RdvHisto | null>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const reglagesBtn = useRef<HTMLButtonElement>(null);

  // Dates effectives : presets calculés au clic (Conakry), champs libres validés ici.
  const isoFromPerso = jmaVersIso(texteFrom);
  const isoToPerso = jmaVersIso(texteTo);
  const dateFrom = periode === "perso" ? isoFromPerso : preset.from;
  const dateTo = periode === "perso" ? isoToPerso : preset.to;
  const erreurFrom = periode === "perso" && texteFrom.length > 0 && !isoFromPerso ? "Date invalide (jj/mm/aaaa)" : null;
  const erreurTo = periode === "perso" && texteTo.length > 0 && !isoToPerso ? "Date invalide (jj/mm/aaaa)" : null;
  const erreurOrdre = dateFrom && dateTo && dateFrom > dateTo ? "La date de début dépasse la date de fin" : null;

  const cle = `${dateFrom}|${dateTo}|${qDeb}|${essai}`;
  const loading = res?.cle !== cle;
  const erreur = !loading && res?.erreur === true;
  const rdvs = res?.rdvs ?? VIDE;

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let annule = false;
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (qDeb) params.set("q", qDeb);
    (async () => {
      try {
        const r = await fetch(`/api/institution/rdv-historique?${params.toString()}`);
        const j = await r.json().catch(() => null);
        if (annule) return;
        setRes(r.ok ? { cle, rdvs: j?.rdvs ?? [], erreur: false } : { cle, rdvs: [], erreur: true });
      } catch {
        if (!annule) setRes({ cle, rdvs: [], erreur: true });
      }
    })();
    return () => { annule = true; };
  }, [cle, dateFrom, dateTo, qDeb]);

  const counts = useMemo(() => {
    const c: Record<StatutFiltre, number> = { tous: rdvs.length, en_cours: 0, termine: 0, annule: 0, absent: 0 };
    for (const r of rdvs) {
      if (r.presence_status === "absent") c.absent++;
      else if (r.statut === "termine") c.termine++;
      else if (r.statut === "annule") c.annule++;
      else if (STATUTS_EN_COURS.includes(r.statut)) c.en_cours++;
    }
    return c;
  }, [rdvs]);

  const filtered = useMemo(() => {
    let list = rdvs;
    if (statutFiltre === "absent") list = list.filter(r => r.presence_status === "absent");
    else if (statutFiltre === "en_cours") list = list.filter(r => r.presence_status !== "absent" && STATUTS_EN_COURS.includes(r.statut));
    else if (statutFiltre !== "tous") list = list.filter(r => r.presence_status !== "absent" && r.statut === statutFiltre);
    return [...list].sort((a, b) => sortBy === "recent"
      ? (b.date_rdv + b.heure_rdv).localeCompare(a.date_rdv + a.heure_rdv)
      : (a.date_rdv + a.heure_rdv).localeCompare(b.date_rdv + b.heure_rdv));
  }, [rdvs, statutFiltre, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const filtresActifs = (periode !== "tout" ? 1 : 0) + (statutFiltre !== "tous" ? 1 : 0) + (q ? 1 : 0);

  function choisirPeriode(p: Periode) {
    setPage(1);
    if (periode === p) { setPeriode("tout"); setPreset({ from: "", to: "" }); return; }
    if (p === "perso") {
      // Les champs partent des bornes courantes pour ne pas perdre le filtre déjà posé.
      setTexteFrom(isoVersJma(dateFrom)); setTexteTo(isoVersJma(dateTo));
    }
    setPeriode(p);
    setPreset(bornesPeriode(p));
  }
  function reinitialiser() {
    setPeriode("tout"); setPreset({ from: "", to: "" }); setTexteFrom(""); setTexteTo("");
    setQ(""); setQDeb(""); setStatutFiltre("tous"); setPage(1);
  }
  function allerPage(p: number) {
    setPage(p);
    listeRef.current?.scrollIntoView({ block: "start" });
  }

  async function saveSuivi(rdvId: string) {
    setBusyId(rdvId);
    const res2 = await fetch("/api/institution/rdv-historique", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rdv_id: rdvId, notes: suiviText }),
    });
    const j = await res2.json().catch(() => null);
    setBusyId(null);
    if (!res2.ok) { onToast(j?.error || "Erreur de sauvegarde", C.red); return; }
    setRes(prev => prev ? { ...prev, rdvs: prev.rdvs.map(r => r.id === rdvId ? { ...r, notes: suiviText } : r) } : prev);
    setOpenSuivi(null);
    onToast("Suivi enregistré", C.purple);
  }

  async function envoyerRappel(rdvId: string) {
    setBusyId(rdvId);
    const res2 = await fetch("/api/institution/rdv-historique", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rdv_id: rdvId }),
    });
    const j = await res2.json().catch(() => null);
    setBusyId(null);
    if (!res2.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    onToast("Rappel envoyé au client", C.green);
  }

  async function exportCsv() {
    if (!filtered.length) { onToast("Aucun rendez-vous à exporter", C.orange); return; }
    // Export serveur (lib/export) : on envoie les identifiants des lignes AFFICHÉES, dans
    // l'ordre de l'écran ; le serveur relit, masque le téléphone selon le rôle, enregistre
    // et signe le document.
    setExportEnCours(true);
    const r = await telechargerExportServeur("/api/institution/rdv-historique/export", { ecran: "rdv_passes", ids: filtered.map(x => x.id) }, "rdv_passes.csv");
    setExportEnCours(false);
    onToast(r.texte, r.ok ? C.green : C.red);
  }

  const champ = { backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.t1, fontSize: "13px" } as const;
  const aucunFiltre = rdvs.length === 0 && filtresActifs === 0;

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <RdvPasseStyles/>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>

        {/* En-tête */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.3px", margin: 0 }}>Rendez-vous passés</h1>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  aria-label="À propos de cet historique"
                  aria-describedby={infoOpen ? "rdvp-info" : undefined}
                  onClick={() => setInfoOpen(o => !o)}
                  onMouseEnter={() => setInfoOpen(true)} onMouseLeave={() => setInfoOpen(false)}
                  onFocus={() => setInfoOpen(true)} onBlur={() => setInfoOpen(false)}
                  onKeyDown={e => { if (e.key === "Escape") setInfoOpen(false); }}
                  className="yelen-focus-ring"
                  style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </button>
                {infoOpen && <div id="rdvp-info" role="tooltip" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20, whiteSpace: "nowrap", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "6px 10px", color: C.t1, fontSize: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>Historique en lecture seule</div>}
              </div>
            </div>
            <p style={{ color: C.t2, fontSize: "13px", margin: "4px 0 0", lineHeight: 1.5 }}>Historique des rendez-vous passés, relances et suivis.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <HelpCenterGuide tab="rdv-historique" />
            <Button
              tokens={ui}
              className="rdvp-btn yelen-focus-ring"
              variant="secondary"
              size="md"
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              loading={exportEnCours}
              onClick={exportCsv}
            >
              Exporter CSV
            </Button>
          </div>
        </div>

        {/* Barre d'outils */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <div style={{ position: "relative", flex: "1 1 280px", minWidth: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <label htmlFor="rdvp-recherche" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Rechercher un client</label>
            <input id="rdvp-recherche" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Rechercher un client (nom, téléphone, référence…)" className="yelen-focus-ring" style={{ ...champ, width: "100%", height: "40px", paddingLeft: "36px", paddingRight: "12px" }}/>
          </div>
          <button type="button" onClick={() => setFiltresMobile(o => !o)} aria-expanded={filtresMobile} aria-controls="rdvp-filtres" className="rdvp-filtres-btn rdvp-btn yelen-focus-ring" style={{ ...champ, height: "44px", padding: "0 14px", alignItems: "center", gap: "8px", fontWeight: 600, cursor: "pointer" }}>
            Filtres{filtresActifs > 0 ? ` (${filtresActifs})` : ""}
          </button>
          <div className="rdvp-filtres" data-open={filtresMobile} style={{ display: "contents" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
              <label htmlFor="rdvp-tri" style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>Trier par</label>
              <select id="rdvp-tri" value={sortBy} onChange={e => { setSortBy(e.target.value as SortBy); setPage(1); }} className="yelen-focus-ring" style={{ ...champ, height: "40px", padding: "0 10px", fontWeight: 600 }}>
                <option value="recent">Date (récent)</option>
                <option value="ancien">Date (ancien)</option>
              </select>
              <div style={{ position: "relative" }}>
                <button
                  ref={reglagesBtn}
                  type="button"
                  onClick={() => setReglagesOpen(o => !o)}
                  onKeyDown={e => { if (e.key === "Escape") { setReglagesOpen(false); reglagesBtn.current?.focus(); } }}
                  aria-label="Réglages d'affichage"
                  aria-haspopup="dialog"
                  aria-expanded={reglagesOpen}
                  className="rdvp-icobtn yelen-focus-ring"
                  style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: C.bgCard, border: `1px solid ${reglagesOpen ? C.gold : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
                {reglagesOpen && (
                  <>
                    <div onClick={() => setReglagesOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
                    <div role="dialog" aria-label="Réglages d'affichage" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", padding: "14px", width: "190px" }}>
                      <label htmlFor="rdvp-lignes-reglage" style={{ display: "block", color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>Lignes par page</label>
                      <select id="rdvp-lignes-reglage" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="yelen-focus-ring" style={{ ...champ, width: "100%", height: "36px", padding: "0 10px", fontWeight: 600 }}>
                        {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div id="rdvp-filtres" className="rdvp-filtres" data-open={filtresMobile} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div role="group" aria-label="Période" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {PERIODES.map(p => {
              const actif = periode === p.key;
              return (
                <button key={p.key} type="button" aria-pressed={actif} onClick={() => choisirPeriode(p.key)} className="rdvp-chip yelen-focus-ring" style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: actif ? `${C.gold}1F` : C.bgCard, border: `1px solid ${actif ? C.gold : C.border}`, borderRadius: "999px", padding: "0 12px", color: C.t1, fontSize: "12.5px", fontWeight: actif ? 600 : 500, cursor: "pointer" }}>
                  {actif && <Coche color={C.gold}/>}{p.label}
                </button>
              );
            })}
          </div>
          <span aria-hidden="true" style={{ width: "1px", height: "20px", backgroundColor: C.border2, margin: "0 4px" }}/>
          <div role="group" aria-label="Statut" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {STATUTS.map(s => {
              const actif = statutFiltre === s.key;
              return (
                <button key={s.key} type="button" aria-pressed={actif} onClick={() => { setStatutFiltre(s.key); setPage(1); }} className="rdvp-chip yelen-focus-ring" style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: actif ? `${C.gold}1F` : C.bgCard, border: `1px solid ${actif ? C.gold : C.border}`, borderRadius: "999px", padding: "0 12px", color: C.t1, fontSize: "12.5px", fontWeight: actif ? 600 : 500, cursor: "pointer" }}>
                  {actif && <Coche color={C.gold}/>}{s.label}
                  <span style={{ color: C.t2, fontVariantNumeric: "tabular-nums", fontSize: "12px" }}>{counts[s.key]}</span>
                </button>
              );
            })}
          </div>
          {filtresActifs > 0 && (
            <button type="button" onClick={reinitialiser} className="rdvp-chip yelen-focus-ring" style={{ background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 600, textDecoration: "underline", cursor: "pointer", padding: "0 6px" }}>Réinitialiser les filtres</button>
          )}
        </div>

        {periode === "perso" && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
            <ChampDate C={C} id="rdvp-du" libelle="Du" texte={texteFrom} onTexte={t => { setTexteFrom(t); setPage(1); }} erreur={erreurFrom}/>
            <ChampDate C={C} id="rdvp-au" libelle="Au" texte={texteTo} onTexte={t => { setTexteTo(t); setPage(1); }} erreur={erreurTo ?? erreurOrdre}/>
          </div>
        )}

        {/* Liste */}
        <div ref={listeRef} style={{ scrollMarginTop: "16px" }}>
          <h2 className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Liste des rendez-vous passés</h2>
          <div aria-live="polite" style={{ minHeight: 0 }}>
            {!loading && !erreur && rdvs.length >= PLAFOND_API && (
              <p style={{ color: C.t2, fontSize: "12.5px", margin: "0 0 10px" }}>{PLAFOND_API} plus récents affichés. Affinez la période pour voir les plus anciens.</p>
            )}
          </div>

          {loading ? (
            <SqueletteLignes C={C} n={Math.min(pageSize, 6)}/>
          ) : erreur ? (
            <Card tokens={toCardTokens(C)} padding="40px 20px" style={{ textAlign: "center" }}>
              <p role="alert" style={{ color: C.t1, fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>Historique indisponible</p>
              <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 14px" }}>Le chargement a échoué. Vérifiez votre connexion puis réessayez.</p>
              <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="secondary" size="md" onClick={() => setEssai(n => n + 1)}>Réessayer</Button>
            </Card>
          ) : filtered.length === 0 ? (
            <Card tokens={toCardTokens(C)} padding={aucunFiltre ? "12px" : "40px 20px"} style={{ textAlign: "center" }}>
              {aucunFiltre ? (
                <EmptyState
                  variant="historique"
                  title="Votre historique commence ici"
                  message="Une fois vos premiers rendez-vous terminés, ils apparaîtront ici avec tout ce qu'il faut pour organiser vos relances et suivis."
                  color={C.gold}
                  titleColor={C.t1}
                  textColor={C.t2}
                />
              ) : (
                <>
                  <p style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: "0 0 12px" }}>Aucun rendez-vous pour ces filtres</p>
                  <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="secondary" size="md" onClick={reinitialiser}>Réinitialiser les filtres</Button>
                </>
              )}
            </Card>
          ) : (
            <>
              <EnteteColonnes C={C}/>
              <ul className="rdvp-list" role="list">
                {paged.map(r => (
                  <RdvLigne
                    key={r.id}
                    C={C}
                    r={r}
                    actions={actionsPour(r)}
                    busy={busyId === r.id}
                    suiviOuvert={openSuivi === r.id}
                    suiviText={suiviText}
                    onSuiviText={setSuiviText}
                    onSuiviToggle={() => { setOpenSuivi(openSuivi === r.id ? null : r.id); setSuiviText(r.notes || ""); }}
                    onSuiviSave={() => saveSuivi(r.id)}
                    onSuiviCancel={() => setOpenSuivi(null)}
                    onRappel={() => envoyerRappel(r.id)}
                    onDetails={() => setDetailRdv(r)}
                    onCopier={() => { navigator.clipboard?.writeText(r.reference); onToast("Référence copiée", C.gold); }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Pagination */}
        {!loading && !erreur && filtered.length > 0 && (
          <nav aria-label="Pagination" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginTop: "18px" }}>
            <span style={{ color: C.t2, fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
              {(pageSafe - 1) * pageSize + 1} à {Math.min(pageSafe * pageSize, filtered.length)} sur {filtered.length} rendez-vous
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button type="button" aria-label="Page précédente" onClick={() => allerPage(Math.max(1, pageSafe - 1))} disabled={pageSafe <= 1} className="rdvp-icobtn yelen-focus-ring" style={{ width: "36px", height: "36px", borderRadius: "10px", border: `1px solid ${C.border}`, backgroundColor: C.bgCard, color: C.t1, cursor: pageSafe <= 1 ? "default" : "pointer", opacity: pageSafe <= 1 ? 0.4 : 1 }}>‹</button>
              {(() => {
                const pages: (number | "…")[] = [];
                for (let p = 1; p <= totalPages; p++) {
                  if (p === 1 || p === totalPages || Math.abs(p - pageSafe) <= 1) pages.push(p);
                  else if (pages[pages.length - 1] !== "…") pages.push("…");
                }
                return pages.map((p, i) => p === "…" ? (
                  <span key={`e${i}`} aria-hidden="true" style={{ color: C.t2, fontSize: "12px", padding: "0 4px" }}>…</span>
                ) : (
                  <button key={p} type="button" aria-label={`Page ${p}`} aria-current={p === pageSafe ? "page" : undefined} onClick={() => allerPage(p)} className="rdvp-icobtn yelen-focus-ring" style={{ minWidth: "36px", height: "36px", borderRadius: "10px", backgroundColor: p === pageSafe ? C.gold : C.bgCard, color: p === pageSafe ? "#000" : C.t1, border: `1px solid ${p === pageSafe ? C.gold : C.border}`, fontSize: "12.5px", fontWeight: p === pageSafe ? 700 : 500, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{p}</button>
                ));
              })()}
              <button type="button" aria-label="Page suivante" onClick={() => allerPage(Math.min(totalPages, pageSafe + 1))} disabled={pageSafe >= totalPages} className="rdvp-icobtn yelen-focus-ring" style={{ width: "36px", height: "36px", borderRadius: "10px", border: `1px solid ${C.border}`, backgroundColor: C.bgCard, color: C.t1, cursor: pageSafe >= totalPages ? "default" : "pointer", opacity: pageSafe >= totalPages ? 0.4 : 1 }}>›</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label htmlFor="rdvp-lignes" style={{ color: C.t2, fontSize: "12.5px" }}>Lignes par page</label>
              <select id="rdvp-lignes" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="yelen-focus-ring" style={{ ...champ, height: "36px", padding: "0 10px", fontWeight: 600 }}>
                {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </nav>
        )}

        {detailRdv && <DetailRdvModal C={C} r={detailRdv} onClose={() => setDetailRdv(null)}/>}
      </div>
    </div>
  );
}
