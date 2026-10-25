"use client";

// Badge de statut du DERNIER rendez-vous d'un client dans la liste « Mes
// clients » (refonte UI 20/10/2026) : point coloré + texte, fond tinté
// doux — jamais la couleur seule. Les couleurs sont propres à la liste ;
// `stColor` (fiche client) reste inchangé dans MesClientsTab.tsx.
import type { ThemeTokens } from "../../theme";

type Ton = "vert" | "ambre" | "rouge" | "neutre";

const STATUTS: Record<string, { label: string; ton: Ton }> = {
  confirme: { label: "Confirmé", ton: "vert" },
  termine: { label: "Terminé", ton: "vert" },
  effectue: { label: "Effectué", ton: "vert" },
  honore: { label: "Honoré", ton: "vert" },
  en_attente: { label: "En attente", ton: "ambre" },
  nouveau: { label: "Nouveau", ton: "ambre" },
  en_retard: { label: "Non traité", ton: "ambre" },
  annule: { label: "Annulé", ton: "rouge" },
  absent: { label: "Absent", ton: "rouge" },
};

export function StatusBadge({ C, statut }: { C: ThemeTokens; statut: string }) {
  const info = STATUTS[statut] ?? { label: statut, ton: "neutre" as Ton };
  const couleur = info.ton === "vert" ? C.green : info.ton === "ambre" ? C.orange : info.ton === "rouge" ? C.red : C.t2;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: info.ton === "neutre" ? C.bg3 : `${couleur}1a`, color: couleur, fontSize: "12px", fontWeight: 600, padding: "3px 10px", borderRadius: "12px", whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: couleur }}/>
      {info.label}
    </span>
  );
}
