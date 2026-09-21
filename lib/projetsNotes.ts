// Constantes pour les onglets Projets et Notes de l'Espace de travail
// (migration 20260720000001) — même forme que lib/documentsTravail.ts.
export const STATUTS_PROJET = [
  { value: "a_venir", label: "À venir" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
  { value: "bloque", label: "Bloqué" },
] as const;

export type StatutProjet = (typeof STATUTS_PROJET)[number]["value"];

// V3 Projets (20/09/2026, validé avec Bryan) — même échelle que
// lib/taches (basse/normale/haute), pour rester cohérent dans tout
// l'Espace de travail plutôt qu'une 2e échelle de priorité.
export const PRIORITES_PROJET = [
  { value: "basse", label: "Basse" },
  { value: "normale", label: "Normale" },
  { value: "haute", label: "Haute" },
] as const;
export type PrioriteProjet = (typeof PRIORITES_PROJET)[number]["value"];

// "Santé" du projet — jamais calculée automatiquement (décision explicite
// du brief V3, item 10) : renseignée uniquement par le responsable/
// créateur/admin, ou absente (NULL = non renseignée, jamais une valeur par
// défaut forcée).
export const SANTES_PROJET = [
  { value: "vert", label: "En bonne voie" },
  { value: "orange", label: "Attention" },
  { value: "rouge", label: "Bloqué" },
] as const;
export type SanteProjet = (typeof SANTES_PROJET)[number]["value"];

export const STATUTS_MILESTONE = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminée" },
] as const;
export type StatutMilestone = (typeof STATUTS_MILESTONE)[number]["value"];

export const TYPES_NOTE = [
  { value: "info_client", label: "Info client" },
  { value: "idee_interne", label: "Idée interne" },
  { value: "rappel_admin", label: "Rappel admin" },
  { value: "consigne_equipe", label: "Consigne équipe" },
  { value: "info_importante", label: "Info importante" },
] as const;

export type TypeNote = (typeof TYPES_NOTE)[number]["value"];
