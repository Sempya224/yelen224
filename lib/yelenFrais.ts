// Yelen Business → Frais & commissions (18/09/2026) — forme CIBLE des
// frais appliqués aux transactions Yelen (lib/yelenTransactions.ts).
//
// Audit préalable : ni passerelle de paiement, ni grille tarifaire/
// modèle de frais n'existent pour la facturation Yelen — même constat
// que Transactions/Réconciliation, avec une nuance supplémentaire ici :
// ce n'est pas seulement la DONNÉE qui manque, c'est le MODÈLE lui-même
// (Yelen facture-t-il "frais de traitement" + "commission" + "conversion"
// séparément, ou un taux unique ?). Retour explicite du brief §4 : ne
// jamais afficher une formule qui ne correspond pas réellement au modèle
// commercial Yelen. Tant que ce modèle n'est pas tranché, l'écran ne doit
// pas présumer sa forme — voir YelenFraisTab.tsx pour comment cette
// incertitude est reflétée (section pédagogique en "Bientôt disponible",
// pas une formule affichée comme un fait).
export type FeeType = "traitement" | "commission_yelen" | "conversion" | "autres";

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  traitement: "Frais de traitement",
  commission_yelen: "Commission Yelen",
  conversion: "Conversion",
  autres: "Autres frais",
};

export type FeeLine = {
  id: string;
  date: string; // ISO
  transactionId: string;
  moyenPaiementId: string; // référence lib/paymentProviders.ts
  type: FeeType;
  montantBase: number;
  taux: number | null; // pourcentage, null si frais fixe
  montantFrais: number;
  montantNet: number;
  devise: string;
  factureId: string | null;
};

// Conditions tarifaires réellement applicables au compte — déterminées
// par Yelen (contrat), jamais modifiables côté établissement.
export type ConditionsTarifaires = {
  forfaitLabel: string | null;
  fraisTraitementDescription: string | null; // ex. "Selon le moyen de paiement"
  commissionYelenDescription: string | null; // ex. "Selon votre contrat"
  devise: string | null;
  derniereMiseAJour: string | null; // ISO
};
