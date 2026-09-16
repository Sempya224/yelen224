"use client";

// Onglet "Rendez-vous passés" — centre d'historique (spec CEO 16/07/2026,
// niveau Salesforce Health Cloud / Stripe Dashboard). 9 sections : titre,
// export, filtres période, recherche, statuts, tri, liste (cartes 4
// colonnes), pagination, lignes par page. Filtrage/tri/pagination faits
// côté client (une seule requête par changement de dates/recherche) pour que
// les compteurs de statut restent exacts quel que soit le badge actif.
// "Effectué"/"Honoré" du spec fusionnés en un seul badge "Terminé" — l'enum
// réel statut_rdv n'a qu'une seule valeur de complétion ("termine"),
// confirmé cette session ; les afficher séparés aurait montré deux filtres
// qui ne renvoient jamais rien (décision Bryan, 16/07/2026). "Absent" filtre
// sur presence_status, pas sur statut (même règle que le reste du dashboard).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { DEVISE_LABEL } from "@/lib/devise";

type RdvHisto = {
  id: string; objet: string | null; date_rdv: string; heure_rdv: string;
  statut: string; citoyen_id: string; citoyen_nom: string; citoyen_phone: string;
  notes: string | null; motif_annulation: string | null; created_at: string;
  presence_status: string | null; reference: string;
  service_nom: string | null; service_prix: number | null;
  derniere_action: string | null; agent_nom: string | null; derniere_action_le: string | null;
};

type StatutFiltre = "tous" | "termine" | "annule" | "absent";
type SortBy = "recent" | "ancien";

const STATUTS: { key: StatutFiltre; label: string; color: (C: ThemeTokens) => string; bg: (C: ThemeTokens) => string }[] = [
  { key: "tous",    label: "Tous",    color: C => C.gold,   bg: C => C.orangeL },
  { key: "termine", label: "Terminé", color: C => C.green,  bg: C => C.greenL },
  { key: "annule",  label: "Annulé",  color: C => C.red,    bg: C => C.redL },
  { key: "absent",  label: "Absent",  color: C => C.t2,     bg: C => C.bg3 },
];

const AVATAR_PALETTE = ["blue", "green", "purple", "orange", "teal", "red"] as const;
function avatarColor(nom: string, C: ThemeTokens): { c: string; bg: string } {
  let h = 0; for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  const key = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  const map: Record<string, { c: string; bg: string }> = {
    blue: { c: C.blue, bg: C.blueL }, green: { c: C.green, bg: C.greenL }, purple: { c: C.purple, bg: C.purpleL },
    orange: { c: C.orange, bg: C.orangeL }, teal: { c: C.teal, bg: C.tealL }, red: { c: C.red, bg: C.redL },
  };
  return map[key];
}

