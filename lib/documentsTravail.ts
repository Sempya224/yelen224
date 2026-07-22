// Constantes pour la bibliothèque de documents de travail internes de
// l'institution (contrats, PV, modèles, factures...) — distinctes de
// lib/documentsInstitution.ts (KYC uniquement, PDF/JPG/PNG 10 Mo max, jamais
// relisible par l'institution). Ici l'institution lit/gère ses propres
// fichiers, formats plus larges nécessaires.
export const DOCUMENT_TRAVAIL_ACCEPTED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];

export const MAX_DOCUMENT_TRAVAIL_SIZE = 20 * 1024 * 1024;

export const CATEGORIES_DOCUMENT_TRAVAIL = [
  { value: "contrat", label: "Contrat" },
  { value: "rapport", label: "Rapport" },
  { value: "facture", label: "Facture" },
  { value: "pv", label: "PV" },
  { value: "modele", label: "Modèle" },
  { value: "guide", label: "Guide" },
  { value: "recu", label: "Reçu" },
  { value: "avoir", label: "Avoir" },
  { value: "bordereau", label: "Bordereau" },
  { value: "justificatif", label: "Justificatif" },
  { value: "autre", label: "Autre" },
] as const;

export type CategorieDocumentTravail = (typeof CATEGORIES_DOCUMENT_TRAVAIL)[number]["value"];

// Sous-ensemble utilisé par l'onglet Documents financiers (comptable) —
// distinct de l'espace de travail (auquel le comptable n'a pas accès).
export const CATEGORIES_FINANCIERES: CategorieDocumentTravail[] = ["facture", "recu", "avoir", "bordereau", "justificatif"];
