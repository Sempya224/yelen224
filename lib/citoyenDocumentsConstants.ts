// Documents clients — Lot 1 (décision CEO 09/08/2026). Constantes partagées
// client/serveur (zéro import serveur), même discipline que
// lib/signalementsConstants.ts — légalité d'une transition en code, pas en
// trigger DB (voir DOCUMENT_TRANSITIONS).

export const DOCUMENT_STATUTS = [
  "en_attente", "recu", "a_verifier", "valide", "refuse", "archive", "disponible",
] as const;
export type DocumentStatut = (typeof DOCUMENT_STATUTS)[number];
export function isDocumentStatut(value: string): value is DocumentStatut {
  return (DOCUMENT_STATUTS as readonly string[]).includes(value);
}

export const DOCUMENT_STATUT_LABELS: Record<DocumentStatut, string> = {
  en_attente: "En attente",
  recu: "Reçu",
  a_verifier: "À vérifier",
  valide: "Validé",
  refuse: "Refusé",
  archive: "Archivé",
  disponible: "Disponible",
};

// Transitions légales par statut. Flux 'demande' (citoyen répond) :
// en_attente → recu → a_verifier → valide|refuse → archive. Flux 'envoi'
// (institution transmet elle-même) : disponible → archive directement,
// jamais de vérification — décision CEO 09/08/2026, se "valider soi-même"
// n'a pas de sens métier.
export const DOCUMENT_TRANSITIONS: Record<DocumentStatut, DocumentStatut[]> = {
  en_attente: ["recu"],
  recu: ["a_verifier"],
  a_verifier: ["valide", "refuse"],
  valide: ["archive"],
  refuse: ["archive"],
  disponible: ["archive"],
  archive: [],
};

export const DOCUMENT_MOTIFS_REFUS = [
  "illisible", "expire", "mauvais_document", "informations_incorrectes", "incomplet", "autre",
] as const;
export type DocumentMotifRefus = (typeof DOCUMENT_MOTIFS_REFUS)[number];
export function isDocumentMotifRefus(value: string): value is DocumentMotifRefus {
  return (DOCUMENT_MOTIFS_REFUS as readonly string[]).includes(value);
}
export const DOCUMENT_MOTIF_REFUS_LABELS: Record<DocumentMotifRefus, string> = {
  illisible: "Document illisible",
  expire: "Document expiré",
  mauvais_document: "Mauvais document",
  informations_incorrectes: "Informations incorrectes",
  incomplet: "Document incomplet",
  autre: "Autre",
};

export const DOCUMENT_EVENT_TYPES = [
  "created", "verification_started", "uploaded", "viewed", "downloaded", "validated", "rejected", "archived",
] as const;
export type DocumentEventType = (typeof DOCUMENT_EVENT_TYPES)[number];
