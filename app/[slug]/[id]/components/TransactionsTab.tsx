"use client";

// Ledger financier — lecture seule pour tous (même admin en mode urgence :
// on ne modifie jamais l'historique, seulement l'état courant via Paiements/
// Facturation). Alimenté automatiquement par lib/transactionsFinancieres.ts.
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";

type Transaction = {
  id: string; reference: string; type_transaction: string; montant: number; motif: string | null;
  ancienne_valeur: Record<string, unknown> | null; nouvelle_valeur: Record<string, unknown> | null;
  membre_nom: string; paid_booking_id: string | null; citoyen_nom: string | null; service_nom: string | null;
  recu_id: string | null; ip: string | null; navigateur: string | null; os: string | null; created_at: string;
};

type Stats = {
  aujourdhui: { nbOperations: number; volume: number; anomalies: number };
  entrees: { valeur: number; variationPct: number | null };
  sorties: { valeur: number; variationPct: number | null };
  remboursements: { valeur: number; variationPct: number | null };
  volumeTotal: { valeur: number; variationPct: number | null };
  derniereSynchronisation: string;
};

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatHeure(iso: string): string { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }

const TYPE_LABEL: Record<string, { label: string; color: (C: ThemeTokens) => string }> = {
  encaissement: { label: "Encaissement", color: C => C.green },
  remboursement: { label: "Remboursement", color: C => C.red },
  correction: { label: "Correction", color: C => C.gold },
  annulation: { label: "Annulation", color: C => C.t3 },
  ajustement: { label: "Ajustement", color: C => C.blue },
};

type Format = "csv" | "xlsx" | "pdf";

const PERIODES: { id: string; label: string; jours: number | null }[] = [
  { id: "aujourdhui", label: "Aujourd'hui", jours: 0 },
  { id: "7j", label: "7 jours", jours: 7 },
  { id: "30j", label: "30 jours", jours: 30 },
  { id: "tout", label: "Tout", jours: null },
];

// Statut réel (§7 du brief, décision CEO 06/08/2026) — transactions_financieres
// est un grand livre insert-only (jamais modifié après coup, voir
// commentaire d'en-tête de fichier) : chaque ligne visible est donc DÉJÀ
// un fait accompli, "Validée" à 100% du temps. Il n'existe pas d'état "En
// attente"/"Échec" dans ce modèle (un insert raté ne produit jamais de
// ligne). Seul état réellement variable : "Reversée", quand une
// transaction encaissement a été suivie d'un remboursement/annulation sur
// la MÊME réservation — calculé ici, pas stocké (jamais de mutation d'une
// ligne existante).
function calculerReversees(transactions: Transaction[]): Set<string> {
  const reversees = new Set<string>();
  const parBooking = new Map<string, Transaction[]>();
  transactions.forEach(t => {
    if (!t.paid_booking_id) return;
    if (!parBooking.has(t.paid_booking_id)) parBooking.set(t.paid_booking_id, []);
    parBooking.get(t.paid_booking_id)!.push(t);
  });
  parBooking.forEach(groupe => {
    const encaissements = groupe.filter(t => t.type_transaction === "encaissement");
    const reversements = groupe.filter(t => t.type_transaction === "remboursement" || t.type_transaction === "annulation");
    if (reversements.length === 0) return;
    encaissements.forEach(e => {
      if (reversements.some(r => new Date(r.created_at) > new Date(e.created_at))) reversees.add(e.id);
    });
  });
  return reversees;
}

// Badge de variation — mêmes règles que PaiementsTab.tsx (jamais de
// "+Infinity%", gris neutre à 0%). Dupliqué localement plutôt que
// partagé : convention déjà établie dans ce dashboard (chaque onglet a
// ses propres petits composants de présentation, voir ClockInShiftTab).
function VariationBadge({ pct, C }: { pct: number | null; C: ThemeTokens }) {
  if (pct === null) return null;
  const positif = pct > 0;
  const neutre = pct === 0;
  const color = neutre ? C.t3 : positif ? C.green : C.red;
  return (
    <span style={{ color, fontSize: "11px", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "2px" }}>
      {!neutre && (positif
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>)}
      {positif ? "+" : ""}{pct}%
    </span>
  );
}

