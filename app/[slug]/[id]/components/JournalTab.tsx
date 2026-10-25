"use client";

// Journal d'activité — traçabilité par membre (migration 20260715000001).
// Visible par les rôles ayant journal.read (admin, superviseur, dirigeant en
// lecture seule — cf. lib/institutionPermissions.ts). Refonte 24/10/2026
// (frontend uniquement) : l'état et les appels API restent ici, les briques
// d'affichage sont dans JournalUi.tsx et la fiche de détail dans
// JournalFiche.tsx. Fuseau d'affichage et de filtrage : Conakry (UTC+0).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { ROLE_LABELS } from "@/lib/institutionPermissions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HelpCenterGuide } from "./HelpCenterGuide";
import { jourConakry, libelleRelatif, libelleSeparateurJour, dateHeureComplete } from "@/lib/heure";
import {
  CATEGORIES, ChampDate, Icon, KpiCarte, LigneJournal, MEMBRE_ROLES, MenuPopover, NIVEAUX, PLATEFORMES, PuceChoix,
  SqueletteLignes, libelleLigne, styleChamp,
  type Entree, type MembreEquipe, type Resume, type Stats,
} from "./JournalUi";
import { JournalFiche } from "./JournalFiche";

const LIMIT = 50;
const JOUR_MS = 24 * 60 * 60 * 1000;

type Periode = "tout" | "auj" | "hier" | "7j" | "30j" | "perso";
const PERIODES: { value: Periode; label: string }[] = [
  { value: "auj", label: "Aujourd'hui" },
  { value: "hier", label: "Hier" },
  { value: "7j", label: "7 jours" },
  { value: "30j", label: "30 jours" },
  { value: "tout", label: "Toutes les dates" },
  { value: "perso", label: "Personnalisé" },
];
const LIBELLE_PERIODE: Record<Periode, string> = {
  tout: "Toutes les dates", auj: "Aujourd'hui", hier: "Hier", "7j": "7 jours", "30j": "30 jours", perso: "Période personnalisée",
};

const FORMATS_EXPORT = [
  { format: "csv", label: "CSV" },
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "json", label: "JSON" },
  { format: "pdf", label: "PDF" },
  { format: "certifie", label: "Rapport certifié (référence + empreinte)" },
] as const;
type FormatExport = (typeof FORMATS_EXPORT)[number]["format"];

