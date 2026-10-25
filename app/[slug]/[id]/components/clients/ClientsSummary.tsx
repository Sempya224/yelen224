"use client";

// Bande de résumé « Mes clients » (refonte UI 20/10/2026) : remplace les 3
// grosses cartes. Chaque indicateur applique le segment correspondant via
// le même `setSortBy` que les onglets (tri, pas filtre) — l'état actif
// suit le segment courant.
import type { ThemeTokens } from "../../theme";

export type Indicateur<K extends string> = { key: K; label: string; value: number };

export function ClientsSummary<K extends string>({ C, items, active, onSelect }: {
  C: ThemeTokens; items: Indicateur<K>[]; active: K; onSelect: (k: K) => void;
}) {
  return (
    <div role="group" aria-label="Résumé de la clientèle" style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard, marginBottom: "24px", overflow: "hidden" }}>
      {items.map((it, i) => {
        const on = it.key === active;
        return (
          <button
            key={it.label} onClick={() => onSelect(it.key)} aria-pressed={on} className="tap"
            style={{
              flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer", border: "none",
              borderLeft: i > 0 ? `1px solid ${C.border}` : "none",
              backgroundColor: on ? `${C.gold}0f` : "transparent",
              boxShadow: on ? `inset 0 -2px 0 ${C.gold}` : "none",
              padding: "16px 20px", minHeight: "80px",
            }}
          >
            <div style={{ color: C.t3, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</div>
            <div style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>{it.value.toLocaleString("fr-FR")}</div>
          </button>
        );
      })}
    </div>
  );
}
