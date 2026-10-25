"use client";

// En-tête du Centre d'Analyse + sélecteur de période (refonte UI
// 20/10/2026). PeriodPicker est LE contrôle de période de toute la page :
// il pilote le même état `periodeJours` qu'avant (valeurs 7/30/90/365),
// aucun second état.
import { useState } from "react";
import type { ThemeTokens } from "../../theme";
import type { PeriodeJours } from "@/lib/analyseAggregation";

function formatDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const OPTIONS: { value: PeriodeJours; label: string }[] = [
  { value: 7, label: "7 jours" },
  { value: 30, label: "30 jours" },
  { value: 90, label: "90 jours" },
  { value: 365, label: "1 an" },
];

export function PeriodPicker({ C, periodeJours, onChange }: { C: ThemeTokens; periodeJours: PeriodeJours; onChange: (j: PeriodeJours) => void }) {
  const [nowTick] = useState(() => Date.now());
  const fin = new Date(nowTick);
  const debut = new Date(nowTick - periodeJours * 86400000);
  const plage = `${formatDateFr(debut)} – ${formatDateFr(fin)}`;
  const libelle = OPTIONS.find(o => o.value === periodeJours)?.label ?? `${periodeJours} jours`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span style={{ color: C.t3, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{plage}</span>
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: "11px", pointerEvents: "none" }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <select
            aria-label="Période d'analyse" value={periodeJours}
            onChange={e => onChange(Number(e.target.value) as PeriodeJours)}
            className="tap"
            style={{ height: "36px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t1, fontSize: "14px", fontWeight: 500, padding: "0 12px 0 34px", cursor: "pointer" }}
          >
            {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <span style={{ color: C.t3, fontSize: "12px" }}>Comparé à la période précédente</span>
      <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Période affichée : {libelle}, du {plage}.
      </span>
    </div>
  );
}

export function AnalyseHeader({ C, children }: { C: ThemeTokens; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 320px" }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: "10px", color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.3px", margin: "0 0 4px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Centre d&apos;Analyse
        </h1>
        <p style={{ color: C.t3, fontSize: "13.5px", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Prenez des décisions éclairées grâce à des données fiables et en temps réel.
        </p>
      </div>
      {children}
    </div>
  );
}
