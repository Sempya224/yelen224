"use client";

import { ACTIVITE_CATEGORIE_SHORT, ACTIVITE_CATEGORIE_COLORS, ActiviteCategorieVisuel } from "@/lib/activiteVisuels";

// Grille des 15 catégories réelles — extraite le 27/09/2026 pour éviter une
// 3e copie identique (déjà dans categories-client.tsx et le parcours
// "Yelen vous accompagne", app/menu/projets/accompagnement). La version à 5
// tuiles + "Plus" de l'écran principal (projets-client.tsx) reste inline :
// forme différente (tuile "Plus" supplémentaire), pas un vrai doublon.
export function CategorieGrid({ onSelect, card, brd, t1, t2, ombreCard }: {
  onSelect: (code: string) => void;
  card: string; brd: string; t1: string; t2: string; ombreCard: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
      {Object.entries(ACTIVITE_CATEGORIE_SHORT).map(([code, label]) => {
        const color = ACTIVITE_CATEGORIE_COLORS[code] ?? t2;
        return (
          <button key={code} onClick={() => onSelect(code)} className="tap" style={{ background: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "7px", cursor: "pointer", boxShadow: ombreCard }}>
            <ActiviteCategorieVisuel code={code} color={color}/>
            <span style={{ color: t1, fontSize: "10.5px", fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
