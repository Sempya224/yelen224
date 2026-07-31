// "Mes dépenses" — chantier engagement du 25/07/2026, inspiré de
// MoneyLion (budget par catégorie + suggestions), sans info externe à
// vérifier ici : la source, c'est l'activité réelle du citoyen (ses RDV
// payés via paid_bookings) + ce qu'il ajoute lui-même. Catégories
// adaptées à la Guinée plutôt qu'une copie du modèle US (pas de
// "Gasoline"/"Groceries" génériques).
export type CategorieDepenseId = "sante" | "transport" | "alimentation" | "logement" | "education" | "loisirs" | "autre";

export const CATEGORIES_DEPENSE: { id: CategorieDepenseId; label: string }[] = [
  { id: "sante", label: "Santé" },
  { id: "transport", label: "Transport" },
  { id: "alimentation", label: "Alimentation" },
  { id: "logement", label: "Logement" },
  { id: "education", label: "Éducation" },
  { id: "loisirs", label: "Loisirs" },
  { id: "autre", label: "Autre" },
];

export function formatGNF(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} GNF`;
}

// Format compact utilisé pour les tuiles étroites (ex. Accueil, "Continuez
// votre exploration") où formatGNF() déborderait.
export function formatGNFCourt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
}

export const CATEGORIE_LABEL_DEPENSE: Record<CategorieDepenseId, string> = Object.fromEntries(
  CATEGORIES_DEPENSE.map(c => [c.id, c.label])
) as Record<CategorieDepenseId, string>;

export const COULEUR_CATEGORIE_DEPENSE: Record<CategorieDepenseId, string> = {
  sante: "#E11D48", transport: "#2563EB", alimentation: "#EA580C", logement: "#0F766E",
  education: "#6D28D9", loisirs: "#DB2777", autre: "#475569",
};
