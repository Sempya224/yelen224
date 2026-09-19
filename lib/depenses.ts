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

export type LigneDepense = { categorie: string; montant: number; date_depense: string };
export type LignePaidBooking = { montant_paye: number | null; created_at: string };
export type DepenseDominante = { categorie: string; montant: number };

// Dépense dominante du mois en cours — extrait de /api/citoyen/suivis
// (22/08/2026) pour devenir la source unique, réutilisée aussi par
// /api/citoyen/assistant (Home V2 "Votre argent"). Les paiements Yelen
// (paid_bookings) sont comptabilisés dans un bucket "yelen" séparé mais
// jamais éligibles au statut de "plus grosse dépense" — un paiement Yelen
// ne doit pas éclipser les dépenses manuelles, qui seules sont comparables
// entre elles catégorie par catégorie.
export function calculerDepenseDominante(
  depenses: LigneDepense[],
  paidBookings: LignePaidBooking[],
  reference: Date = new Date()
): DepenseDominante | null {
  const parCategorie = new Map<string, number>();
  for (const d of depenses) {
    const date = new Date(d.date_depense);
    if (date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth()) {
      parCategorie.set(d.categorie, (parCategorie.get(d.categorie) ?? 0) + d.montant);
    }
  }
  for (const p of paidBookings) {
    const date = new Date(p.created_at);
    if (date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth()) {
      parCategorie.set("yelen", (parCategorie.get("yelen") ?? 0) + (p.montant_paye ?? 0));
    }
  }
  let topCategorie: string | null = null, topMontant = 0;
  for (const [cat, montant] of parCategorie) {
    if (cat !== "yelen" && montant > topMontant) { topCategorie = cat; topMontant = montant; }
  }
  return topCategorie && topMontant > 0 ? { categorie: topCategorie, montant: topMontant } : null;
}
