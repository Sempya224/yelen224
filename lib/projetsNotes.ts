// Constantes pour les onglets Projets et Notes de l'Espace de travail
// (migration 20260720000001) — même forme que lib/documentsTravail.ts.
export const STATUTS_PROJET = [
  { value: "a_venir", label: "À venir" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
  { value: "bloque", label: "Bloqué" },
] as const;

export type StatutProjet = (typeof STATUTS_PROJET)[number]["value"];

export const TYPES_NOTE = [
  { value: "info_client", label: "Info client" },
  { value: "idee_interne", label: "Idée interne" },
  { value: "rappel_admin", label: "Rappel admin" },
  { value: "consigne_equipe", label: "Consigne équipe" },
  { value: "info_importante", label: "Info importante" },
] as const;

export type TypeNote = (typeof TYPES_NOTE)[number]["value"];
