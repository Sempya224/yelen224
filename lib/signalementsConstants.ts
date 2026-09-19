// Signalements — Lot 1 (case management, décision CEO 08/08/2026). Source
// unique des valeurs de lifecycle — zéro import serveur, safe à importer
// depuis un "use client" (app/signalement/page.tsx, SignalementsTab.tsx,
// app/admin/moderation/page.tsx, app/admin/page.tsx) ET depuis
// lib/signalements.ts (serveur). Ne jamais dupliquer ces listes ailleurs.

export const SIGNALEMENT_STATUTS = [
  "nouveau", "a_traiter", "en_cours", "en_attente", "resolu", "cloture", "rejete", "doublon",
] as const;
export type SignalementStatut = (typeof SIGNALEMENT_STATUTS)[number];

export function isSignalementStatut(value: string): value is SignalementStatut {
  return (SIGNALEMENT_STATUTS as readonly string[]).includes(value);
}

// États non-terminaux — utilisé par les 2 écrans admin (au lieu de la
// comparaison stricte `statut === 'nouveau'`, jamais vraie en pratique
// puisque plus aucun code n'écrit cette valeur seule désormais).
export const SIGNALEMENT_STATUTS_OUVERTS: SignalementStatut[] = ["nouveau", "a_traiter", "en_cours", "en_attente"];

export const SIGNALEMENT_STATUT_LABELS: Record<SignalementStatut, string> = {
  nouveau: "Nouveau",
  a_traiter: "À traiter",
  en_cours: "En cours",
  en_attente: "En attente",
  resolu: "Résolu",
  cloture: "Clôturé",
  rejete: "Rejeté",
  doublon: "Doublon",
};

// Graphe de transition — appliqué uniquement en code (lib/signalements.ts,
// changerStatut()), jamais en trigger DB. Voir CLAUDE.md
// /signalements-lot1 pour la justification (aucune autre table du projet
// n'a de trigger de graphe de transition, seulement des triggers
// d'immuabilité — une garantie différente).
export const SIGNALEMENT_TRANSITIONS: Record<SignalementStatut, SignalementStatut[]> = {
  nouveau: ["a_traiter", "rejete", "doublon"],
  a_traiter: ["en_cours", "rejete", "doublon"],
  en_cours: ["en_attente", "resolu", "rejete", "doublon"],
  en_attente: ["en_cours", "resolu", "rejete", "doublon"],
  resolu: ["en_cours", "cloture"],
  cloture: [],
  rejete: [],
  doublon: [],
};

export const SIGNALEMENT_PRIORITES = ["critique", "haute", "normale", "faible"] as const;
export type SignalementPriorite = (typeof SIGNALEMENT_PRIORITES)[number];

export function isSignalementPriorite(value: string): value is SignalementPriorite {
  return (SIGNALEMENT_PRIORITES as readonly string[]).includes(value);
}

export const SIGNALEMENT_PRIORITE_LABELS: Record<SignalementPriorite, string> = {
  critique: "Critique",
  haute: "Haute",
  normale: "Normale",
  faible: "Faible",
};

export const SIGNALEMENT_RESOLUTION_ACTIONS = [
  "avertissement", "restriction", "correction_donnees", "aucune_action", "information_transmise", "autre",
] as const;
export type SignalementResolutionAction = (typeof SIGNALEMENT_RESOLUTION_ACTIONS)[number];

export function isSignalementResolutionAction(value: string): value is SignalementResolutionAction {
  return (SIGNALEMENT_RESOLUTION_ACTIONS as readonly string[]).includes(value);
}

export const SIGNALEMENT_RESOLUTION_ACTION_LABELS: Record<SignalementResolutionAction, string> = {
  avertissement: "Avertissement",
  restriction: "Restriction",
  correction_donnees: "Correction de données",
  aucune_action: "Aucune action nécessaire",
  information_transmise: "Information transmise",
  autre: "Autre",
};

export const SIGNALEMENT_ESCALADE_NIVEAUX = ["agent", "superviseur", "admin"] as const;
export type SignalementEscaladeNiveau = (typeof SIGNALEMENT_ESCALADE_NIVEAUX)[number];

export function isSignalementEscaladeNiveau(value: string): value is SignalementEscaladeNiveau {
  return (SIGNALEMENT_ESCALADE_NIVEAUX as readonly string[]).includes(value);
}

export const SIGNALEMENT_EVENT_TYPES = [
  "created", "assigned", "priority_changed", "status_changed", "note_added",
  "attachment_added", "resolved", "reopened", "closed", "escalated", "marked_duplicate",
] as const;
export type SignalementEventType = (typeof SIGNALEMENT_EVENT_TYPES)[number];

// Motifs — liste blanche partagée par les 2 écrans de création
// (SignalementsTab.tsx côté institution, app/signalement/page.tsx côté
// citoyen) ET par les 2 routes API de création, qui valident désormais le
// motif reçu contre cette liste au lieu d'accepter n'importe quelle chaîne
// (chantier RDV obligatoire + signalements encadrés, 15/08/2026). Chaque
// liste reste propre à son côté — les motifs ne sont pas symétriques
// (un citoyen ne signale pas une "absence répétée", une institution ne
// signale pas une "arnaque/fraude").
export const SIGNALEMENT_MOTIFS_INSTITUTION = [
  { value: "absence_repetee",       label: "Absence répétée sans annulation", desc: "Le citoyen ne se présente pas sans prévenir" },
  { value: "comportement_agressif", label: "Comportement agressif",           desc: "Comportement violent ou menaçant lors du RDV" },
  { value: "fausses_informations",  label: "Fausses informations",            desc: "Le citoyen a fourni de fausses informations" },
  { value: "spam_rdv",              label: "Spam de rendez-vous",             desc: "Prise de RDV répétitive sans intention réelle" },
  { value: "autre",                 label: "Autre",                          desc: "Autre motif non listé ci-dessus" },
] as const;
export type SignalementMotifInstitution = (typeof SIGNALEMENT_MOTIFS_INSTITUTION)[number]["value"];
export function isSignalementMotifInstitution(value: string): value is SignalementMotifInstitution {
  return SIGNALEMENT_MOTIFS_INSTITUTION.some(m => m.value === value);
}

export const SIGNALEMENT_MOTIFS_CITOYEN = [
  { value: "comportement_irrespectueux", label: "Comportement irrespectueux", desc: "Agent ou personnel irrespectueux lors du RDV" },
  { value: "rdv_non_honore",             label: "RDV non honoré",             desc: "L'institution n'a pas respecté le rendez-vous confirmé" },
  { value: "informations_fausses",       label: "Informations fausses",       desc: "Les informations publiées ne correspondent pas à la réalité" },
  { value: "arnaque_fraude",             label: "Arnaque / Fraude",           desc: "Tentative d'escroquerie ou comportement frauduleux" },
  { value: "autre",                      label: "Autre",                      desc: "Autre motif non listé ci-dessus" },
] as const;
export type SignalementMotifCitoyen = (typeof SIGNALEMENT_MOTIFS_CITOYEN)[number]["value"];
export function isSignalementMotifCitoyen(value: string): value is SignalementMotifCitoyen {
  return SIGNALEMENT_MOTIFS_CITOYEN.some(m => m.value === value);
}
