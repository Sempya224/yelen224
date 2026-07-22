"use client";

// Écran Paiements — domaine principal du comptable. L'admin y a accès en
// lecture seule tant qu'un comptable actif existe (protection du domaine
// comptable, décision CEO 22/07/2026) ; s'il n'y a plus de comptable actif,
// l'admin bascule en "mode intervention d'urgence" et peut rembourser.
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";

type Paiement = {
  id: string; reference: string; statut: string; date_rdv: string; heure_rdv: string;
  montant: number; methode_paiement: string | null; created_at: string;
  service_nom: string; citoyen_nom: string; citoyen_phone: string;
};

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " FCFA"; }
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }

const STATUT_LABEL: Record<string, { label: string; color: (C: ThemeTokens) => string }> = {
  en_attente: { label: "En attente", color: C => C.gold },
  confirme:   { label: "Confirmé",   color: C => C.green },
  termine:    { label: "Terminé",    color: C => C.green },
  no_show:    { label: "Absent",     color: C => C.t3 },
  annule:     { label: "Annulé",     color: C => C.red },
  rembourse:  { label: "Remboursé",  color: C => C.purple },
};

export function PaiementsTab({ instId, onToast, isAdmin }: { instId: string; onToast: (msg: string, color?: string) => void; isAdmin: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statutFiltre, setStatutFiltre] = useState("tous");
  const [search, setSearch] = useState("");
  const [comptableActif, setComptableActif] = useState<boolean | null>(null);
  const [remboursement, setRemboursement] = useState<Paiement | null>(null);
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/paiements");
    const j = await res.json().catch(() => null);
    setPaiements(res.ok ? (j?.paiements ?? []) : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instId]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const res = await fetch("/api/institution/membres");
      const j = await res.json().catch(() => null);
      if (res.ok) setComptableActif((j?.membres ?? []).some((m: { role?: string; actif?: boolean }) => m.role === "comptable" && m.actif));
    })();
  }, [isAdmin]);

  const modeUrgence = isAdmin && comptableActif === false;
  const lectureSeule = isAdmin && comptableActif !== false;

  const filtered = useMemo(() => {
    return paiements
      .filter(p => statutFiltre === "tous" || p.statut === statutFiltre)
      .filter(p => !search || p.citoyen_nom.toLowerCase().includes(search.toLowerCase()) || p.reference.toLowerCase().includes(search.toLowerCase()));
  }, [paiements, statutFiltre, search]);

  async function confirmerRemboursement() {
    if (!remboursement) return;
    setSaving(true);
    const res = await fetch("/api/institution/paiements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: remboursement.id, motif: motif.trim() || null }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Erreur lors du remboursement", C.red); return; }
    onToast("Paiement remboursé", C.green);
    setRemboursement(null); setMotif("");
    load();
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Paiements</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Tous les paiements de services de l'établissement.</p>

      {lectureSeule && (
        <div style={{ backgroundColor: `${C.blue}12`, border: `1px solid ${C.blue}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "16px", flexShrink: 0 }}>🛡️</span>
          <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: C.blue }}>Domaine protégé du comptable.</strong> Les remboursements sont réservés au comptable, spécialiste de ce domaine — vous consultez en lecture seule. Pour intervenir vous-même en cas d'urgence, suspendez d'abord son compte (onglet Équipe) : cette étape rend votre intervention visible et tracée, pour protéger son travail.
          </p>
        </div>
      )}
      {modeUrgence && (
        <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠️</span>
          <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: C.orange }}>Mode intervention d'urgence actif.</strong> Le compte comptable est suspendu — vous pouvez exceptionnellement rembourser des paiements à sa place.
          </p>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: "12px" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client ou une référence…" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1 }}/>
      </div>
      <div style={{ display: "flex", gap: "7px", marginBottom: "16px", overflowX: "auto" }}>
        {["tous", "en_attente", "confirme", "annule", "rembourse"].map(s => (
          <button key={s} onClick={() => setStatutFiltre(s)} className="tap" style={{ flexShrink: 0, backgroundColor: statutFiltre === s ? `${C.gold}15` : C.bgCard, border: `1px solid ${statutFiltre === s ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: statutFiltre === s ? C.gold : C.t2, fontSize: "11.5px", fontWeight: statutFiltre === s ? 800 : 600, cursor: "pointer" }}>
            {s === "tous" ? "Tous" : STATUT_LABEL[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/></div>
      ) : filtered.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Aucun paiement trouvé.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map(p => {
            const st = STATUT_LABEL[p.statut] ?? { label: p.statut, color: (c: ThemeTokens) => c.t3 };
            const peutRembourser = (p.statut === "confirme" || p.statut === "termine") && !lectureSeule;
            return (
              <div key={p.id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div>
                    <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800" }}>{p.citoyen_nom}</div>
                    <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{p.service_nom} · {formatDate(p.date_rdv)} {p.heure_rdv}</div>
                  </div>
                  <span style={{ color: st.color(C), fontSize: "10px", fontWeight: "800", backgroundColor: `${st.color(C)}15`, padding: "3px 9px", borderRadius: "20px", whiteSpace: "nowrap" }}>{st.label}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: C.t3, fontSize: "10.5px" }}>Réf. {p.reference}{p.methode_paiement ? ` · ${p.methode_paiement}` : ""}</div>
                  <div style={{ color: C.green, fontSize: "15px", fontWeight: "900" }}>{formatPrix(p.montant)}</div>
                </div>
                {peutRembourser && (
                  <button onClick={() => setRemboursement(p)} className="tap" style={{ width: "100%", marginTop: "10px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, color: C.red, fontWeight: "700", fontSize: "12px", padding: "9px", borderRadius: "10px", cursor: "pointer" }}>Rembourser</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {remboursement && (
        <div onClick={() => setRemboursement(null)} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "6px" }}>Rembourser {remboursement.citoyen_nom} ?</div>
            <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>{formatPrix(remboursement.montant)} — {remboursement.service_nom}</div>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif du remboursement (facultatif)" rows={3} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: C.t1, resize: "none", marginBottom: "14px" }}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button onClick={() => setRemboursement(null)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "13px", padding: "13px", borderRadius: "10px", cursor: "pointer" }}>Annuler</button>
              <button onClick={confirmerRemboursement} disabled={saving} style={{ backgroundColor: C.red, color: "#fff", fontWeight: "800", fontSize: "13px", padding: "13px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "…" : "Confirmer le remboursement"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
