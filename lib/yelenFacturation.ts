// Yelen Business → Facturation (18/09/2026) — forme CIBLE des factures
// Yelen émises à l'établissement (distinct de Transactions/mouvements et
// Frais & commissions/coûts, voir ces fichiers). Aucune facture Yelen
// n'existe aujourd'hui (aucun cycle de facturation réel configuré, même
// constat qu'aux 6 écrans Yelen Business précédents) — types documentés
// ici comme forme cible, aucune table créée.
export type InvoiceStatus =
  | "draft" | "issued" | "open" | "payment_pending" | "paid"
  | "overdue" | "partially_paid" | "void" | "refunded" | "uncollectible";

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; couleur: string }> = {
  draft: { label: "Brouillon", couleur: "#6b7280" },
  issued: { label: "Émise", couleur: "#2563eb" },
  open: { label: "Ouverte", couleur: "#2563eb" },
  payment_pending: { label: "Paiement en cours", couleur: "#d97706" },
  paid: { label: "Payée", couleur: "#16a34a" },
  overdue: { label: "En retard", couleur: "#dc2626" },
  partially_paid: { label: "Partiellement payée", couleur: "#d97706" },
  void: { label: "Annulée", couleur: "#6b7280" },
  refunded: { label: "Remboursée", couleur: "#2563eb" },
  uncollectible: { label: "Irrécouvrable", couleur: "#dc2626" },
};

export type InvoiceLine = { description: string; quantite: number | null; montant: number };

export type Invoice = {
  id: string; // ex. "YEL-2026-00831"
  statut: InvoiceStatus;
  periodeDebut: string; // ISO
  periodeFin: string; // ISO
  dateEmission: string; // ISO
  dateEcheance: string; // ISO
  lignes: InvoiceLine[];
  montantTotal: number;
  montantPaye: number;
  devise: string;
  moyenPaiementId: string | null;
  moyenPaiementIdentifiantMasque: string | null;
  transactionId: string | null; // une fois payée
  payeeLe: string | null;
};

export type BillingProfile = {
  nomLegal: string | null;
  adresseFacturation: string | null;
  pays: string | null;
  deviseFacturation: string | null;
  identifiantFiscal: string | null;
};
