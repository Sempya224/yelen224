// Extrait de app/institution/[id]/page.tsx (18/07/2026, chantier Favoris
// citoyen) pour être réutilisé aussi par l'écran Favoris — un seul point
// de vérité sur la taxonomie active.
//
// Taxonomie active : secteur (8 valeurs, CHECK constraint
// institutions.secteur, alignée sur app/institution/inscription/page.tsx).
// "category" (ancienne liste libre du wizard) est dépréciée — colonne
// conservée en base mais plus utilisée pour l'affichage.
export const SECTEUR_LABELS: Record<string, string> = {
  sante: "Santé", administratif: "Administratif", financier: "Financier", juridique: "Juridique",
  beaute_bien_etre: "Beauté / Bien-être", commerce: "Commerce", artisanat: "Artisanat", services_divers: "Services divers",
};

export const SECTEUR_META: Record<string, { color: string }> = {
  sante:             { color: "#ef4444" },
  administratif:     { color: "#F5A623" },
  financier:         { color: "#22c55e" },
  juridique:         { color: "#f43f5e" },
  beaute_bien_etre:  { color: "#a855f7" },
  commerce:          { color: "#06b6d4" },
  artisanat:         { color: "#f97316" },
  services_divers:   { color: "#8b5cf6" },
};