function statutBadge(r: RdvHisto, C: ThemeTokens): { c: string; bg: string; l: string } {
  if (r.presence_status === "absent") return { c: C.t2, bg: C.bg3, l: "Absent" };
  switch (r.statut) {
    case "confirme":   return { c: C.green,  bg: C.greenL,  l: "Confirmé" };
    case "en_attente": return { c: C.gold,   bg: `${C.gold}20`, l: "En attente" };
    case "nouveau":    return { c: C.gold,   bg: `${C.gold}20`, l: "Nouveau" };
    case "annule":     return { c: C.red,    bg: C.redL,    l: "Annulé" };
    case "termine":    return { c: C.green,  bg: C.greenL,  l: "Terminé" };
    default:           return { c: C.t2,     bg: C.bg3,     l: r.statut };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function formatPrix(p: number): string { return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL; }

export function RdvPasseTab({ onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [rdvs, setRdvs] = useState<RdvHisto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");
  const [statutFiltre, setStatutFiltre] = useState<StatutFiltre>("tous");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [reglagesOpen, setReglagesOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openSuivi, setOpenSuivi] = useState<string | null>(null);
  const [suiviText, setSuiviText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailRdv, setDetailRdv] = useState<RdvHisto | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (q) params.set("q", q);
    const res = await fetch(`/api/institution/rdv-historique?${params.toString()}`);
    const j = await res.json().catch(() => null);
    setRdvs(res.ok ? (j?.rdvs ?? []) : []);
    setLoading(false);
  }, [dateFrom, dateTo, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statutFiltre, dateFrom, dateTo, q, sortBy, pageSize]);

  const counts = useMemo(() => {
    const c: Record<StatutFiltre, number> = { tous: rdvs.length, termine: 0, annule: 0, absent: 0 };
    for (const r of rdvs) {
      if (r.presence_status === "absent") c.absent++;
      else if (r.statut === "termine") c.termine++;
      else if (r.statut === "annule") c.annule++;
    }
    return c;
  }, [rdvs]);

  const filtered = useMemo(() => {
    let list = rdvs;
    if (statutFiltre === "absent") list = list.filter(r => r.presence_status === "absent");
    else if (statutFiltre !== "tous") list = list.filter(r => r.presence_status !== "absent" && r.statut === statutFiltre);
    return [...list].sort((a, b) => sortBy === "recent"
      ? (b.date_rdv + b.heure_rdv).localeCompare(a.date_rdv + a.heure_rdv)
      : (a.date_rdv + a.heure_rdv).localeCompare(b.date_rdv + b.heure_rdv));
  }, [rdvs, statutFiltre, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  async function saveSuivi(rdvId: string) {
    setBusyId(rdvId);
    const res = await fetch("/api/institution/rdv-historique", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rdv_id: rdvId, notes: suiviText }),
    });
    const j = await res.json().catch(() => null);
    setBusyId(null);
    if (!res.ok) { onToast(j?.error || "Erreur de sauvegarde", C.red); return; }
    setRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, notes: suiviText } : r));
    setOpenSuivi(null);
    onToast("Suivi enregistré", C.purple);
  }

  async function envoyerRappel(rdvId: string) {
    setBusyId(rdvId);
    const res = await fetch("/api/institution/rdv-historique", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rdv_id: rdvId }),
    });
    const j = await res.json().catch(() => null);
    setBusyId(null);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    onToast("Rappel envoyé au client", C.green);
  }

  function exportCsv() {
    if (!filtered.length) { onToast("Aucun rendez-vous à exporter", C.orange); return; }
    const header = ["Référence", "Date", "Heure", "Client", "Téléphone", "Service/Objet", "Statut", "Motif annulation", "Suivi", "Agent", "Dernière action"];
    const rows = filtered.map(r => [r.reference, r.date_rdv, r.heure_rdv, r.citoyen_nom, r.citoyen_phone, r.service_nom || r.objet || "", statutBadge(r, C).l, r.motif_annulation || "", r.notes || "", r.agent_nom || "", r.derniere_action || ""]);
    const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rdv_passes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function actionsPour(r: RdvHisto): "attente" | "termine" | "annule" {
    if (r.presence_status === "absent" || r.statut === "annule") return "annule";
    if (r.statut === "termine") return "termine";
    return "attente";
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <style>{`
        .rdvp-card-grid{display:flex;flex-direction:column;gap:14px}
        .rdvp-actions{flex-direction:row}
        @media(min-width:1024px){
          .rdvp-card-grid{display:grid;grid-template-columns:1.3fr 1.5fr 1.3fr auto;gap:20px;align-items:center}
          .rdvp-actions{flex-direction:column;align-items:stretch}
        }
        .rdvp-card{transition:transform 150ms ease, box-shadow 150ms ease}
        .rdvp-card:hover{transform:translateY(-2px)}
      `}</style>

      {/* 1. Titre */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
        <h1 className="yelen-h1" style={{ color: C.t1 }}>Rendez-vous passés</h1>
        <div title="Historique en lecture seule" style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "6px" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </div>
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>Historique structuré de l&apos;activité passée — organisez vos relances et suivis.</p>

      {/* 2. Export */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <Button
          tokens={toUiTokens(C)}
          className="tap"
          variant="secondary"
          size="md"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
          onClick={exportCsv}
        >
          Exporter CSV
        </Button>
      </div>

      {/* 3. Filtres période */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
        <div>
          <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 700, marginBottom: "6px" }}>Du</div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: "100%", height: "48px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "0 12px", fontSize: "13px", color: C.t1 }}/>
        </div>
        <div>
          <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 700, marginBottom: "6px" }}>Au</div>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: "100%", height: "48px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "0 12px", fontSize: "13px", color: C.t1 }}/>
        </div>
      </div>

      {/* 4. Recherche */}
      <div style={{ position: "relative", marginBottom: "14px" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un client (nom, téléphone, référence…)" style={{ width: "100%", height: "48px", paddingLeft: "38px", paddingRight: "14px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", color: C.t1, fontSize: "13px" }}/>
      </div>

      {/* 5. Statuts */}
      <div style={{ display: "flex", gap: "7px", marginBottom: "14px", overflowX: "auto" }}>
        {STATUTS.map(s => {
          const active = statutFiltre === s.key;
          const c = s.color(C), bg = s.bg(C);
          return (
            <button key={s.key} onClick={() => setStatutFiltre(s.key)} className="tap" style={{ flexShrink: 0, backgroundColor: active ? bg : C.bgCard, border: `1px solid ${active ? c + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: active ? c : C.t2, fontSize: "11.5px", fontWeight: active ? 800 : 600, cursor: "pointer" }}>
              {s.label} <span style={{ marginLeft: "4px", fontSize: "9.5px", opacity: 0.8 }}>{counts[s.key]}</span>
            </button>
          );
        })}
      </div>

      {/* 6. Tri */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <span style={{ color: C.t3, fontSize: "11.5px", fontWeight: 600 }}>Trier par :</span>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "8px 10px", fontSize: "12px", color: C.t1, fontWeight: 700 }}>
          <option value="recent">Date (récent)</option>
          <option value="ancien">Date (ancien)</option>
        </select>
        <div style={{ position: "relative" }}>
          <button onClick={() => setReglagesOpen(o => !o)} className="tap" title="Réglages" style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: reglagesOpen ? `${C.gold}15` : C.bgCard, border: `1px solid ${reglagesOpen ? C.gold + "40" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={reglagesOpen ? C.gold : C.t2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          {reglagesOpen && (
            <>
              <div onClick={() => setReglagesOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "14px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", padding: "14px", width: "180px" }}>
                <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>Lignes par page</div>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "8px 10px", fontSize: "12px", color: C.t1, fontWeight: 700 }}>
                  {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 7. Liste */}
      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={28}/>
        </div>
      ) : filtered.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding={rdvs.length === 0 && !dateFrom && !dateTo && !q ? "12px" : "44px 20px"} style={{ textAlign: "center" }}>
          {rdvs.length === 0 && !dateFrom && !dateTo && !q ? (
            <EmptyState
              variant="historique"
              title="Votre historique commence ici"
              message="Une fois vos premiers rendez-vous terminés, ils apparaîtront ici avec tout ce qu'il faut pour organiser vos relances et suivis."
              color={C.gold}
              titleColor={C.t1}
              textColor={C.t3}
            />
          ) : (
            <p style={{ color: C.t2, fontSize: "13px" }}>Aucun rendez-vous trouvé pour ces filtres.</p>
          )}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {paged.map(r => {
            const badge = statutBadge(r, C);
            const av = avatarColor(r.citoyen_nom, C);
            const menuOpen = menuOpenId === r.id;
            const suiviOuvert = openSuivi === r.id;
            const actions = actionsPour(r);
            return (
              <Card key={r.id} tokens={toCardTokens(C)} padding="20px" className="rdvp-card" style={{ position: "relative", boxShadow: C.shadow }}>
                <div className="rdvp-card-grid">
                  {/* Colonne 1 — Client */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "50%", backgroundColor: av.bg, color: av.c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, flexShrink: 0 }}>
                      {r.citoyen_nom.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{r.citoyen_nom}</div>
                      {r.citoyen_phone && <div style={{ color: C.t3, fontSize: "11.5px", marginTop: "1px" }}>{r.citoyen_phone}</div>}
                      <span style={{ display: "inline-block", marginTop: "6px", backgroundColor: C.bg3, color: C.t3, fontSize: "10px", fontWeight: 700, padding: "3px 9px", borderRadius: "8px", fontFamily: "monospace" }}>{r.reference}</span>
                    </div>
                  </div>

                  {/* Colonne 2 — Service */}
                  <div>
                    <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Service</div>
                    <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "2px" }}>{r.service_nom || r.objet || "RDV général"}</div>
                    {r.service_nom && r.objet && <div style={{ color: C.t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "4px" }}>{r.objet}</div>}
                    {r.service_prix != null && <div style={{ color: C.gold, fontSize: "11.5px", fontWeight: 700, marginBottom: "4px" }}>{formatPrix(r.service_prix)}</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t3, fontSize: "11px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {formatDate(r.date_rdv)} à {r.heure_rdv}
                    </div>
                  </div>

                  {/* Colonne 3 — Statut */}
                  <div>
                    <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>Statut</div>
                    <span style={{ display: "inline-block", backgroundColor: badge.bg, color: badge.c, fontSize: "10.5px", fontWeight: 800, padding: "4px 10px", borderRadius: "20px", marginBottom: "8px" }}>{badge.l}</span>
                    <div style={{ color: C.t3, fontSize: "10.5px", lineHeight: 1.6 }}>
                      Créé le {formatDateHeure(r.created_at)}
                      {r.motif_annulation ? <div style={{ color: C.red, marginTop: "2px" }}>Suivi : RDV annulé — {r.motif_annulation}</div>
                        : r.notes ? <div style={{ color: C.t2, marginTop: "2px" }}>Suivi : {r.notes}</div>
                        : r.derniere_action ? <div style={{ color: C.t2, marginTop: "2px" }}>{r.derniere_action}{r.agent_nom ? ` · Agent : ${r.agent_nom}` : ""}</div>
                        : null}
                    </div>
                  </div>

                  {/* Colonne 4 — Actions */}
                  <div className="rdvp-actions" style={{ display: "flex", gap: "8px", position: "relative" }}>
                    {actions === "attente" && (
                      <>
                        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ whiteSpace: "nowrap" }} onClick={() => { setOpenSuivi(suiviOuvert ? null : r.id); setSuiviText(r.notes || ""); }}>Marquer un suivi</Button>
                        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ whiteSpace: "nowrap" }} loading={busyId === r.id} onClick={() => envoyerRappel(r.id)}>Rappeler ce client</Button>
                      </>
                    )}
                    {actions === "termine" && (
                      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ whiteSpace: "nowrap" }} onClick={() => setDetailRdv(r)}>Voir le dossier</Button>
                    )}
                    {actions === "annule" && (
                      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ whiteSpace: "nowrap" }} onClick={() => setDetailRdv(r)}>Détails</Button>
                    )}
                    <button onClick={() => setMenuOpenId(menuOpen ? null : r.id)} className="tap" style={{ width: "40px", height: "40px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                    {menuOpen && (
                      <>
                        <div onClick={() => setMenuOpenId(null)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
                        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", minWidth: "180px", overflow: "hidden" }}>
                          <button onClick={() => { setDetailRdv(r); setMenuOpenId(null); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Voir les détails</button>
                          <div style={{ height: "1px", backgroundColor: C.border }}/>
                          <button onClick={() => { navigator.clipboard?.writeText(r.reference); onToast("Référence copiée", C.gold); setMenuOpenId(null); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Copier la référence</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {suiviOuvert && (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.border}` }}>
                    <textarea value={suiviText} onChange={e => setSuiviText(e.target.value)} placeholder="Note de suivi pour ce rendez-vous…" rows={2} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "10px 12px", fontSize: "12.5px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "8px" }}/>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setOpenSuivi(null)}>Annuler</Button>
                      <button onClick={() => saveSuivi(r.id)} disabled={busyId === r.id} className="tap" style={{ height: "32px", backgroundColor: `${C.purple}20`, border: `1px solid ${C.purple}40`, color: C.purple, fontSize: "12px", fontWeight: 700, padding: "0 12px", borderRadius: "10px", cursor: "pointer", opacity: busyId === r.id ? 0.6 : 1 }}>{busyId === r.id ? "Enregistrement…" : "Enregistrer"}</button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 8. Pagination + 9. Lignes par page */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginTop: "20px" }}>
          <span style={{ color: C.t3, fontSize: "12px" }}>
            Affichage de {(pageSafe - 1) * pageSize + 1} à {Math.min(pageSafe * pageSize, filtered.length)} sur {filtered.length} rendez-vous
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSafe <= 1} className="tap" style={{ width: "32px", height: "32px", borderRadius: "9px", border: `1px solid ${C.border}`, backgroundColor: C.bgCard, color: C.t2, cursor: pageSafe <= 1 ? "default" : "pointer", opacity: pageSafe <= 1 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            {(() => {
              const pages: (number | "…")[] = [];
              for (let p = 1; p <= totalPages; p++) {
                if (p === 1 || p === totalPages || Math.abs(p - pageSafe) <= 1) pages.push(p);
                else if (pages[pages.length - 1] !== "…") pages.push("…");
              }
              return pages.map((p, i) => p === "…" ? (
                <span key={`e${i}`} style={{ color: C.t3, fontSize: "12px", padding: "0 4px" }}>…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)} className="tap" style={{ minWidth: "32px", height: "32px", borderRadius: "9px", backgroundColor: p === pageSafe ? C.gold : C.bgCard, color: p === pageSafe ? "#000" : C.t2, border: `1px solid ${p === pageSafe ? C.gold : C.border}`, fontSize: "12px", fontWeight: p === pageSafe ? 800 : 600, cursor: "pointer" }}>{p}</button>
              ));
            })()}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages} className="tap" style={{ width: "32px", height: "32px", borderRadius: "9px", border: `1px solid ${C.border}`, backgroundColor: C.bgCard, color: C.t2, cursor: pageSafe >= totalPages ? "default" : "pointer", opacity: pageSafe >= totalPages ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: C.t3, fontSize: "12px" }}>Lignes par page</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "8px 10px", fontSize: "12px", color: C.t1, fontWeight: 700 }}>
              {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Détails / dossier */}
      {detailRdv && (
        <div onClick={() => setDetailRdv(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "22px", border: `1px solid ${C.border2}`, maxWidth: "440px", width: "100%", maxHeight: "86svh", overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ color: C.t1, fontSize: "16px", fontWeight: 800 }}>Détails du rendez-vous</div>
              <button onClick={() => setDetailRdv(null)} style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ backgroundColor: C.bg3, borderRadius: "14px", padding: "14px 16px" }}>
              {[
                { label: "Référence", value: detailRdv.reference },
                { label: "Client", value: detailRdv.citoyen_nom },
                { label: "Téléphone", value: detailRdv.citoyen_phone || "—" },
                { label: "Service", value: detailRdv.service_nom || detailRdv.objet || "RDV général" },
                { label: "Date et heure", value: `${formatDate(detailRdv.date_rdv)} à ${detailRdv.heure_rdv}` },
                { label: "Statut", value: statutBadge(detailRdv, C).l },
                { label: "Créé le", value: formatDateHeure(detailRdv.created_at) },
                ...(detailRdv.agent_nom ? [{ label: "Agent", value: detailRdv.agent_nom }] : []),
                ...(detailRdv.derniere_action ? [{ label: "Dernière action", value: detailRdv.derniere_action }] : []),
                ...(detailRdv.motif_annulation ? [{ label: "Motif annulation", value: detailRdv.motif_annulation }] : []),
                ...(detailRdv.notes ? [{ label: "Suivi", value: detailRdv.notes }] : []),
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ color: C.t3, fontSize: "11px", fontWeight: 600, flexShrink: 0 }}>{row.label}</span>
                  <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700, textAlign: "right" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
