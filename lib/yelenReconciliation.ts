// Yelen Business → Réconciliation (18/09/2026) — forme CIBLE du
// rapprochement entre les transactions Yelen (lib/yelenTransactions.ts)
// et les confirmations reçues des prestataires de paiement (Orange
// Money/MTN MoMo/NimbaPay/carte/banque, lib/paymentProviders.ts).
//
// Distinct de Transactions : Transactions répond "qu'est-ce qui s'est
// passé ?", Réconciliation répond "est-ce que ce que Yelen a enregistré
// correspond à ce que le prestataire confirme ?" — nécessite donc DEUX
// sources de données qui n'existent ni l'une ni l'autre aujourd'hui
// (aucune passerelle de paiement intégrée, voir lib/yelenTransactions.ts).
// Même décision qu'à chaque écran Yelen Business précédent : types
// documentés ici comme forme cible, aucune table créée tant que
// l'intégration réelle n'existe pas.
export type EcartType =
  | "amount_mismatch" | "missing_provider_transaction" | "missing_yelen_transaction"
  | "duplicate_transaction" | "date_mismatch" | "fee_difference"
  | "currency_mismatch" | "refund_mismatch" | "pending_provider_confirmation" | "unknown";

export const ECART_TYPE_LABELS: Record<EcartType, string> = {
  amount_mismatch: "Montant différent",
  missing_provider_transaction: "Transaction absente du prestataire",
  missing_yelen_transaction: "Transaction absente de Yelen",
  duplicate_transaction: "Transaction en double",
  date_mismatch: "Date différente",
  fee_difference: "Frais non rapprochés",
  currency_mismatch: "Devise différente",
  refund_mismatch: "Remboursement non rapproché",
  pending_provider_confirmation: "En attente de confirmation du prestataire",
  unknown: "Écart non catégorisé",
};

// Jamais de correspondance auto-validée sur une confiance faible/moyenne
// (retour Bryan §8/§9) — "haute" seule peut être proposée comme
// suggestion pré-remplie, "moyenne"/"faible" exigent toujours un choix
// humain explicite.
export type MatchConfidence = "haute" | "moyenne" | "faible";

export const MATCH_CONFIDENCE_META: Record<MatchConfidence, { label: string; couleur: string }> = {
  haute: { label: "Correspondance suggérée", couleur: "#16a34a" },
  moyenne: { label: "Vérification recommandée", couleur: "#d97706" },
  faible: { label: "Correspondance introuvable", couleur: "#dc2626" },
};

export type EtatRapprochement = "correspondance" | "ecart" | "introuvable" | "en_attente" | "exclue";

export const ETAT_RAPPROCHEMENT_META: Record<EtatRapprochement, { label: string; couleur: string }> = {
  correspondance: { label: "Correspondance", couleur: "#16a34a" },
  ecart: { label: "Écart", couleur: "#d97706" },
  introuvable: { label: "Introuvable", couleur: "#dc2626" },
  en_attente: { label: "En attente", couleur: "#6b7280" },
  exclue: { label: "Exclue", couleur: "#6b7280" },
};

export type ReconciliationItem = {
  id: string;
  transactionYelenId: string; // ex. "TX-82921"
  referenceExterne: string | null; // ex. "OM-72881"
  date: string; // ISO
  montantYelen: number;
  montantConfirme: number | null;
  devise: string;
  moyenPaiementId: string; // référence lib/paymentProviders.ts
  etat: EtatRapprochement;
  confiance: MatchConfidence | null; // null si déjà tranché (correspondance/écart confirmé)
  ecartType: EcartType | null;
  ecartMontant: number | null;
  factureId: string | null;
};

export type PeriodeReconciliation = {
  id: string; // ex. "2026-09"
  label: string; // ex. "Septembre 2026"
  nbTransactions: number;
  nbRapprochees: number;
  nbEcarts: number;
  cloturee: boolean;
  clotureeLe: string | null;
  clotureeParNom: string | null;
};

// "systeme" = matching automatique (import de données prestataire,
// suggestion de correspondance) ; "utilisateur" = action humaine
// (confirmer/exclure/résoudre/clôturer) — distinction demandée
// explicitement (§15) pour un vrai journal d'audit traçable.
export type JournalReconciliationEntry = {
  id: string;
  date: string; // ISO
  acteur: "systeme" | "utilisateur";
  acteurNom: string | null; // null si systeme
  libelle: string;
};
