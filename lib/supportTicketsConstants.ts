// Support Yelen (ticketing citoyen↔agent humain, 04/09/2026) — source
// unique des valeurs de lifecycle. Zéro import serveur, safe à importer
// depuis un "use client" ET depuis lib/supportTickets.ts (serveur). Ne
// jamais dupliquer ces listes ailleurs. Même discipline que
// lib/signalementsConstants.ts (case management institution).

export const SUPPORT_CATEGORIES = [
  "compte", "reservation", "paiement", "etablissement", "securite", "technique", "autre",
] as const;
export type SupportCategorie = (typeof SUPPORT_CATEGORIES)[number];

export function isSupportCategorie(value: string): value is SupportCategorie {
  return (SUPPORT_CATEGORIES as readonly string[]).includes(value);
}

export const SUPPORT_CATEGORIE_LABELS: Record<SupportCategorie, string> = {
  compte: "Compte",
  reservation: "Réservation",
  paiement: "Paiement",
  etablissement: "Établissement",
  securite: "Sécurité",
  technique: "Problème technique",
  autre: "Autre",
};

// Catégories institution (chantier "Support Yelen institution", 06/09/2026)
// — taxonomie distincte du citoyen : "compte"/"technique"/"securite"/"autre"
// partagés (même sens des deux côtés), "facturation"/"client"/"partenariat"
// n'ont pas d'équivalent citoyen. Toutes les 10 valeurs (7 citoyen + 3
// institution) sont acceptées par la même contrainte CHECK en base
// (migration 20260906000004) — cette liste ne décide que ce qui est
// PROPOSÉ à la création côté institution, pas ce que la colonne accepte.
export const SUPPORT_CATEGORIES_INSTITUTION = [
  "compte", "facturation", "client", "technique", "partenariat", "securite", "autre",
] as const;
export type SupportCategorieInstitution = (typeof SUPPORT_CATEGORIES_INSTITUTION)[number];

export function isSupportCategorieInstitution(value: string): value is SupportCategorieInstitution {
  return (SUPPORT_CATEGORIES_INSTITUTION as readonly string[]).includes(value);
}

export const SUPPORT_CATEGORIE_INSTITUTION_LABELS: Record<SupportCategorieInstitution, string> = {
  compte: "Compte",
  facturation: "Facturation",
  client: "Un client",
  technique: "Problème technique",
  partenariat: "Partenariat",
  securite: "Sécurité",
  autre: "Autre",
};

// Catégories publiques (chantier "Yelen Support Public Général",
// 24/09/2026) — 3e élargissement de la même contrainte CHECK, après
// citoyen puis institution (voir migration 20260924000001).
// 'technique'/'securite'/'autre' déjà partagés, réutilisés tels quels.
// 'rejoindre_yelen' est délibérément distinct du 'partenariat'
// institution : ce dernier concerne un établissement déjà client, le
// public "Institution / Partenariat" est un prospect sans compte — les
// confondre fausserait les statistiques de la file agent.
export const SUPPORT_CATEGORIES_PUBLIC = [
  "general", "rejoindre_yelen", "presse", "commercial", "signalement_general",
  "technique", "securite", "autre",
] as const;
export type SupportCategoriePublic = (typeof SUPPORT_CATEGORIES_PUBLIC)[number];

export function isSupportCategoriePublic(value: string): value is SupportCategoriePublic {
  return (SUPPORT_CATEGORIES_PUBLIC as readonly string[]).includes(value);
}

export const SUPPORT_CATEGORIE_PUBLIC_LABELS: Record<SupportCategoriePublic, string> = {
  general: "Question générale",
  rejoindre_yelen: "Institution / Partenariat",
  presse: "Presse / Média",
  commercial: "Question commerciale",
  signalement_general: "Signaler un problème",
  technique: "Problème technique",
  securite: "Sécurité",
  autre: "Autre",
};

// attente_verification (24/09/2026) : un ticket public n'entre dans la
// file agent qu'après vérification de l'email — jamais atteignable pour
// citoyen/institution (attente_agent reste leur premier statut).
export const SUPPORT_STATUTS = ["attente_verification", "attente_agent", "en_cours", "resolu", "cloture"] as const;
export type SupportStatut = (typeof SUPPORT_STATUTS)[number];

export function isSupportStatut(value: string): value is SupportStatut {
  return (SUPPORT_STATUTS as readonly string[]).includes(value);
}

export const SUPPORT_STATUT_LABELS: Record<SupportStatut, string> = {
  attente_verification: "En attente de vérification de l'email",
  attente_agent: "En attente d'un agent",
  en_cours: "En cours",
  resolu: "Résolue",
  cloture: "Clôturée",
};

// États non terminaux — un ticket cloture n'apparaît jamais dans la file
// agent ni dans "Mes demandes actives" côté citoyen. attente_verification
// volontairement absent : aucun ticket citoyen/institution ne l'atteint
// jamais, et aucun écran "mes demandes" public ne consomme cette constante
// en V1 (pas de compte visiteur) — non ajouté tant que non nécessaire.
export const SUPPORT_STATUTS_ACTIFS: SupportStatut[] = ["attente_agent", "en_cours", "resolu"];

