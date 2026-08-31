"use client";

// Facturation — reçu HTML imprimable (Ctrl+P / window.print()), pas de PDF
// serveur (décision Bryan 22/07/2026). L'admin y accède en lecture seule
// tant qu'un comptable actif existe (même protection que Paiements).
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";

type FactureListItem = { id: string; numero: string; montant_ttc: number; statut: string; created_at: string; citoyen_id: string; users: { nom: string | null; prenom: string | null } | null };
type FactureDetail = {
  id: string; numero: string; montant_ht: number; taux_taxe: number; montant_ttc: number; statut: string; created_at: string;
  paid_bookings: { confirmation_code: string; date_rdv: string; heure_rdv: string; paid_services: { nom: string } | null } | null;
  users: { nom: string | null; prenom: string | null; phone: string | null } | null;
};
type PaiementSansFacture = { id: string; reference: string; citoyen_nom: string; service_nom: string; montant: number; date_rdv: string };

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }

export function FacturationTab({ instId, onToast, isAdmin }: { instId: string; onToast: (msg: string, color?: string) => void; isAdmin: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [factures, setFactures] = useState<FactureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comptableActif, setComptableActif] = useState<boolean | null>(null);
  const [showGenerer, setShowGenerer] = useState(false);
  const [candidats, setCandidats] = useState<PaiementSansFacture[]>([]);
  const [genererId, setGenererId] = useState<string | null>(null);
  const [impression, setImpression] = useState<FactureDetail | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/factures");
    const j = await res.json().catch(() => null);
    setFactures(res.ok ? (j?.factures ?? []) : []);
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

  const lectureSeule = isAdmin && comptableActif !== false;
  const modeUrgence = isAdmin && comptableActif === false;

  async function ouvrirGenerer() {
    const res = await fetch("/api/institution/paiements?statut=confirme");
    const j = await res.json().catch(() => null);
    const dejaFacture = new Set(factures.map(f => f.id));
    const list: PaiementSansFacture[] = (res.ok ? (j?.paiements ?? []) : [])
      .filter((p: { id: string }) => !dejaFacture.has(p.id));
    setCandidats(list);
    setShowGenerer(true);
  }

  async function genererFacture(paidBookingId: string) {
    setGenererId(paidBookingId);
    const res = await fetch("/api/institution/factures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid_booking_id: paidBookingId }),
    });
    const j = await res.json().catch(() => null);
    setGenererId(null);
    if (!res.ok) { onToast(j?.error || "Erreur lors de la génération", C.red); return; }
    onToast(`Facture ${j.numero} générée`, C.green);
    setShowGenerer(false);
    load();
  }

  async function ouvrirImpression(id: string) {
    const res = await fetch(`/api/institution/factures?id=${id}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { onToast("Erreur de chargement", C.red); return; }
    setImpression(j.facture);
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Facturation</h1>
        {!lectureSeule && (
          <button onClick={ouvrirGenerer} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "9px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Générer une facture</button>
        )}
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Factures émises pour les paiements confirmés.</p>

      {lectureSeule && (
        <div style={{ backgroundColor: `${C.blue}12`, border: `1px solid ${C.blue}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "16px", flexShrink: 0 }}>🛡️</span>
          <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: C.blue }}>Domaine protégé du comptable.</strong> L&apos;émission de factures est réservée au comptable — vous consultez en lecture seule. Suspendez d&apos;abord son compte (onglet Équipe) pour intervenir vous-même.
          </p>
        </div>
      )}
      {modeUrgence && (
        <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠️</span>
          <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: 0 }}><strong style={{ color: C.orange }}>Mode intervention d&apos;urgence actif.</strong> Le compte comptable est suspendu.</p>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>
      ) : factures.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Aucune facture émise pour l&apos;instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {factures.map(f => (
            <div key={f.id} onClick={() => ouvrirImpression(f.id)} className="tap" style={{ cursor: "pointer", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800" }}>{f.numero}</div>
                <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{f.users ? `${f.users.prenom ?? ""} ${f.users.nom ?? ""}`.trim() : "Client"} · {formatDate(f.created_at)}</div>
              </div>
              <div style={{ color: C.green, fontSize: "14px", fontWeight: "900" }}>{formatPrix(f.montant_ttc)}</div>
            </div>
          ))}
        </div>
      )}

      {showGenerer && (
        <div onClick={() => setShowGenerer(false)} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px", maxHeight: "80svh", overflowY: "auto" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "14px" }}>Paiements sans facture</div>
            {candidats.length === 0 ? (
              <p style={{ color: C.t2, fontSize: "13px" }}>Tous les paiements confirmés ont déjà une facture.</p>
            ) : candidats.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>{p.citoyen_nom}</div>
                  <div style={{ color: C.t3, fontSize: "11px" }}>{p.service_nom} · {formatPrix(p.montant)}</div>
                </div>
                <button onClick={() => genererFacture(p.id)} disabled={genererId === p.id} className="tap" style={{ backgroundColor: C.gold, color: "#000", fontWeight: "800", fontSize: "12px", padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer" }}>{genererId === p.id ? "…" : "Générer"}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {impression && <FactureImprimable facture={impression} onClose={() => setImpression(null)}/>}
    </div>
  );
}

function FactureImprimable({ facture, onClose }: { facture: FactureDetail; onClose: () => void }) {
  const client = facture.users ? `${facture.users.prenom ?? ""} ${facture.users.nom ?? ""}`.trim() : "Client";
  return (
    <div className="facture-print-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={e => e.stopPropagation()} className="facture-print-content" style={{ backgroundColor: "#fff", color: "#111", borderRadius: "16px", padding: "36px", width: "100%", maxWidth: "520px", maxHeight: "90svh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div style={{ fontSize: "20px", fontWeight: 900 }}>Reçu {facture.numero}</div>
          <div style={{ fontSize: "12px", color: "#666" }}>{formatDate(facture.created_at)}</div>
        </div>
        <div style={{ fontSize: "13px", color: "#444", marginBottom: "20px" }}>
          <div><strong>Client :</strong> {client}{facture.users?.phone ? ` — ${facture.users.phone}` : ""}</div>
          <div><strong>Service :</strong> {facture.paid_bookings?.paid_services?.nom ?? "Service"}</div>
          <div><strong>Référence :</strong> {facture.paid_bookings?.confirmation_code ?? "—"}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "20px" }}>
          <tbody>
            <tr><td style={{ padding: "6px 0" }}>Montant HT</td><td style={{ padding: "6px 0", textAlign: "right" }}>{formatPrix(facture.montant_ht)}</td></tr>
            <tr><td style={{ padding: "6px 0" }}>Taxe ({facture.taux_taxe}%)</td><td style={{ padding: "6px 0", textAlign: "right" }}>{formatPrix(facture.montant_ttc - facture.montant_ht)}</td></tr>
            <tr style={{ borderTop: "1px solid #ddd", fontWeight: 900 }}><td style={{ padding: "10px 0" }}>Total TTC</td><td style={{ padding: "10px 0", textAlign: "right" }}>{formatPrix(facture.montant_ttc)}</td></tr>
          </tbody>
        </table>
        <div className="facture-print-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button onClick={onClose} style={{ backgroundColor: "#eee", color: "#333", fontWeight: 700, fontSize: "13px", padding: "12px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Fermer</button>
          <button onClick={() => window.print()} style={{ backgroundColor: "#111", color: "#fff", fontWeight: 800, fontSize: "13px", padding: "12px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Imprimer / Enregistrer PDF</button>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .facture-print-content, .facture-print-content * { visibility: visible; }
          .facture-print-content { position: fixed; inset: 0; max-height: none; border-radius: 0; }
          .facture-print-actions { display: none !important; }
        }
      `}</style>
    </div>
  );
}
