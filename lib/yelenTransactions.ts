// Yelen Business → Transactions (18/09/2026) — forme CIBLE du registre
// financier du compte institution <-> Yelen (règlement de l'abonnement
// Yelen Business), distinct de paid_bookings (paiements des CLIENTS de
// l'institution, voir PaiementsTab.tsx).
//
// Audit préalable : aucune passerelle de paiement n'est intégrée pour la
// facturation Yelen (confirmé lors du chantier Moyens de paiement,
// lib/paymentProviders.ts) — donc aucune transaction Yelen-side n'existe
// et ne peut exister aujourd'hui. Décision cohérente avec ce même
// chantier : ne PAS créer de table `yelen_transactions` maintenant, sa
// forme dépend de choix qui seront faits au moment de l'intégration réelle
// (structure des frais, format des références prestataire, etc.) —
// créer le schéma en aveugle risquerait de devoir le refaire. Ces types
// documentent la forme cible pour que l'écran (déjà construit) n'ait pas
// à changer de structure de données quand l'intégration arrivera, et pour
// garder le fil Forfait → Facture → Transaction → Moyen → Prestataire →
// Référence explicite dès maintenant.
export type TransactionType = "paiement" | "remboursement" | "ajustement" | "credit" | "debit";
export type TransactionStatus = "reussie" | "en_attente" | "echouee" | "remboursee";

export const TRANSACTION_STATUS_META: Record<TransactionStatus, { label: string; couleur: string }> = {
  reussie: { label: "Réussie", couleur: "#16a34a" },
  en_attente: { label: "En attente", couleur: "#d97706" },
  echouee: { label: "Échouée", couleur: "#dc2626" },
  remboursee: { label: "Remboursée", couleur: "#2563eb" },
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  paiement: "Paiement",
  remboursement: "Remboursement",
  ajustement: "Ajustement",
  credit: "Crédit",
  debit: "Débit",
};

// Chaîne de traçabilité complète visée par le drawer de détail (à
// construire une fois qu'une vraie transaction peut exister) :
// Transaction → Facture → Forfait ; Transaction → Moyen → Prestataire → Référence externe.
export type Transaction = {
  id: string; // ex. "TX-82931"
  date: string; // ISO
  type: TransactionType;
  statut: TransactionStatus;
  montantBrut: number;
  frais: number;
  montantNet: number;
  devise: string; // "GNF", "USD"...
  moyenPaiementId: string; // référence lib/paymentProviders.ts (provider.id)
  moyenPaiementLabel: string;
  moyenPaiementIdentifiantMasque: string | null; // ex. "•••• 4821"
  referencePrestataire: string | null; // donnée sensible, voir yelen_transactions.voir_references_prestataire
  factureId: string | null; // ex. "FAC-2026-00831"
  forfaitLabel: string | null;
  motifEchec: string | null; // uniquement si statut === "echouee"
  transactionOrigineId: string | null; // uniquement si type === "remboursement"
  description: string;
};
