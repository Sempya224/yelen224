// Catégories de publication "Yelen Community" (27/07/2026) — max 10,
// volontairement professionnelles/business, jamais politique, race,
// ethnie, religion... Partagé entre le composeur (choix obligatoire) et
// le filtre illustré en haut du fil.
export type PostCategorie =
  | "entrepreneuriat" | "carriere_emploi" | "finance_argent" | "marketing_vente"
  | "technologie_innovation" | "developpement_personnel" | "reseautage"
  | "actualites_business" | "conseils_pratiques" | "reussite_temoignage";

export const POST_CATEGORIES: PostCategorie[] = [
  "entrepreneuriat", "carriere_emploi", "finance_argent", "marketing_vente",
  "technologie_innovation", "developpement_personnel", "reseautage",
  "actualites_business", "conseils_pratiques", "reussite_temoignage",
];

export const POST_CATEGORIE_LABELS: Record<PostCategorie, string> = {
  entrepreneuriat: "Entrepreneuriat",
  carriere_emploi: "Carrière & Emploi",
  finance_argent: "Finance & Argent",
  marketing_vente: "Marketing & Vente",
  technologie_innovation: "Technologie & Innovation",
  developpement_personnel: "Développement personnel",
  reseautage: "Réseautage",
  actualites_business: "Actualités business",
  conseils_pratiques: "Conseils pratiques",
  reussite_temoignage: "Réussite & Témoignage",
};

// Couleur pleine par catégorie — une teinte propre par catégorie, jamais
// une seule couleur générique répétée (même logique que les genres d'offre).
export const POST_CATEGORIE_COULEURS: Record<PostCategorie, string> = {
  entrepreneuriat: "#F5A623",
  carriere_emploi: "#2563EB",
  finance_argent: "#16A34A",
  marketing_vente: "#DB2777",
  technologie_innovation: "#4338CA",
  developpement_personnel: "#0E7490",
  reseautage: "#9333EA",
  actualites_business: "#DC2626",
  conseils_pratiques: "#0D9488",
  reussite_temoignage: "#C8740A",
};
