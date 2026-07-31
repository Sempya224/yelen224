// Libellés des catégories d'offres partenaires — partagé entre l'écran
// citoyen (app/page.tsx) et la page de redirection (app/api/offres/[id]/clic)
// pour éviter une définition dupliquée qui dériverait avec le temps.
export const OFFRE_CAT_LABELS: Record<string, string> = {
  telecom_media: "Télécom & Média", commerce_pme: "Commerce & PME",
  service_public: "Services publics", evenement: "Événements", autre: "Autre",
};

// Correspondance manuelle entre offres.categorie et les ids de
// lib/centresInteret.ts — deux taxonomies distinctes construites
// indépendamment (secteurs d'institutions + catégories Leçons d'argent
// d'un côté, catégories d'offres partenaires de l'autre), sans
// recouvrement de chaînes. Mapping volontairement prudent : seules les
// correspondances conceptuellement nettes sont incluses, jamais une
// association forcée juste pour remplir la liste (retour Bryan
// 26/07/2026, analyse conversion — sert au tri personnalisé du feed
// Offres par centre d'intérêt déclaré).
export const OFFRE_CATEGORIE_VERS_INTERETS: Record<string, string[]> = {
  commerce_pme: ["commerce", "artisanat"],
  service_public: ["administratif"],
  telecom_media: ["mobile_money"],
  evenement: [],
  autre: [],
};

// Genre d'offre — distinct de "categorie" (qui décrit le SECTEUR du
// partenaire : télécom, commerce, service public...). Le genre décrit la
// NATURE de l'offre elle-même (retour Bryan 26/07/2026 : "on ne sait pas
// quel genre d'offre c'est, tout est identique" — sans ce champ, deux
// offres de secteurs différents mais de même nature affichent exactement
// la même carte). Badge coloré affiché côté citoyen, façon app US
// (MoneyLion "CREDIT BUILDER", DoorDash "Livraison gratuite"...).
export type OffreGenre =
  | "reduction" | "cashback" | "essai_gratuit" | "cadeau"
  | "concours" | "recrutement" | "nouveaute" | "avantage_exclusif";

export const OFFRE_GENRE_LABELS: Record<OffreGenre, string> = {
  reduction: "Réduction",
  cashback: "Cashback",
  essai_gratuit: "Essai gratuit",
  cadeau: "Cadeau",
  concours: "Concours",
  recrutement: "Recrutement",
  nouveaute: "Nouveauté",
  avantage_exclusif: "Avantage exclusif",
};

// Couleur pleine par genre (badge citoyen) — une teinte propre par genre,
// jamais une seule couleur générique répétée (même logique que les 4
// bandeaux promo : "couleur différente" par sens porté).
export const OFFRE_GENRE_COULEURS: Record<OffreGenre, { bg: string; texte: string }> = {
  reduction:         { bg: "#DC2626", texte: "#fff" },
  cashback:          { bg: "#16A34A", texte: "#fff" },
  essai_gratuit:     { bg: "#2563EB", texte: "#fff" },
  cadeau:            { bg: "#DB2777", texte: "#fff" },
  concours:          { bg: "#9333EA", texte: "#fff" },
  recrutement:       { bg: "#0E7490", texte: "#fff" },
  nouveaute:         { bg: "#F5A623", texte: "#080812" },
  avantage_exclusif: { bg: "#4338CA", texte: "#fff" },
};

export const OFFRE_GENRES: OffreGenre[] = [
  "reduction", "cashback", "essai_gratuit", "cadeau",
  "concours", "recrutement", "nouveaute", "avantage_exclusif",
];
