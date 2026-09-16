"use client";

// Graphique "Performance des offres" — SVG polyline fait main (aucune lib
// de graphiques dans le projet, convention déjà établie partout). Vues
// (doré) + Clics (bleu) uniquement — Conversions retiré (non mesurable,
// le CTA renvoie vers un site externe partenaire sans callback). Données
// réelles fournies par app/api/institution/offres/vues (offre_vues/
// offre_clics), aucun chiffre fabriqué.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens } from "../theme";
import { Card } from "@/components/ui/Card";

export type LignePerf = { date: string; vues: number; clics: number };

const WIDTH = 600;
const HEIGHT = 180;
const PAD = 10;

function toPolyline(data: LignePerf[], key: "vues" | "clics", maxVal: number): string {
  if (data.length === 0) return "";
  const stepX = data.length > 1 ? (WIDTH - PAD * 2) / (data.length - 1) : 0;
  return data.map((d, i) => {
    const x = PAD + i * stepX;
    const y = HEIGHT - PAD - (d[key] / maxVal) * (HEIGHT - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function MesOffresPerformanceChart({ parJour }: { parJour: LignePerf[] }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [range, setRange] = useState<7 | 30>(30);
  const data = parJour.slice(-range);
  const maxVal = Math.max(1, ...data.map(d => Math.max(d.vues, d.clics)));
  const totalVues = data.reduce((s, d) => s + d.vues, 0);
  const totalClics = data.reduce((s, d) => s + d.clics, 0);

  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>Performance des offres</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {([7, 30] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} className="tap" style={{ backgroundColor: range === r ? `${C.gold}15` : C.bgCard2, border: `1px solid ${range === r ? C.gold + "50" : C.border}`, borderRadius: "10px", padding: "6px 12px", color: range === r ? C.gold : C.t2, fontSize: "11.5px", fontWeight: range === r ? 800 : 600, cursor: "pointer" }}>
              {r === 7 ? "7 jours" : "30 jours"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "16px", marginBottom: "10px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.gold, display: "inline-block" }}/>Vues ({totalVues})
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "11px", fontWeight: 700 }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.blue, display: "inline-block" }}/>Clics ({totalClics})
        </span>
      </div>
      {data.length === 0 || (totalVues === 0 && totalClics === 0) ? (
        <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, fontSize: "12.5px" }}>
          Aucune vue ni clic enregistré sur cette période.
        </div>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" style={{ width: "100%", height: "180px" }}>
          <polyline points={toPolyline(data, "vues", maxVal)} fill="none" stroke={C.gold} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          <polyline points={toPolyline(data, "clics", maxVal)} fill="none" stroke={C.blue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      )}
    </Card>
  );
}
