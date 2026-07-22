"use client";

// Ledger financier — lecture seule pour tous (même admin en mode urgence :
// on ne modifie jamais l'historique, seulement l'état courant via Paiements/
// Facturation). Alimenté automatiquement par lib/transactionsFinancieres.ts.
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";

type Transaction = {
  id: string; type_transaction: string; montant: number; motif: string | null;
  membre_nom: string; paid_booking_id: string | null; created_at: string;
};

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " FCFA"; }
function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TYPE_LABEL: Record<string, { label: string; color: (C: ThemeTokens) => string }> = {
  encaissement: { label: "Encaissement", color: C => C.green },
  remboursement: { label: "Remboursement", color: C => C.red },
  correction: { label: "Correction", color: C => C.gold },
  annulation: { label: "Annulation", color: C => C.t3 },
  ajustement: { label: "Ajustement", color: C => C.blue },
};

export function TransactionsTab({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFiltre, setTypeFiltre] = useState("tous");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/institution/transactions");
      const j = await res.json().catch(() => null);
      setTransactions(res.ok ? (j?.transactions ?? []) : []);
      setLoading(false);
    })();
  }, [instId]);

  const filtered = useMemo(() => transactions.filter(t => typeFiltre === "tous" || t.type_transaction === typeFiltre), [transactions, typeFiltre]);

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Transactions</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Journal complet des mouvements financiers — lecture seule.</p>

      <div style={{ display: "flex", gap: "7px", marginBottom: "16px", overflowX: "auto" }}>
        {["tous", "encaissement", "remboursement", "correction", "annulation", "ajustement"].map(t => (
          <button key={t} onClick={() => setTypeFiltre(t)} className="tap" style={{ flexShrink: 0, backgroundColor: typeFiltre === t ? `${C.gold}15` : C.bgCard, border: `1px solid ${typeFiltre === t ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: typeFiltre === t ? C.gold : C.t2, fontSize: "11.5px", fontWeight: typeFiltre === t ? 800 : 600, cursor: "pointer" }}>
            {t === "tous" ? "Tous" : TYPE_LABEL[t]?.label ?? t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/></div>
      ) : filtered.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Aucune transaction pour l'instant.</div>
      ) : (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden" }}>
          {filtered.map((t, i) => {
            const tl = TYPE_LABEL[t.type_transaction] ?? { label: t.type_transaction, color: (c: ThemeTokens) => c.t3 };
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ color: tl.color(C), fontSize: "9.5px", fontWeight: "800", backgroundColor: `${tl.color(C)}15`, padding: "3px 9px", borderRadius: "20px", flexShrink: 0 }}>{tl.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "600" }}>{t.membre_nom}{t.motif ? ` — ${t.motif}` : ""}</div>
                  <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "1px" }}>{formatDateHeure(t.created_at)}</div>
                </div>
                <div style={{ color: t.type_transaction === "remboursement" ? C.red : C.t1, fontSize: "13px", fontWeight: "800", flexShrink: 0 }}>
                  {t.type_transaction === "remboursement" ? "-" : ""}{formatPrix(t.montant)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
