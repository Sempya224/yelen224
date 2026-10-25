"use client";

// Badges de la liste d'annonces (refonte UI 20/10/2026, retour du brief :
// « Urgent » en rouge doux — l'or reste réservé à l'action primaire — et
// statuts en teintes douces). Jamais la couleur seule : point + texte.
import type { ThemeTokens } from "../../theme";

export function TypeBadge({ C, typeId, label }: { C: ThemeTokens; typeId: string; label: string }) {
  const urgent = typeId === "urgent";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, padding: "2px 9px", borderRadius: "12px", whiteSpace: "nowrap",
      backgroundColor: urgent ? `${C.red}14` : C.bg3, color: urgent ? C.red : C.t2, border: `1px solid ${urgent ? `${C.red}40` : C.border}`,
    }}>
      {urgent && <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.red }}/>}
      {label}
    </span>
  );
}

const STATUTS: Record<string, { label: string; ton: "vert" | "gris" | "grisClair" | "bleu" | "ambre" }> = {
  publiee: { label: "Active", ton: "vert" },
  terminee: { label: "Terminée", ton: "gris" },
  archivee: { label: "Archivée", ton: "grisClair" },
  planifiee: { label: "Programmée", ton: "bleu" },
  brouillon: { label: "Brouillon", ton: "ambre" },
};

export function StatusBadge({ C, statut }: { C: ThemeTokens; statut: string }) {
  const cfg = STATUTS[statut] ?? STATUTS.publiee;
  const couleur = cfg.ton === "vert" ? C.green : cfg.ton === "bleu" ? C.blue : cfg.ton === "ambre" ? C.orange : cfg.ton === "gris" ? C.t2 : C.t3;
  const fond = cfg.ton === "gris" || cfg.ton === "grisClair" ? C.bg3 : `${couleur}1a`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, padding: "2px 9px", borderRadius: "12px", whiteSpace: "nowrap", backgroundColor: fond, color: couleur }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: couleur }}/>
      {cfg.label}
    </span>
  );
}