// Graphe de transition — légalité en code, jamais en trigger DB (même
// principe que SIGNALEMENT_TRANSITIONS). 'attente_agent' n'est atteignable
// depuis 'resolu' QUE par la réouverture (message citoyen), jamais une
// action agent directe — d'où son absence des transitions listées ici :
// lib/supportTickets.ts::reouvrirTicket() contourne volontairement ce
// graphe, comme le fait déjà changerStatut(..., bypassTransitionCheck)
// pour les signalements. 'attente_verification' → 'attente_agent'
// (24/09/2026) : uniquement via vérification email réussie côté visiteur,
// jamais une action agent — absent de tout accès agent par construction
// (aucune fonction agent ne part de ce statut).
export const SUPPORT_TRANSITIONS: Record<SupportStatut, SupportStatut[]> = {
  attente_verification: ["attente_agent"],
  attente_agent: ["en_cours"],
  en_cours: ["resolu"],
  resolu: ["cloture"],
  cloture: [],
};

export const SUPPORT_PRIORITES = ["basse", "normale", "haute", "urgente"] as const;
export type SupportPriorite = (typeof SUPPORT_PRIORITES)[number];

export const SUPPORT_PRIORITE_LABELS: Record<SupportPriorite, string> = {
  basse: "Basse",
  normale: "Normale",
  haute: "Haute",
  urgente: "Urgente",
};

// Priorité déterminée par catégorie, jamais choisie par le citoyen (brief
// section 19 : "ne pas permettre au citoyen de mettre arbitrairement
// URGENT"). Seul un agent peut escalader manuellement (hors périmètre de
// ce lot — pas d'action d'escalade construite tant que non demandée).
export function prioriteInitiale(categorie: SupportCategorie | SupportCategorieInstitution | SupportCategoriePublic): SupportPriorite {
  return categorie === "securite" ? "haute" : "normale";
}

// email_verifie (24/09/2026) : traçabilité du moment où un visiteur a
// prouvé la propriété de son email — inséré avec 'created' au moment de
// la vérification, jamais à la création du ticket (voir
// lib/supportTickets.ts::creerTicketPublic, écriture différée délibérée).
export const SUPPORT_EVENT_TYPES = [
  "created", "assigned", "message_sent", "resolved", "reopened", "closed", "email_verifie",
] as const;
export type SupportEventType = (typeof SUPPORT_EVENT_TYPES)[number];

export type SupportContexteType = "rdv" | "paiement" | "document";

// Validation email minimale (Support Public, 24/09/2026) — aucun
// validateur email partagé trouvé ailleurs dans le projet au moment de ce
// chantier ; volontairement non exhaustif (RFC 5322 complet hors de
// portée utile ici), suffisant pour rejeter une saisie manifestement
// invalide côté serveur (jamais fait confiance à la seule validation
// HTML5 côté client).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

// Évaluation "Support Yelen" (fin de conversation, 04/09/2026) — même
// discipline que le reste du ticketing : citoyen note l'expérience humaine
// uniquement (jamais un score IA), une seule fois par conversation
// (contrainte UNIQUE sur support_ticket_ratings.ticket_id, voir migration
// 20260904000003). Raisons dépendantes de la note (brief section 6) : les
// deux listes partagent "autre" par simplicité (même libellé affiché dans
// les deux contextes, la note elle-même distingue déjà positif/négatif).
export const SUPPORT_RATING_RAISONS_POSITIVES = [
  "reponse_rapide", "agent_a_lecoute", "probleme_resolu", "explications_claires", "autre",
] as const;
export type SupportRatingRaisonPositive = (typeof SUPPORT_RATING_RAISONS_POSITIVES)[number];

export const SUPPORT_RATING_RAISONS_NEGATIVES = [
  "temps_attente", "reponse_support", "probleme_non_resolu", "explications_insuffisantes", "autre",
] as const;
export type SupportRatingRaisonNegative = (typeof SUPPORT_RATING_RAISONS_NEGATIVES)[number];

export type SupportRatingRaison = SupportRatingRaisonPositive | SupportRatingRaisonNegative;

export function isSupportRatingRaison(value: string): value is SupportRatingRaison {
  return (SUPPORT_RATING_RAISONS_POSITIVES as readonly string[]).includes(value)
    || (SUPPORT_RATING_RAISONS_NEGATIVES as readonly string[]).includes(value);
}

export const SUPPORT_RATING_RAISON_LABELS: Record<SupportRatingRaison, string> = {
  reponse_rapide: "Réponse rapide",
  agent_a_lecoute: "Agent à l'écoute",
  probleme_resolu: "Problème résolu",
  explications_claires: "Explications claires",
  temps_attente: "Temps d'attente",
  reponse_support: "Réponse du support",
  probleme_non_resolu: "Problème non résolu",
  explications_insuffisantes: "Explications insuffisantes",
  autre: "Autre",
};

export const SUPPORT_RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Très insatisfait",
  2: "Insatisfait",
  3: "Moyennement satisfait",
  4: "Satisfait",
  5: "Très satisfait",
};

// Cookie de session de suivi visiteur (Support Public, 24/09/2026) — porte
// le token de suivi brut, httpOnly, jamais lu côté client JS. Constante
// partagée entre app/api/support/public/suivi/*/route.ts et
// app/support/suivi/page.tsx pour qu'aucune route ne puisse diverger sur
// le nom (avant ce partage, uniquement dupliqué en local dans
// suivi/session/route.ts).
export const SUPPORT_SUIVI_COOKIE_NAME = "yelen224_support_suivi";
