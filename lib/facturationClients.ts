// Facturation clients V3 (18/09/2026) — Établissement → Client, jamais
// Yelen → Établissement (voir lib/compteYelenDisplay.ts et les écrans
// Yelen Business pour l'autre sens). Types partagés entre les routes
// /api/institution/factures/* et FacturationTab.tsx/MesClientsTab.tsx.
export type FactureStatut = "brouillon" | "emise" | "envoyee" | "partiellement_payee" | "payee" | "annulee" | "remboursee";

// Jamais d'emoji (règle Yelen) — le point coloré se rend via un composant
// StatusDot (voir app/[slug]/[id]/components/YelenBusinessShared.tsx,
// même pattern réutilisable ici).
export const FACTURE_STATUT_META: Record<FactureStatut, { label: string; couleur: string }> = {
  brouillon: { label: "Brouillon", couleur: "#6b7280" },
  emise: { label: "Émise", couleur: "#16a34a" }, // reçu généré depuis un paid_booking déjà payé — équivalent "payée"
  envoyee: { label: "En attente de paiement", couleur: "#2563eb" },
  partiellement_payee: { label: "Partiellement payée", couleur: "#d97706" },
  payee: { label: "Payée", couleur: "#16a34a" },
  annulee: { label: "Annulée", couleur: "#6b7280" },
  remboursee: { label: "Remboursée", couleur: "#2563eb" },
};

export const METHODES_PAIEMENT = ["mobile_money", "virement", "especes", "carte", "autre"] as const;
export type MethodePaiement = typeof METHODES_PAIEMENT[number];
export const METHODE_PAIEMENT_LABELS: Record<MethodePaiement, string> = {
  mobile_money: "Mobile Money",
  virement: "Virement bancaire",
  especes: "Espèces",
  carte: "Carte",
  autre: "Autre",
};

export type FactureLigne = { id: string; description: string; quantite: number; prixUnitaire: number; remise: number; montantTotal: number; ordre: number };
export type FacturePaiement = { id: string; montant: number; methode: MethodePaiement; datePaiement: string; reference: string | null; note: string | null; preuveUrl: string | null; enregistreParNom: string | null };
export type FactureEvenementType = "creee" | "envoyee" | "paiement_recu" | "rappel_envoye" | "annulee" | "remboursee";
export type FactureEvenement = { id: string; type: FactureEvenementType; libelle: string; date: string; auteurNom: string | null };

export type Facture = {
  id: string;
  numero: string;
  statut: FactureStatut;
  creeDepuis: "paid_booking" | "manuelle";
  citoyenId: string;
  citoyenNom: string;
  citoyenPhone: string | null;
  citoyenEmail: string | null;
  dateEmission: string;
  dateEcheance: string | null;
  montantHt: number;
  tauxTaxe: number;
  montantTtc: number;
  montantPaye: number;
  createdAt: string;
};

export type FactureDetail = Facture & {
  lignes: FactureLigne[];
  paiements: FacturePaiement[];
  evenements: FactureEvenement[];
};

// 'en_retard' n'est jamais stocké — dérivé à la lecture (même principe
// que "Expiré" sur citoyen_documents), calculé ici pour rester la seule
// source de vérité de cette dérivation.
export function estEnRetard(f: Pick<Facture, "statut" | "dateEcheance">): boolean {
  if (!f.dateEcheance) return false;
  if (f.statut === "payee" || f.statut === "annulee" || f.statut === "remboursee" || f.statut === "brouillon") return false;
  return new Date(f.dateEcheance).getTime() < Date.now();
}

export function resteAPayer(f: Pick<Facture, "montantTtc" | "montantPaye">): number {
  return Math.max(0, f.montantTtc - f.montantPaye);
}
