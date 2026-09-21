// Yelen Business → Documents Yelen (18/09/2026) — forme CIBLE du coffre
// documentaire officiel de la relation Yelen <-> établissement. Agrège
// les pièces des autres écrans Yelen Business (Contrat, Facturation,
// Transactions, Réconciliation, Frais & commissions) — n'est PAS un
// espace de stockage indépendant, chaque document reste rattaché à son
// module source (§13 du brief).
//
// Audit préalable : aucun des modules sources n'émet aujourd'hui de
// document réel (aucun contrat numérisé, aucune facture générée, aucun
// relevé) — confirmé à chaque écran Yelen Business précédent. Ce fichier
// documente donc la forme cible uniquement, aucune table créée (même
// décision qu'aux écrans précédents).
export type DocumentCategory =
  | "contrat" | "facturation" | "paiement" | "financier" | "fiscal" | "autre";

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contrat: "Contrats",
  facturation: "Facturation",
  paiement: "Paiements",
  financier: "Finance", // relevés, transactions, réconciliation, frais
  fiscal: "Documents fiscaux",
  autre: "Autres",
};

// Statut DOCUMENTAIRE (cycle de vie du fichier) — distinct du statut
// FINANCIER de l'objet source (ex. une facture "Disponible" en tant que
// document peut être "Payée" ou "À payer" en tant que facture, ce sont
// deux informations différentes, §6 du brief).
export type DocumentStatus = "disponible" | "nouveau" | "en_cours" | "remplace" | "archive";

export const DOCUMENT_STATUS_META: Record<DocumentStatus, { label: string; couleur: string }> = {
  disponible: { label: "Disponible", couleur: "#16a34a" },
  nouveau: { label: "Nouveau", couleur: "#2563eb" },
  en_cours: { label: "En cours", couleur: "#d97706" },
  remplace: { label: "Remplacé", couleur: "#6b7280" },
  archive: { label: "Archivé", couleur: "#6b7280" },
};

// "source_module" identifie l'écran Yelen Business d'origine — permet le
// lien "Voir dans Facturation →" etc. (§13/§7 du brief).
export type SourceModule = "contrat" | "forfait" | "transactions" | "reconciliation" | "frais" | "facturation";

export type YelenDocument = {
  id: string; // document_id
  titre: string; // ex. "Facture Yelen #FAC-2026-0082"
  categorie: DocumentCategory;
  statutDocumentaire: DocumentStatus;
  statutFinancier: string | null; // ex. "Payée" — issu du module source, jamais recalculé ici
  periodeLabel: string | null; // ex. "Septembre 2026"
  dateCreation: string; // ISO
  datePublication: string | null; // ISO
  format: "pdf" | "csv" | "excel";
  tailleOctets: number | null;
  version: number;
  auteur: "systeme" | "utilisateur";
  auteurNom: string | null;
  checksum: string | null;
  dateArchivage: string | null;
  sourceModule: SourceModule;
  sourceId: string; // ex. "FAC-2026-0082"
};