function KpiCard({ label, valeur, variationPct, C }: { label: string; valeur: string; variationPct: number | null; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="16px">
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{label}</div>
      <div style={{ color: C.t1, fontSize: "18px", fontWeight: "800", letterSpacing: "-0.3px", marginBottom: "6px" }}>{valeur}</div>
      {variationPct !== null ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <VariationBadge pct={variationPct} C={C}/>
          <span style={{ color: C.t3, fontSize: "10.5px" }}>vs semaine précédente</span>
        </div>
      ) : (
        <span style={{ color: C.t3, fontSize: "10.5px" }}>&nbsp;</span>
      )}
    </Card>
  );
}

export function TransactionsTab({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFiltre, setTypeFiltre] = useState("tous");
  const [periodeFiltre, setPeriodeFiltre] = useState("tout");
  const [agentFiltre, setAgentFiltre] = useState("tous");
  const [serviceFiltre, setServiceFiltre] = useState("tous");
  const [montantMin, setMontantMin] = useState("");
  const [montantMax, setMontantMax] = useState("");
  const [search, setSearch] = useState("");
  const [detailOuvert, setDetailOuvert] = useState<Transaction | null>(null);
  const [exportEnCours, setExportEnCours] = useState<Format | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/transactions");
    const j = await res.json().catch(() => null);
    setTransactions(res.ok ? (j?.transactions ?? []) : []);
    setStats(res.ok ? (j?.stats ?? null) : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instId]);

  const reversees = useMemo(() => calculerReversees(transactions), [transactions]);

  const agentsDisponibles = useMemo(() => Array.from(new Set(transactions.map(t => t.membre_nom).filter(Boolean))).sort(), [transactions]);
  const servicesDisponibles = useMemo(() => Array.from(new Set(transactions.map(t => t.service_nom).filter((s): s is string => !!s))).sort(), [transactions]);

  const filtered = useMemo(() => {
    const periode = PERIODES.find(p => p.id === periodeFiltre) ?? PERIODES[PERIODES.length - 1];
    const depuis = periode.jours !== null ? (() => { const d = new Date(); d.setDate(d.getDate() - periode.jours!); d.setHours(0, 0, 0, 0); return d; })() : null;
    const min = montantMin.trim() ? Number(montantMin) : null;
    const max = montantMax.trim() ? Number(montantMax) : null;

    return transactions
      .filter(t => typeFiltre === "tous" || t.type_transaction === typeFiltre)
      .filter(t => !depuis || new Date(t.created_at) >= depuis)
      .filter(t => agentFiltre === "tous" || t.membre_nom === agentFiltre)
      .filter(t => serviceFiltre === "tous" || t.service_nom === serviceFiltre)
      .filter(t => min === null || t.montant >= min)
      .filter(t => max === null || t.montant <= max)
      .filter(t => !search || t.reference.toLowerCase().includes(search.toLowerCase()) || (t.citoyen_nom ?? "").toLowerCase().includes(search.toLowerCase()));
  }, [transactions, typeFiltre, periodeFiltre, agentFiltre, serviceFiltre, montantMin, montantMax, search]);

  // Export serveur (Lot 3, §13 du brief) — même filtres actifs que la
  // table, exporte TOUTES les lignes correspondantes (pas seulement les
  // 500 déjà chargées côté client), voir
  // app/api/institution/transactions/export/route.ts.
  async function exporter(format: Format) {
    setExportEnCours(format);
    const params = new URLSearchParams({ format });
    if (typeFiltre !== "tous") params.set("type", typeFiltre);
    if (agentFiltre !== "tous") params.set("agent", agentFiltre);
    if (serviceFiltre !== "tous") params.set("service", serviceFiltre);
    if (montantMin.trim()) params.set("montantMin", montantMin.trim());
    if (montantMax.trim()) params.set("montantMax", montantMax.trim());
    if (search.trim()) params.set("q", search.trim());
    const periode = PERIODES.find(p => p.id === periodeFiltre);
    if (periode?.jours !== null && periode?.jours !== undefined) {
      const d = new Date(); d.setDate(d.getDate() - periode.jours); d.setHours(0, 0, 0, 0);
      params.set("depuis", d.toISOString());
    }
    const res = await fetch(`/api/institution/transactions/export?${params.toString()}`);
    setExportEnCours(null);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transactions_${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "6px" }}>Transactions</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "6px", lineHeight: 1.5 }}>Journal financier officiel de toutes les opérations enregistrées par votre établissement.</p>
      <p style={{ color: C.t3, fontSize: "11.5px", marginBottom: "16px", lineHeight: 1.5 }}>Chaque transaction est horodatée, tracée et conservée dans le journal d&apos;audit.</p>

      {/* Executive Summary (Lot 1, refonte "journal financier Enterprise",
          décision CEO 06/08/2026). */}
      {stats && (
        <Card tokens={toCardTokens(C)} padding="16px 18px" style={{ marginBottom: "14px", display: "flex", flexWrap: "wrap", gap: "20px" }}>
          <div style={{ color: C.t2, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", width: "100%" }}>Aujourd&apos;hui</div>
          {[
            { label: "Opérations", valeur: String(stats.aujourdhui.nbOperations), color: C.t1 },
            { label: "Volume", valeur: formatPrix(stats.aujourdhui.volume), color: C.t1 },
            { label: "Anomalie" + (stats.aujourdhui.anomalies > 1 ? "s" : ""), valeur: String(stats.aujourdhui.anomalies), color: stats.aujourdhui.anomalies > 0 ? C.red : C.t1 },
          ].map((item, i, arr) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div>
                <div style={{ color: item.color, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.3px" }}>{item.valeur}</div>
                <div style={{ color: C.t3, fontSize: "11px", fontWeight: "700", marginTop: "2px" }}>{item.label}</div>
              </div>
              {i < arr.length - 1 && <div style={{ width: "1px", height: "32px", background: C.border }}/>}
            </div>
          ))}
        </Card>
      )}

      {/* 4 cartes KPI — définitions exactes documentées côté route
          (app/api/institution/transactions/route.ts::chargerStats). */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "18px" }}>
          <KpiCard label="Entrées" valeur={formatPrix(stats.entrees.valeur)} variationPct={stats.entrees.variationPct} C={C}/>
          <KpiCard label="Sorties" valeur={formatPrix(stats.sorties.valeur)} variationPct={stats.sorties.variationPct} C={C}/>
          <KpiCard label="Remboursements" valeur={formatPrix(stats.remboursements.valeur)} variationPct={stats.remboursements.variationPct} C={C}/>
          <KpiCard label="Volume total" valeur={formatPrix(stats.volumeTotal.valeur)} variationPct={stats.volumeTotal.variationPct} C={C}/>
        </div>
      )}

      {/* Barre de filtres Enterprise (Lot 2, décision CEO 06/08/2026). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px", alignItems: "center" }}>
        <div style={{ flex: "1 1 200px", minWidth: "160px" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence ou citoyen…" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, boxSizing: "border-box" }}/>
        </div>
        <select value={periodeFiltre} onChange={e => setPeriodeFiltre(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", fontWeight: "700", color: C.t1, cursor: "pointer" }}>
          {PERIODES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {agentsDisponibles.length > 1 && (
          <select value={agentFiltre} onChange={e => setAgentFiltre(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", fontWeight: "700", color: C.t1, cursor: "pointer" }}>
            <option value="tous">Tous les agents</option>
            {agentsDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {servicesDisponibles.length > 1 && (
          <select value={serviceFiltre} onChange={e => setServiceFiltre(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", fontWeight: "700", color: C.t1, cursor: "pointer" }}>
            <option value="tous">Tous les services</option>
            {servicesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <input value={montantMin} onChange={e => setMontantMin(e.target.value)} type="number" placeholder="Min" style={{ width: "80px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", color: C.t1 }}/>
        <input value={montantMax} onChange={e => setMontantMax(e.target.value)} type="number" placeholder="Max" style={{ width: "80px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", color: C.t1 }}/>
        <button onClick={load} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", fontWeight: "700", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center" }} aria-label="Actualiser">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>

      {/* Export (§13 du brief) — exporte tout ce qui correspond aux
          filtres actifs, côté serveur (pas seulement les lignes affichées). */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {(["csv", "xlsx", "pdf"] as Format[]).map(f => (
          <Button key={f} tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" disabled={exportEnCours !== null} loading={exportEnCours === f}
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
            onClick={() => exporter(f)}>Exporter {f.toUpperCase()}</Button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "7px", marginBottom: "16px", overflowX: "auto" }}>
        {["tous", "encaissement", "remboursement", "correction", "annulation", "ajustement"].map(t => (
          <button key={t} onClick={() => setTypeFiltre(t)} className="tap" style={{ flexShrink: 0, backgroundColor: typeFiltre === t ? `${C.gold}15` : C.bgCard, border: `1px solid ${typeFiltre === t ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: typeFiltre === t ? C.gold : C.t2, fontSize: "11.5px", fontWeight: typeFiltre === t ? 800 : 600, cursor: "pointer" }}>
            {t === "tous" ? "Tous" : TYPE_LABEL[t]?.label ?? t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>
      ) : filtered.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>
          {transactions.length === 0 ? "Aucune transaction pour l'instant. Toutes les opérations financières apparaîtront ici automatiquement." : "Aucun résultat — essayez de modifier les filtres."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <style>{`
            @media(min-width:1024px){
              .transaction-row{display:grid!important;grid-template-columns:1.1fr 1.6fr 1fr 1fr 0.9fr auto;align-items:center;gap:14px;padding:12px 16px!important}
              .transaction-row-montant{text-align:right!important}
            }
          `}</style>
          {filtered.map(t => {
            const tl = TYPE_LABEL[t.type_transaction] ?? { label: t.type_transaction, color: (c: ThemeTokens) => c.t3 };
            const estReversee = reversees.has(t.id);
            const negatif = t.type_transaction === "remboursement" || t.type_transaction === "annulation";
            return (
              <Card key={t.id} tokens={toCardTokens(C)} padding="12px 16px" onClick={() => setDetailOuvert(t)} className="transaction-row tap">
                <div>
                  <div style={{ color: C.t1, fontSize: "12px", fontWeight: "800", fontFamily: "monospace" }}>{t.reference}</div>
                  <span style={{ color: tl.color(C), fontSize: "9.5px", fontWeight: "800", backgroundColor: `${tl.color(C)}15`, padding: "2px 8px", borderRadius: "20px", display: "inline-block", marginTop: "4px" }}>{tl.label}</span>
                </div>

                <div style={{ marginTop: "8px", minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.citoyen_nom ?? "—"}</div>
                  <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.service_nom ?? t.motif ?? "—"} · {formatDateHeure(t.created_at)}</div>
                </div>

                <div style={{ marginTop: "8px", color: C.t2, fontSize: "11.5px", fontWeight: "600" }}>{t.membre_nom}</div>

                <div style={{ marginTop: "8px" }}>
                  <span style={{ color: estReversee ? C.gold : C.green, fontSize: "10.5px", fontWeight: "800" }}>{estReversee ? "Reversée" : "Validée"}</span>
                  {t.paid_booking_id && (
                    <div style={{ marginTop: "3px" }}>
                      {t.recu_id ? (
                        <span style={{ color: C.green, fontSize: "10px", fontWeight: "700" }}>Reçu disponible</span>
                      ) : (
                        <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700" }}>Reçu non généré</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="transaction-row-montant" style={{ marginTop: "8px", color: negatif ? C.red : C.t1, fontSize: "14px", fontWeight: "800" }}>
                  {negatif ? "-" : ""}{formatPrix(t.montant)}
                </div>

                <div style={{ marginTop: "8px" }}>
                  {t.recu_id && (
                    <a href={`/api/institution/recus/${t.recu_id}/pdf`} onClick={async (e) => { e.preventDefault(); e.stopPropagation(); const res = await fetch(`/api/institution/recus/${t.recu_id}/pdf`); const j = await res.json().catch(() => null); if (j?.signedUrl) window.open(j.signedUrl, "_blank"); }} className="tap" style={{ color: C.gold, fontSize: "11px", fontWeight: "800", cursor: "pointer", textDecoration: "none" }}>
                      Voir le reçu
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Résumé final (§15) — mêmes chiffres qu'en-tête, en clôture
          d'écran. */}
      {stats && !loading && (
        <div style={{ marginTop: "18px", padding: "14px 16px", borderRadius: "14px", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
            <span style={{ color: C.t2, fontSize: "11.5px" }}><strong style={{ color: C.t1 }}>{stats.aujourdhui.nbOperations}</strong> transaction{stats.aujourdhui.nbOperations > 1 ? "s" : ""}</span>
            <span style={{ color: C.t2, fontSize: "11.5px" }}><strong style={{ color: C.t1 }}>{formatPrix(stats.aujourdhui.volume)}</strong></span>
            <span style={{ color: C.t2, fontSize: "11.5px" }}><strong style={{ color: stats.aujourdhui.anomalies > 0 ? C.red : C.t1 }}>{stats.aujourdhui.anomalies}</strong> anomalie{stats.aujourdhui.anomalies > 1 ? "s" : ""}</span>
          </div>
          <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "600" }}>Dernière synchronisation {formatHeure(stats.derniereSynchronisation)}</span>
        </div>
      )}

      {/* Panneau détail (§12 du brief) — bottom-sheet mobile / dialogue
          centré ≥1024px, même convention que PaiementsTab.tsx. IP/appareil
          affichés uniquement s'ils existent réellement (transactions
          créées après la migration Lot 1) — jamais "inconnu" présenté
          comme une valeur, simplement absent si non capturé. */}
      {detailOuvert && (
        <div onClick={() => setDetailOuvert(null)} className="transaction-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <style>{`
            @media(min-width:1024px){
              .transaction-fiche-overlay{align-items:center!important}
              .transaction-fiche-panel{border-radius:20px!important}
            }
          `}</style>
          <div onClick={e => e.stopPropagation()} className="transaction-fiche-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", fontFamily: "monospace" }}>{detailOuvert.reference}</div>
              <span style={{ color: (TYPE_LABEL[detailOuvert.type_transaction]?.color ?? (() => C.t3))(C), fontSize: "10.5px", fontWeight: "800", backgroundColor: `${(TYPE_LABEL[detailOuvert.type_transaction]?.color ?? (() => C.t3))(C)}15`, padding: "4px 10px", borderRadius: "20px" }}>{TYPE_LABEL[detailOuvert.type_transaction]?.label ?? detailOuvert.type_transaction}</span>
            </div>
            <div style={{ color: C.t3, fontSize: "12px", marginBottom: "18px" }}>{formatDateHeure(detailOuvert.created_at)}</div>

            <div style={{ background: C.bg3, borderRadius: "14px", padding: "14px 16px", marginBottom: "14px", textAlign: "center" }}>
              <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: "700", textTransform: "uppercase", marginBottom: "4px" }}>Montant</div>
              <div style={{ color: (detailOuvert.type_transaction === "remboursement" || detailOuvert.type_transaction === "annulation") ? C.red : C.t1, fontSize: "22px", fontWeight: "800" }}>
                {(detailOuvert.type_transaction === "remboursement" || detailOuvert.type_transaction === "annulation") ? "-" : ""}{formatPrix(detailOuvert.montant)}
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Détails</div>
              {[
                ["Citoyen", detailOuvert.citoyen_nom ?? "—"],
                ["Service", detailOuvert.service_nom ?? "—"],
                ["Agent", detailOuvert.membre_nom],
                ["Statut", reversees.has(detailOuvert.id) ? "Reversée" : "Validée"],
                detailOuvert.motif ? ["Motif", detailOuvert.motif] : null,
              ].filter((r): r is [string, string] => r !== null).map(([label, valeur]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, gap: "12px" }}>
                  <span style={{ color: C.t3, fontSize: "12px", flexShrink: 0 }}>{label}</span>
                  <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", textAlign: "right" }}>{valeur}</span>
                </div>
              ))}
            </div>

            {(detailOuvert.ip || detailOuvert.navigateur || detailOuvert.os) && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Contexte</div>
                {[
                  detailOuvert.ip ? ["Adresse IP", detailOuvert.ip] : null,
                  detailOuvert.navigateur || detailOuvert.os ? ["Appareil", [detailOuvert.navigateur, detailOuvert.os].filter(Boolean).join(" · ")] : null,
                ].filter((r): r is [string, string] => r !== null).map(([label, valeur]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.t3, fontSize: "12px" }}>{label}</span>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{valeur}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0", marginBottom: "18px" }}>
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Historique</div>
              {[
                { label: "Transaction créée", date: detailOuvert.created_at },
                detailOuvert.recu_id ? { label: "Reçu disponible", date: detailOuvert.created_at } : null,
              ].filter((e): e is { label: string; date: string } => e !== null).map((etape, i, arr) => (
                <div key={i} style={{ display: "flex", gap: "10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.gold, marginTop: "4px" }}/>
                    {i < arr.length - 1 && <div style={{ width: "1.5px", flex: 1, backgroundColor: C.border, minHeight: "18px" }}/>}
                  </div>
                  <div style={{ paddingBottom: "12px" }}>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{etape.label}</div>
                    <div style={{ color: C.t3, fontSize: "11px", marginTop: "1px" }}>{formatDateHeure(etape.date)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => setDetailOuvert(null)}>Fermer</Button>
              {detailOuvert.recu_id && (
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1, color: C.gold, border: `1px solid ${C.gold}30`, backgroundColor: `${C.gold}12` }}
                  onClick={async () => { const res = await fetch(`/api/institution/recus/${detailOuvert.recu_id}/pdf`); const j = await res.json().catch(() => null); if (j?.signedUrl) window.open(j.signedUrl, "_blank"); }}>
                  Voir le reçu
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
