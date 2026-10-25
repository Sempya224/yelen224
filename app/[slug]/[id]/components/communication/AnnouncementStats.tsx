"use client";

// Bande de KPI de la liste d'annonces (refonte UI 20/10/2026) : remplace
// les 4 grosses cartes. Les valeurs sont calculées par CommunicationTab
// (objet `kpi`, inchangé) ; ce composant ne fait que les présenter.
import type { ThemeTokens } from "../../theme";

export type Indicateur = { label: string; value: string; sous: string; icon: React.ReactNode; tooltip?: string };

export function AnnouncementStats({ C, items }: { C: ThemeTokens; items: Indicateur[] }) {
  return (
    <>
      <style>{`
        .com-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid ${C.border};border-radius:12px;background:${C.bgCard};margin-bottom:24px;overflow:hidden}
        .com-stats>div{padding:16px 20px;min-height:96px;min-width:0;border-left:1px solid ${C.border}}
        .com-stats>div:nth-child(odd){border-left:none}
        .com-stats>div:nth-child(n+3){border-top:1px solid ${C.border}}
        @media (min-width:768px){
          .com-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
          .com-stats>div,.com-stats>div:nth-child(odd){border-left:1px solid ${C.border};border-top:none}
          .com-stats>div:first-child{border-left:none}
        }
      `}</style>
      <div className="com-stats" role="group" aria-label="Indicateurs des annonces">
        {items.map(it => (
          <div key={it.label} title={it.tooltip ?? it.sous}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t3, fontSize: "13px" }}>
              <span aria-hidden="true" style={{ display: "flex" }}>{it.icon}</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            </div>
            <div style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, margin: "4px 0", fontVariantNumeric: "tabular-nums" }}>{it.value}</div>
            <div style={{ color: C.t3, fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sous}</div>
          </div>
        ))}
      </div>
    </>
  );
}
