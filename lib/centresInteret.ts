// Taxonomie de "Vos centres d'intérêt" (app/menu/interets) — chantier
// engagement du 25/07/2026. Volontairement PAS une nouvelle liste
// inventée : les ids réutilisent 1:1 les valeurs déjà réelles du produit
// (institutions.secteur — 8 valeurs confirmées, voir CLAUDE.md /schema —
// et les catégories de Leçons d'argent, lib/leconsArgent.ts) pour que ces
// centres d'intérêt puissent un jour alimenter des recommandations réelles
// (établissements du bon secteur, leçons pertinentes) sans table de
// correspondance à maintenir.
export type CentreInteretId =
  | "santé" | "administratif" | "financier" | "juridique"
  | "beauté_bien_etre" | "commerce" | "artisanat" | "services_divers"
  | "epargne" | "mobile_money" | "credit" | "revenus" | "budget" | "fraudes";

export type SectionInteret = { titre: string; items: { id: CentreInteretId; label: string }[] };

export const SECTIONS_INTERET: SectionInteret[] = [
  {
    titre: "Services & démarches",
    items: [
      { id: "santé", label: "Santé" },
      { id: "administratif", label: "Administratif" },
      { id: "financier", label: "Institutions financières" },
      { id: "juridique", label: "Juridique" },
      { id: "beauté_bien_etre", label: "Beauté & bien-être" },
      { id: "commerce", label: "Commerce" },
      { id: "artisanat", label: "Artisanat" },
      { id: "services_divers", label: "Services divers" },
    ],
  },
  {
    titre: "Argent & finances",
    items: [
      { id: "epargne", label: "Épargne & tontines" },
      { id: "mobile_money", label: "Mobile money" },
      { id: "credit", label: "Microfinance & crédit" },
      { id: "revenus", label: "Revenus & activité" },
      { id: "budget", label: "Budget" },
      { id: "fraudes", label: "Fraudes & protection" },
    ],
  },
];