const SR_ONLY: React.CSSProperties = { position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

// Phrases du résumé reconstruites depuis les compteurs renvoyés par l'API
// (les règles réelles : actions critiques/à surveiller selon scoreRisque,
// connexions entre 22 h et 6 h UTC = heure de Conakry).
function phrasesResume(r: Resume): string[] {
  const s = (n: number) => (n > 1 ? "s" : "");
  const out: string[] = [
    r.total === 0 ? "Aucune activité enregistrée aujourd'hui." : `${r.total} action${s(r.total)} enregistrée${s(r.total)} aujourd'hui.`,
  ];
  if (r.critiques === 0 && r.a_surveiller === 0 && r.hors_horaires === 0) {
    out.push("Aucun événement à surveiller aujourd'hui.");
    return out;
  }
  if (r.critiques > 0) out.push(`${r.critiques} action${s(r.critiques)} critique${s(r.critiques)} à vérifier.`);
  if (r.a_surveiller > 0) out.push(`${r.a_surveiller} action${s(r.a_surveiller)} à surveiller.`);
  if (r.hors_horaires > 0) out.push(`${r.hors_horaires} connexion${s(r.hors_horaires)} hors horaires habituels, entre 10 h PM et 6 h AM (heure de Conakry).`);
  return out;
}

export function JournalTab({ instId, onToast, active = true }: { instId: string; onToast: (msg: string, color?: string) => void; active?: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  // Vrai pour les rôles sans « journal.voir_ip » (dirigeant) : l'API renvoie ip/user_agent à null.
  const [ipMasquee, setIpMasquee] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [categorie, setCategorie] = useState("");
  const [membreFiltre, setMembreFiltre] = useState("");
  const [niveau, setNiveau] = useState("");
  const [plateforme, setPlateforme] = useState("");
  const [role, setRole] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [periode, setPeriode] = useState<Periode>("tout");
  const [erreurPeriode, setErreurPeriode] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Entree | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [membresEquipe, setMembresEquipe] = useState<MembreEquipe[]>([]);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const requete = useRef(0);
  const refListe = useRef<HTMLDivElement>(null);

  // Journée de Conakry = UTC+0 : les bornes de jour sont des instants UTC.
  // date_to doit être la FIN de journée, sinon le serveur (created_at <= date)
  // exclut presque toute la dernière journée.
  const construireParams = useCallback(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", `${dateFrom}T00:00:00.000Z`);
    if (dateTo) params.set("date_to", `${dateTo}T23:59:59.999Z`);
    if (categorie) params.set("categorie", categorie);
    if (membreFiltre) params.set("membre_id", membreFiltre);
    if (niveau) params.set("niveau", niveau);
    if (plateforme) params.set("plateforme", plateforme);
    if (role) params.set("role", role);
    if (q.trim()) params.set("q", q.trim());
    return params;
  }, [dateFrom, dateTo, categorie, membreFiltre, niveau, plateforme, role, q]);

  const load = useCallback(async (silencieux = false) => {
    const id = ++requete.current;
    if (!silencieux) { setChargement(true); setErreur(false); setMessageErreur(null); }
    const params = construireParams();
    params.set("limit", String(LIMIT));
    params.set("offset", String(offset));
    try {
      const res = await fetch(`/api/institution/journal?${params.toString()}`);
      if (id !== requete.current) return;
      if (res.status === 403) { setForbidden(true); return; }
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) {
        if (!silencieux) {
          setErreur(true);
          if (res.status === 400 && typeof j?.error === "string") setMessageErreur(j.error);
        }
        return;
      }
      setIpMasquee(Boolean(j.ip_masquee));
      setEntrees(j.entrees ?? []);
      setTotal(j.total ?? 0);
      setErreur(false);
      setMaintenant(Date.now());
    } catch {
      if (id === requete.current && !silencieux) setErreur(true);
    } finally {
      if (id === requete.current && !silencieux) setChargement(false);
    }
  }, [construireParams, offset]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/journal/stats");
      if (!res.ok) return;
      const j = await res.json().catch(() => null);
      if (j) setStats(j);
    } catch { /* indicateurs facultatifs : l'écran reste utilisable */ }
  }, []);

  const loadResume = useCallback(async () => {
    try {
      const res = await fetch("/api/institution/journal/resume");
      if (!res.ok) return;
      const j = await res.json().catch(() => null);
      if (j) setResume(j);
    } catch { /* résumé facultatif */ }
  }, []);

  useEffect(() => { load(); }, [load, instId]);
  useEffect(() => { loadStats(); }, [loadStats, instId]);
  useEffect(() => { loadResume(); }, [loadResume, instId]);

  // Filet de sécurité périodique : journal_activite n'a aucune policy RLS, le
  // canal Realtime ne peut pas s'y abonner (signalé le 18/07/2026). Suspendu
  // pendant qu'une fiche est ouverte. Silencieux : jamais de spinner.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (!selected) { load(true); loadStats(); loadResume(); }
    }, 30000);
    return () => clearInterval(interval);
  }, [active, load, loadStats, loadResume, selected]);

  // Les libellés « il y a X min » restent à jour entre deux chargements.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setMaintenant(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [active]);

  useEffect(() => {
    let annule = false;
    fetch("/api/institution/membres")
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!annule && j?.membres) setMembresEquipe(j.membres); })
      .catch(() => {});
    return () => { annule = true; };
  }, [instId]);

  function appliquerPeriode(p: Periode) {
    setErreurPeriode(null);
    setOffset(0);
    setPeriode(p);
    const aujourdhui = jourConakry(new Date());
    if (p === "tout") { setDateFrom(""); setDateTo(""); }
    else if (p === "auj") { setDateFrom(aujourdhui); setDateTo(aujourdhui); }
    else if (p === "hier") { const h = jourConakry(new Date(Date.now() - JOUR_MS)); setDateFrom(h); setDateTo(h); }
    else if (p === "7j") { setDateFrom(jourConakry(new Date(Date.now() - 7 * JOUR_MS))); setDateTo(aujourdhui); }
    else if (p === "30j") { setDateFrom(jourConakry(new Date(Date.now() - 30 * JOUR_MS))); setDateTo(aujourdhui); }
  }
  function validerDebut(iso: string) {
    if (dateTo && iso > dateTo) { setErreurPeriode("La date de début doit précéder la date de fin."); return; }
    setErreurPeriode(null); setPeriode("perso"); setDateFrom(iso); setOffset(0);
  }
  function validerFin(iso: string) {
    if (dateFrom && iso < dateFrom) { setErreurPeriode("La date de fin doit suivre la date de début."); return; }
    setErreurPeriode(null); setPeriode("perso"); setDateTo(iso); setOffset(0);
  }
  function effacerDebut() { setErreurPeriode(null); setDateFrom(""); setOffset(0); }
  function effacerFin() { setErreurPeriode(null); setDateTo(""); setOffset(0); }

  function filtrerConnexions() { appliquerPeriode("auj"); setCategorie("authentification"); }
  function filtrerExports() { appliquerPeriode("7j"); setCategorie("journal"); }
  function appliquerRecherche() { setQ(qDraft); setOffset(0); }
  function effacerRecherche() { setQDraft(""); setQ(""); setOffset(0); }

  function reinitialiser() {
    setCategorie(""); setNiveau(""); setPlateforme(""); setRole(""); setMembreFiltre("");
    setQDraft(""); setQ(""); setDateFrom(""); setDateTo(""); setPeriode("tout"); setErreurPeriode(null); setOffset(0);
  }

  function changerPage(nouvelOffset: number) {
    setOffset(nouvelOffset);
    const reduit = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    refListe.current?.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
  }

  const roleParMembre = useMemo(() => {
    const m = new Map<string, string>();
    membresEquipe.forEach(mm => { if (mm.role) m.set(mm.id, mm.role); });
    return m;
  }, [membresEquipe]);

  function roleLabelDe(e: Entree): string | null {
    const r = e.membre_id ? roleParMembre.get(e.membre_id) : undefined;
    return r && r in ROLE_LABELS ? ROLE_LABELS[r as keyof typeof ROLE_LABELS] : null;
  }

  const groupes = useMemo(() => {
    const ref = new Date(maintenant);
    const map = new Map<string, { label: string; items: Entree[] }>();
    for (const e of entrees) {
      const cle = jourConakry(e.created_at);
      const g = map.get(cle) ?? { label: libelleSeparateurJour(e.created_at, ref), items: [] };
      g.items.push(e);
      map.set(cle, g);
    }
    return [...map.entries()];
  }, [entrees, maintenant]);

  const copierRef = useCallback((e: Entree) => {
    navigator.clipboard?.writeText(e.audit_id)
      .then(() => onToast("Référence copiée", C.green))
      .catch(() => onToast("Impossible de copier", C.red));
  }, [onToast, C.green, C.red]);

  // Contenu partagé : auteur, action, référence et date — ni IP, ni cible, ni valeurs.
  const partager = useCallback(async (e: Entree) => {
    const texte = `${e.membre_nom} — ${libelleLigne(e)} — ${e.audit_id} (${dateHeureComplete(e.created_at)})`;
    if (navigator.share) {
      try { await navigator.share({ text: texte }); } catch { /* annulé par l'utilisateur */ }
    } else {
      navigator.clipboard?.writeText(texte)
        .then(() => onToast("Résumé copié", C.green))
        .catch(() => onToast("Impossible de copier", C.red));
    }
  }, [onToast, C.green, C.red]);

  const fermerFiche = useCallback(() => setSelected(null), []);

  // Export serveur : mêmes filtres que la liste, jusqu'à 5000 lignes.
  async function exporterServeur(format: FormatExport) {
    setExportEnCours(true);
    const params = construireParams();
    params.set("format", format);
    try {
      const res = await fetch(`/api/institution/journal/export?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        onToast(j?.error || "Erreur lors de l'export", C.red);
        return;
      }
      const empreinte = res.headers.get("X-Empreinte-Sha256");
      const tronque = res.headers.get("X-Export-Tronque") === "true";
      const disposition = res.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `journal_activite.${format === "certifie" ? "xlsx" : format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      a.click(); URL.revokeObjectURL(url);
      const suffixe = tronque ? " (tronqué aux 5000 entrées les plus récentes — affinez les filtres pour un extrait complet)" : "";
      const reference = res.headers.get("X-Export-Reference");
      const nature = format === "certifie" ? "Rapport certifié" : "Export";
      onToast(
        empreinte ? `${nature} ${reference ?? ""} généré — empreinte SHA-256 : ${empreinte.slice(0, 16)}…${suffixe}`.replace("  ", " ") : `Export réussi${suffixe}`,
        tronque ? C.orange : C.green,
      );
      loadStats();
    } catch {
      onToast("Erreur réseau lors de l'export", C.red);
    } finally {
      setExportEnCours(false);
    }
  }

  // Filtres actifs (hors période) → puces retirables + compteur du bouton.
  const nbFiltresPanneau = [categorie, niveau, plateforme, role, membreFiltre].filter(Boolean).length;
  const membreNom = membresEquipe.find(m => m.id === membreFiltre);
  const actifs: { cle: string; label: string; retirer: () => void }[] = [];
  if (periode !== "tout") actifs.push({ cle: "periode", label: LIBELLE_PERIODE[periode], retirer: () => appliquerPeriode("tout") });
  if (categorie) actifs.push({ cle: "categorie", label: `Catégorie : ${CATEGORIES.find(c => c.value === categorie)?.label ?? categorie}`, retirer: () => { setCategorie(""); setOffset(0); } });
  if (niveau) actifs.push({ cle: "niveau", label: `Niveau : ${NIVEAUX.find(n => n.value === niveau)?.label ?? niveau}`, retirer: () => { setNiveau(""); setOffset(0); } });
  if (plateforme) actifs.push({ cle: "plateforme", label: `Plateforme : ${PLATEFORMES.find(p => p.value === plateforme)?.label ?? plateforme}`, retirer: () => { setPlateforme(""); setOffset(0); } });
  if (role) actifs.push({ cle: "role", label: `Rôle : ${role in ROLE_LABELS ? ROLE_LABELS[role as keyof typeof ROLE_LABELS] : role}`, retirer: () => { setRole(""); setOffset(0); } });
  if (membreFiltre) actifs.push({ cle: "membre", label: `Personne : ${membreNom ? `${membreNom.prenom} ${membreNom.nom}` : "sélectionnée"}`, retirer: () => { setMembreFiltre(""); setOffset(0); } });
  if (q.trim()) actifs.push({ cle: "q", label: `Recherche : ${q.trim()}`, retirer: effacerRecherche });

  if (forbidden) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Cet écran est réservé aux administrateurs de l&apos;institution.</p>
      </div>
    );
  }

  const kpis = [
    { label: "Aujourd'hui", valeur: stats?.actions_aujourdhui ?? "—", couleur: C.gold, onClick: () => appliquerPeriode("auj") },
    { label: "7 derniers jours", valeur: stats?.actions_semaine ?? "—", couleur: C.blue, onClick: () => appliquerPeriode("7j") },
    { label: "Membres actifs dans l'équipe", valeur: stats?.membres_actifs ?? "—", couleur: C.teal, onClick: undefined },
    { label: "Connexions aujourd'hui", valeur: stats?.connexions ?? "—", couleur: C.purple, onClick: filtrerConnexions },
    { label: "Erreurs et alertes (7 j)", valeur: stats?.alertes_securite ?? "—", couleur: C.orange, onClick: undefined },
    { label: "Actions critiques aujourd'hui", valeur: stats?.actions_critiques ?? "—", couleur: C.red, onClick: undefined },
    { label: "Exports (7 j)", valeur: stats?.exportations ?? "—", couleur: C.t2, onClick: filtrerExports },
    { label: "Dernière activité", valeur: stats?.derniere_synchronisation ? libelleRelatif(new Date(stats.derniere_synchronisation), new Date(maintenant)) : "—", couleur: C.green, onClick: () => { load(); loadStats(); loadResume(); } },
  ];

  const finPage = Math.min(offset + LIMIT, total);
  const selectStyle = { ...styleChamp(C), cursor: "pointer" } as const;
  const libelleChamp = { display: "block", color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "4px" } as const;

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.15s ease" }}>
      <style>{`
        .jr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
        .jr-filtres-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
        .jr-dates{display:grid;grid-template-columns:repeat(2,minmax(0,220px));gap:12px}
        .jr-squelette{animation:jr-pulse 1.4s ease-in-out infinite}
        @keyframes jr-pulse{0%,100%{opacity:1}50%{opacity:.55}}
        @media (max-width:640px){
          .jr-puce{height:44px !important}
          .jr-cible-tactile{width:44px !important;height:44px !important}
          .jr-ligne-main{min-height:64px !important}
          .jr-btn,.jr-bouton{min-height:44px !important;height:auto}
          .jr-dates{grid-template-columns:1fr}
          .jr-recherche{flex-wrap:wrap}
          .jr-recherche > *{flex:1 1 100%}
        }
        @media (prefers-reduced-motion:reduce){.jr-squelette{animation:none}}
      `}</style>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 12px", marginBottom: "6px" }}>
          <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.4px", margin: 0 }}>Journal d&apos;activité</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <HelpCenterGuide tab="journal" />
            <MenuPopover C={C} minWidth={240}
              items={FORMATS_EXPORT.map(f => ({ label: f.label, onSelect: () => { void exporterServeur(f.format); } }))}
              renderTrigger={({ basculer, aria }) => (
                <button type="button" onClick={basculer} {...aria} disabled={exportEnCours} className="yelen-focus-ring jr-bouton"
                  style={{ ["--yelen-focus" as string]: C.gold, display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard2, color: C.t1, fontSize: "12px", fontWeight: 700, cursor: exportEnCours ? "default" : "pointer", opacity: exportEnCours ? 0.6 : 1, fontFamily: "inherit" }}>
                  <Icon name="file" size={14} color={C.t2}/>
                  {exportEnCours ? "Export en cours…" : "Exporter"}
                  <Icon name="chevronDown" size={12} color={C.t2}/>
                </button>
              )}/>
          </div>
        </div>
        <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 16px" }}>Traçabilité complète : qui a fait quoi, et quand, pour toute l&apos;équipe.</p>

        {resume && (
          <Card tokens={toCardTokens(C)} padding="14px 16px" style={{ marginBottom: "16px" }}>
            <section aria-labelledby="jr-resume-titre" style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "10px", backgroundColor: `${C.gold}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="spark" size={16} color={C.gold}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 id="jr-resume-titre" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: "0 0 4px" }}>Résumé du jour</h2>
                {phrasesResume(resume).map((phrase, i) => (
                  <p key={i} style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, margin: 0 }}>{phrase}</p>
                ))}
              </div>
            </section>
          </Card>
        )}

        <div className="jr-kpis" style={{ marginBottom: "16px" }}>
          {kpis.map(k => <KpiCarte key={k.label} C={C} label={k.label} valeur={k.valeur} couleur={k.couleur} onClick={k.onClick}/>)}
        </div>

        <form role="search" onSubmit={ev => { ev.preventDefault(); appliquerRecherche(); }} className="jr-recherche" style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <label htmlFor="jr-recherche" style={SR_ONLY}>Rechercher dans le journal</label>
            <span aria-hidden="true" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
              <Icon name="search" size={15} color={C.t2}/>
            </span>
            <input id="jr-recherche" type="search" value={qDraft} onChange={e => setQDraft(e.target.value)} className="yelen-focus-ring"
              placeholder={ipMasquee ? "Rechercher : nom, référence, cible…" : "Rechercher : nom, référence, IP, cible…"} autoComplete="off"
              style={{ ...styleChamp(C), paddingLeft: "36px", paddingRight: qDraft ? "40px" : "12px" }}/>
            {qDraft && (
              <button type="button" onClick={effacerRecherche} aria-label="Effacer la recherche" className="yelen-focus-ring"
                style={{ ["--yelen-focus" as string]: C.gold, position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "28px", height: "28px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Icon name="x" size={12} color={C.t2}/>
              </button>
            )}
          </div>
          <Button tokens={toUiTokens(C)} className="jr-btn" variant="primary" size="md" type="submit" icon={<Icon name="search" size={14} color="#000"/>}>Rechercher</Button>
        </form>

        <div role="group" aria-label="Période" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
          {PERIODES.map(p => (
            <PuceChoix key={p.value} C={C} actif={periode === p.value} onClick={() => appliquerPeriode(p.value)}>{p.label}</PuceChoix>
          ))}
          <button type="button" onClick={() => setFiltresOuverts(o => !o)} aria-expanded={filtresOuverts} aria-controls="jr-panneau-filtres" className="yelen-focus-ring jr-puce"
            style={{ ["--yelen-focus" as string]: C.gold, display: "inline-flex", alignItems: "center", gap: "6px", marginLeft: "auto", height: "32px", padding: "0 14px", borderRadius: "20px", border: `1px solid ${nbFiltresPanneau > 0 ? C.gold : C.border2}`, backgroundColor: C.bgCard, color: C.t1, fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name="sliders" size={14} color={C.t2}/>
            Filtres{nbFiltresPanneau > 0 ? ` (${nbFiltresPanneau})` : ""}
          </button>
        </div>

        {periode === "perso" && (
          <div className="jr-dates" style={{ marginBottom: "10px" }}>
            <ChampDate key={`debut-${dateFrom}`} C={C} label="Du" valeur={dateFrom} erreurExterne={erreurPeriode} onValider={validerDebut} onEffacer={effacerDebut}/>
            <ChampDate key={`fin-${dateTo}`} C={C} label="Au" valeur={dateTo} onValider={validerFin} onEffacer={effacerFin}/>
          </div>
        )}

        {filtresOuverts && (
          <div id="jr-panneau-filtres" role="group" aria-label="Filtres" className="jr-filtres-grille"
            style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px", marginBottom: "10px" }}>
            <div>
              <label htmlFor="jr-f-categorie" style={libelleChamp}>Catégorie</label>
              <select id="jr-f-categorie" value={categorie} onChange={e => { setCategorie(e.target.value); setOffset(0); }} className="yelen-focus-ring" style={selectStyle}>
                <option value="">Toutes les catégories</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="jr-f-niveau" style={libelleChamp}>Niveau</label>
              <select id="jr-f-niveau" value={niveau} onChange={e => { setNiveau(e.target.value); setOffset(0); }} className="yelen-focus-ring" style={selectStyle}>
                <option value="">Tous les niveaux</option>
                {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="jr-f-plateforme" style={libelleChamp}>Plateforme</label>
              <select id="jr-f-plateforme" value={plateforme} onChange={e => { setPlateforme(e.target.value); setOffset(0); }} className="yelen-focus-ring" style={selectStyle}>
                <option value="">Toutes les plateformes</option>
                {PLATEFORMES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="jr-f-role" style={libelleChamp}>Rôle</label>
              <select id="jr-f-role" value={role} onChange={e => { setRole(e.target.value); setOffset(0); }} className="yelen-focus-ring" style={selectStyle}>
                <option value="">Tous les rôles</option>
                {MEMBRE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            {membresEquipe.length > 1 && (
              <div>
                <label htmlFor="jr-f-membre" style={libelleChamp}>Personne</label>
                <select id="jr-f-membre" value={membreFiltre} onChange={e => { setMembreFiltre(e.target.value); setOffset(0); }} className="yelen-focus-ring" style={selectStyle}>
                  <option value="">Tout le monde</option>
                  {membresEquipe.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {actifs.length > 0 && (
          <div role="group" aria-label="Filtres actifs" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
            {actifs.map(a => (
              <span key={a.cle} style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: `${C.gold}14`, border: `1px solid ${C.gold}40`, borderRadius: "16px", padding: "2px 4px 2px 10px", color: C.t1, fontSize: "12px", fontWeight: 600 }}>
                {a.label}
                <button type="button" onClick={a.retirer} aria-label={`Retirer le filtre : ${a.label}`} className="yelen-focus-ring jr-cible-tactile"
                  style={{ ["--yelen-focus" as string]: C.gold, width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", cursor: "pointer" }}>
                  <Icon name="x" size={11} color={C.t2}/>
                </button>
              </span>
            ))}
            <button type="button" onClick={reinitialiser} className="yelen-focus-ring"
              style={{ ["--yelen-focus" as string]: C.gold, background: "none", border: "none", color: C.t1, fontSize: "12px", fontWeight: 600, textDecoration: "underline", cursor: "pointer", padding: "6px 4px", fontFamily: "inherit" }}>
              Réinitialiser
            </button>
          </div>
        )}

        <div ref={refListe} style={{ scrollMarginTop: "72px" }}>
          {erreur ? (
            <Card tokens={toCardTokens(C)} padding="40px 20px" style={{ textAlign: "center" }}>
              <div role="alert">
                <h2 style={{ color: C.t1, fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>{messageErreur ? "Recherche impossible" : "Journal indisponible"}</h2>
                <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 14px" }}>{messageErreur ?? "Les événements n'ont pas pu être chargés."}</p>
              </div>
              <Button tokens={toUiTokens(C)} className="jr-btn" variant="secondary" size="sm" onClick={() => { void load(); }}>Réessayer</Button>
            </Card>
          ) : chargement ? (
            <SqueletteLignes C={C}/>
          ) : entrees.length === 0 ? (
            <Card tokens={toCardTokens(C)} padding="40px 20px" style={{ textAlign: "center" }}>
              <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}><Icon name="inbox" size={32} color={C.t2}/></div>
              {actifs.length > 0 || total > 0 ? (
                <>
                  <p style={{ color: C.t1, fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>Aucune activité pour ces filtres</p>
                  <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 14px" }}>Essayez d&apos;élargir la période ou de retirer un filtre.</p>
                  <Button tokens={toUiTokens(C)} className="jr-btn" variant="secondary" size="sm" onClick={reinitialiser}>Réinitialiser</Button>
                </>
              ) : (
                <>
                  <p style={{ color: C.t1, fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>Aucune activité enregistrée pour l&apos;instant</p>
                  <p style={{ color: C.t2, fontSize: "13px", margin: 0 }}>Chaque action de votre équipe (RDV, documents, tâches…) apparaîtra ici automatiquement.</p>
                </>
              )}
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {groupes.map(([cle, g]) => (
                <section key={cle} aria-labelledby={`jr-jour-${cle}`}>
                  <h2 id={`jr-jour-${cle}`} style={{ position: "sticky", top: "calc(var(--header-h, 56px) + env(safe-area-inset-top))", zIndex: 5, backgroundColor: C.bg, color: C.t2, fontSize: "13px", fontWeight: 600, margin: "0 0 6px", padding: "6px 0" }}>{g.label}</h2>
                  <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                    {g.items.map(e => (
                      <LigneJournal key={e.id} C={C} e={e} roleLabel={roleLabelDe(e)} maintenant={maintenant}
                        onOuvrir={() => setSelected(e)} onCopier={() => copierRef(e)} onPartager={() => { void partager(e); }}/>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {total > 0 && !erreur && (
          <nav aria-label="Pagination du journal" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
            <span style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{`${Math.min(offset + 1, total)} à ${finPage} sur ${total}`}</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="jr-btn" variant="secondary" size="sm" ariaLabel="Page précédente" disabled={offset === 0 || chargement} onClick={() => changerPage(Math.max(0, offset - LIMIT))}>Précédent</Button>
              <Button tokens={toUiTokens(C)} className="jr-btn" variant="secondary" size="sm" ariaLabel="Page suivante" disabled={offset + LIMIT >= total || chargement} onClick={() => changerPage(offset + LIMIT)}>Suivant</Button>
            </div>
          </nav>
        )}
      </div>

      {selected && (
        <JournalFiche C={C} ipMasquee={ipMasquee} entree={selected} roleLabel={roleLabelDe(selected)} onClose={fermerFiche} onCopier={copierRef} onPartager={e => { void partager(e); }}/>
      )}
    </div>
  );
}
