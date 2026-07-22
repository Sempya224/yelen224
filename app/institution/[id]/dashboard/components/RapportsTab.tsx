"use client";

// Rapports financiers — export .xlsx généré côté serveur (exceljs), réutilise
// les mêmes agrégations que l'Accueil financier pour affichage à l'écran.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import type { FinanceAccueil } from "@/lib/financeAggregation";

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " FCFA"; }

export function RapportsTab({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [data, setData] = useState<FinanceAccueil | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/institution/finance/accueil");
      const j = await res.json().catch(() => null);
      if (res.ok) setData(j);
      setLoading(false);
    })();
  }, [instId]);

  async function exporterExcel() {
    setExporting(true);
    const res = await fetch("/api/institution/rapports");
    if (!res.ok) { setExporting(false); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rapport-financier-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (loading) {
    return <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/></div>;
  }
  if (!data) {
    return <div style={{ padding: "48px 16px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Impossible de charger les rapports.</div>;
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Rapports</h1>
        <button onClick={exporterExcel} disabled={exporting} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "9px 14px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: exporting ? 0.6 : 1 }}>{exporting ? "Génération…" : "Exporter en Excel"}</button>
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px" }}>Résumé par période, top services, entrées journalières.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Aujourd'hui", value: data.aujourdhui.montant_encaisse },
          { label: "Cette semaine", value: data.semaine.montant_encaisse },
          { label: "Ce mois", value: data.mois.montant_encaisse },
          { label: "Cette année", value: data.annee.montant_encaisse },
        ].map(k => (
          <div key={k.label} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "8px" }}>{k.label}</div>
            <div style={{ color: C.green, fontSize: "17px", fontWeight: "900" }}>{formatPrix(k.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>Top services (cette année)</span>
        </div>
        {data.top_services.length === 0 ? (
          <p style={{ color: C.t3, fontSize: "12px", padding: "16px" }}>Aucune donnée.</p>
        ) : data.top_services.map((s, i) => (
          <div key={s.nom} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: i < data.top_services.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ flex: 1, color: C.t1, fontSize: "13px", fontWeight: "600" }}>{s.nom}</div>
            <div style={{ color: C.t3, fontSize: "11px" }}>{s.nb} vente{s.nb > 1 ? "s" : ""}</div>
            <div style={{ color: C.green, fontSize: "13px", fontWeight: "800" }}>{formatPrix(s.montant)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
