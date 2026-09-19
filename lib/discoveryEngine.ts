// Guidance / Découverte — v2 (27/08/2026, cycle de vie/cooldown/diversité).
// Moteur pur, déterministe, zéro LLM, zéro accès DB à l'intérieur de ce
// fichier : le DiscoveryState est toujours injecté par l'appelant (même
// contrat que lib/attentionEngine.ts pour CitizenState). Ce fichier est la
// "couche 2" du brief — Guidance / Découverte — volontairement séparée de :
// - la couche 1, État d'attention (lib/attentionEngine.ts) : ce qui bloque
//   réellement ou a une échéance à conséquence. Cette couche gagne TOUJOURS
//   contre la présente — l'arbitrage se fait à l'intégration accueil, jamais
//   ici. Ses règles métier ne sont pas modifiées par ce fichier.
// - la couche 3, État de vie (déjà renvoyée par attentionEngine.ts).
//
// Toute règle de sélection/priorité de découverte doit rester dans ce
// fichier, jamais dupliquée ailleurs (même discipline que attentionEngine.ts
// ligne 9-11) — c'est ce qui la rend testable et ce qui permet de répondre
// à "pourquoi Yelen me montre-t-il ceci maintenant ?" (brief §8/§14).
import type { Effort } from "./attentionEngine";

export type DiscoverySourceType =
  | "rdv" | "demarche" | "depense" | "interet" | "offre" | "community" | "lecon" | "calculatrice" | "reward";

// Reprise = reprendre une action déjà commencée ailleurs dans Yelen.
// Comportementale = dérivée d'un vrai pattern d'usage (jamais un chiffre
// inventé — voir DiscoveryState.engagement/secteur_top, toujours calculé
// par l'appelant à partir de données réelles).
// Decouverte = présenter une fonctionnalité jamais utilisée.
// Nouveaute = contenu frais objectivement daté (ex. offre/annonce récente).
// Progression = positif, jamais remonté au-dessus d'une découverte réelle.
export type DiscoveryType = "reprise" | "comportementale" | "decouverte" | "nouveaute" | "progression";

// Niveau de pertinence (brief §7) — priorité entre familles de raisons,
// distincte du "type" (qui décrit la NATURE de la recommandation) :
// A = événement concret déjà engagé (ex. reprendre une démarche liée à un
//     RDV réel) — le plus fort, mais jamais aussi urgent qu'un Tier
//     attentionEngine (ce n'est pas un blocage, juste un fait concret).
// B = opportunité dérivée d'un comportement réel observé (fréquence, usage).
// C = découverte personnalisée (gated par un signal personnel déclaré :
//     centre d'intérêt, offre correspondante).
// D = découverte générale, à utiliser très rarement (nouveau citoyen sans
//     aucun signal encore disponible).
export type NiveauPertinence = "A" | "B" | "C" | "D";

// Échelle de confiance progressive (brief §7/§13) : un clic ne vaut pas une
// préférence. Alimentée par la lecture de citoyen_recommendation_events —
// jamais recalculée ici.
export type Confiance = "vu" | "ouvert" | "utilise" | "utilise_regulierement";

// Palier de découverte progressive (brief §12) — état persisté (décision
// actée avec Bryan), consommé ici en lecture seule.
export type StadeDecouverte = "premiere_session" | "decouverte" | "personnalisation" | "historique_riche";

export type RecommendationCandidate = {
  // Identité stable dans le temps (source_type + categorie) — sert de clé
  // au cooldown/à la mémoire comportementale, indépendamment du jour où la
  // carte est générée (brief §2 : "suggestion_id").
  suggestion_id: string;
  source_type: DiscoverySourceType;
  source_id: string | null;
  categorie: string;
  type: DiscoveryType;
  niveau: NiveauPertinence;
  // Résumé stable du fait réel ayant produit CE candidat précis — si cette
  // valeur change par rapport à la dernière exposition, un cooldown/une
  // suppression en cours est levé (brief §6, "un nouvel événement peut
  // réactiver une suggestion").
  signature: string;
  titre: string;
  // Texte citoyen : pourquoi cette recommandation, en langage clair.
  interpretation: string;
  // Fait réel, court, technique — sert à répondre "quel fait a déclenché
  // ceci ?" (brief §8/§14), jamais montré au citoyen tel quel.
  raison: string;
  action: { label: string; effort: Effort; destination: string } | null;
  // Score interne 0-100 (brief §14/§16) — dérivé du type, de la confiance
  // réelle déjà observée et de l'effort requis. Sert au classement dans
  // classerEtLimiter, jamais affiché au citoyen.
  priorite: number;
  // Étiquette visuelle (brief §10) — dérivée du type, jamais automatique
  // sur toutes les cartes (progression n'en a délibérément aucune : un
  // signal positif n'a pas besoin d'être vendu).
  badge: string | null;
  // Cet objet représente TOUJOURS un candidat fraîchement (re)calculé —
  // "candidate" est donc la seule valeur produite ici. Les étapes
  // suivantes du cycle de vie (shown/clicked/completed/dismissed/expired/
  // suppressed du brief §2) ne sont pas des mutations de cet objet : elles
  // sont dérivées de citoyen_recommendation_events par suggestion_id
  // (lib/discoveryMemory.ts), jamais stockées ici.
  etat: "candidate";
  confiance: Confiance | null;
  shown_at: string | null;
  interaction_at: string | null;
  rule_version: string;
  created_at: string;
  // Horizon de fraîcheur honnête (brief §3 : "aujourd'hui" doit vouloir
  // dire aujourd'hui) — pas un mécanisme de cache, le moteur recalcule de
  // toute façon à chaque appel ; sert à ce que l'objet ne mente jamais sur
  // sa durée de validité réelle.
  expires_at: string;
};

export type EngagementEntry = {
  confiance: Confiance;
  // Nombre de jours distincts où la recommandation a été montrée sans
  // interaction réelle depuis la dernière fois qu'elle a été ouverte/
  // utilisée — remplace l'ancien compteur binaire (brief §5 : escalade
  // progressive, jamais une suppression définitive).
  ignorances_consecutives: number;
  derniere_vue_le: string | null;
  derniere_interaction_le: string | null;
  // Signature au moment de la dernière exposition — comparée à la
  // signature du candidat recalculé aujourd'hui pour détecter un contexte
  // réellement nouveau (brief §6).
  derniere_signature: string | null;
};

export type DiscoveryState = {
  citoyen_id: string;
  stade_decouverte: StadeDecouverte;
  // Comptes "jamais activé" (brief "Comptes existants sans activité" §1,
  // États A/B) : distingue un compte réellement nouveau d'un compte ancien
  // n'ayant jamais agi — le stade lui-même (premiere_session) ne fait pas
  // cette distinction, elle sert uniquement au TEXTE affiché, jamais à la
  // mécanique de sélection (brief §17 : ne jamais exposer "vous n'avez rien
  // fait depuis 3 mois", seulement adapter le ton).
  compte_cree_le: string;
  // Date du dernier fait réel (RDV, démarche, dépense) tous confondus, le
  // plus récent — États D/E (brief) : sert à détecter un retour après
  // inactivité prolongée SANS faire régresser stade_decouverte (qui ne
  // régresse jamais par design, voir discoveryProgression.ts) — additif,
  // pas un remplacement du palier de maturité.
  derniere_activite_le: string | null;
  nb_rdv_total: number;
  nb_demarches_total: number;
  nb_depenses_total: number;
  a_favoris: boolean;
  centres_interet: string[];
  // Secteur le plus fréquenté d'après l'historique RDV réel du citoyen —
  // même logique que app/recherche/RechercheInner.tsx (à réutiliser, jamais
  // dupliquer un second seuil, cf. piège déjà rencontré sur les anomalies
  // de dépenses dans citizenStateBuilder.ts).
  secteur_top: { secteur: string; label: string } | null;
  // Une seule offre candidate déjà filtrée par l'appelant sur un intérêt
  // déclaré réel — ce fichier ne choisit jamais parmi plusieurs offres.
  offre_interet: { id: string; titre: string; categorie: string; date_expiration: string | null } | null;
  // Historique d'engagement par fonctionnalité — absent = jamais vu.
  engagement: Partial<Record<DiscoverySourceType, EngagementEntry>>;
  // Familles déjà couvertes aujourd'hui par une autre section de l'accueil
  // (À faire / Cette semaine) — brief §12 : une même famille de signal ne
  // doit jamais apparaître deux fois sur l'accueil. Toujours calculé par
  // l'appelant à partir des vrais résultats de attentionEngine.ts/
  // semaineEngine.ts, jamais recalculé ici (ce fichier reste agnostique de
  // ces deux moteurs).
  familles_deja_couvertes: DiscoverySourceType[];
};

// Cartographie fonctionnalité → signal → CTA (documentation vivante ET
// source unique pour les libellés/destinations par défaut ci-dessous —
// jamais un libellé recopié à la main ailleurs).
export const FEATURE_CATALOGUE: Record<DiscoverySourceType, {
  label: string;
  donnee_disponible: string;
  evenement_declencheur: string;
  condition_eligibilite: string;
  valeur_apportee: string;
  cta_label: string;
  destination: string;
}> = {
  rdv: {
    label: "Rendez-vous",
    donnee_disponible: "rdv (nb_rdv_total)",
    evenement_declencheur: "aucun RDV pris depuis l'inscription",
    condition_eligibilite: "nb_rdv_total === 0",
    valeur_apportee: "accomplir l'objectif le plus probable d'un nouveau citoyen",
    cta_label: "Prendre un rendez-vous",
    destination: "/recherche",
  },
  demarche: {
    label: "Mes démarches",
    donnee_disponible: "citoyen_demarches (nb_demarches_total)",
    evenement_declencheur: "un RDV existe mais aucune démarche n'a jamais été créée",
    condition_eligibilite: "nb_rdv_total > 0 && nb_demarches_total === 0",
    valeur_apportee: "centraliser étapes et documents liés à une démarche déjà en cours dans la vraie vie",
    cta_label: "Découvrir Mes démarches",
    destination: "/compte/mes-demarches",
  },
  depense: {
    label: "Mes dépenses",
    donnee_disponible: "citoyen_depenses (nb_depenses_total)",
    evenement_declencheur: "le citoyen utilise déjà démarches/rdv mais n'a jamais enregistré de dépense",
    condition_eligibilite: "nb_depenses_total === 0 && (nb_rdv_total > 0 || nb_demarches_total > 0)",
    valeur_apportee: "suivre le rythme budgétaire réel plutôt qu'une estimation",
    cta_label: "Découvrir Mes dépenses",
    destination: "/menu/depenses",
  },
  interet: {
    label: "Vos centres d'intérêt",
    donnee_disponible: "users.centres_interet",
    evenement_declencheur: "aucun centre d'intérêt déclaré",
    condition_eligibilite: "centres_interet.length === 0",
    valeur_apportee: "permettre une personnalisation immédiate des recommandations futures",
    cta_label: "Choisir mes centres d'intérêt",
    destination: "/menu/interets",
  },
  offre: {
    label: "Offres partenaires",
    donnee_disponible: "offres (via offre_interet, déjà filtrée sur un intérêt réel par l'appelant)",
    evenement_declencheur: "une offre active correspond à un centre d'intérêt déclaré",
    condition_eligibilite: "offre_interet !== null",
    valeur_apportee: "un avantage concret déjà pertinent, pas une liste à parcourir",
    cta_label: "Voir l'offre",
    destination: "/offres",
  },
  community: {
    label: "Yelen Community",
    donnee_disponible: "a_favoris, secteur_top",
    evenement_declencheur: "le citoyen a un secteur d'usage établi (≥3 RDV) mais n'a jamais visité l'onglet Communauté",
    condition_eligibilite: "secteur_top !== null && !engagement.community",
    valeur_apportee: "échanger avec d'autres citoyens/professionnels du même secteur",
    cta_label: "Découvrir Yelen Community",
    destination: "/?tab=communaute",
  },
  lecon: {
    label: "Yelen Leçons",
    donnee_disponible: "centres_interet, engagement.lecon",
    evenement_declencheur: "un centre d'intérêt financier est déclaré mais aucune leçon consultée",
    condition_eligibilite: "centres_interet.length > 0 && !engagement.lecon",
    valeur_apportee: "apprendre un réflexe financier concret lié à un intérêt déjà exprimé",
    cta_label: "Découvrir Yelen Leçons",
    destination: "/menu/lecons-argent",
  },
  calculatrice: {
    label: "Yelen Calculator",
    donnee_disponible: "nb_depenses_total, engagement.calculatrice",
    evenement_declencheur: "le citoyen suit déjà ses dépenses mais n'a jamais utilisé la calculatrice",
    condition_eligibilite: "nb_depenses_total >= 3 && !engagement.calculatrice",
    valeur_apportee: "simuler un microcrédit ou une épargne à partir d'un rythme déjà observé",
    cta_label: "Découvrir la Calculatrice",
    destination: "/menu/calculatrice",
  },
  reward: {
    label: "Yelen Rewards",
    donnee_disponible: "engagement.reward",
    evenement_declencheur: "le citoyen a une activité réelle (RDV/démarches) mais n'a jamais consulté ses récompenses",
    condition_eligibilite: "(nb_rdv_total > 0 || nb_demarches_total > 0) && !engagement.reward",
    valeur_apportee: "rendre visible une valeur déjà accumulée par l'usage réel de Yelen",
    cta_label: "Voir Yelen Rewards",
    destination: "/menu/recompenses",
  },
};

const RULE_VERSION = "discovery_v4";

// Score interne 0-100 (brief §14/§16) : poids de base par type (reprise =
// un fait déjà engagé, le plus fort ; progression = le plus doux), bonus
// si un engagement réel existe déjà sur cette fonctionnalité, bonus si
// l'action demande peu d'effort. Remplace l'ancien tri par confiance qui
// ne fonctionnait jamais en pratique (confiance toujours null au moment du
// tri, avant l'enrichissement final de calculerDecouverte).
const TYPE_SCORE: Record<DiscoveryType, number> = { reprise: 90, comportementale: 70, nouveaute: 60, decouverte: 50, progression: 30 };
const CONFIANCE_BONUS: Record<Confiance, number> = { utilise_regulierement: 15, utilise: 10, ouvert: 5, vu: 0 };
const EFFORT_BONUS: Record<Effort, number> = { faible: 5, moyen: 2, eleve: 0 };

function calculerPriorite(type: DiscoveryType, confiance: Confiance | undefined, effort: Effort | null): number {
  return TYPE_SCORE[type] + (confiance ? CONFIANCE_BONUS[confiance] : 0) + (effort ? EFFORT_BONUS[effort] : 0);
}

// Badge affiché (brief §10) — dérivé du type, jamais automatique sur
// toutes les cartes : une "progression" (signal positif déjà acquis) n'a
// pas besoin d'étiquette pour se justifier.
const BADGE_PAR_TYPE: Record<DiscoveryType, string | null> = {
  reprise: "RECOMMANDÉ",
  comportementale: "POUR VOUS",
  decouverte: "À DÉCOUVRIR",
  nouveaute: "SUGGÉRÉ",
  progression: null,
};

// Fenêtre de fraîcheur/cooldown de base par niveau (brief §4 : "le cooldown
// doit dépendre du type de suggestion" — ici du niveau, plus stable que le
// type). A est concret donc peut revenir vite si la situation persiste ; D
// est générale donc ne doit quasiment jamais insister.
const COOLDOWN_JOURS: Record<NiveauPertinence, number> = { A: 2, B: 5, C: 7, D: 14 };

// "Déjà utilisé" ne veut dire que confiance >= "utilise" (brief §7 : un
// clic ne vaut pas une préférence). Un simple "vu"/"ouvert" jamais suivi
// d'usage réel ne doit jamais supprimer la proposition — sinon une seule
// exposition ignorée suffirait à effacer la fonctionnalité pour toujours.
function dejaUtilise(state: DiscoveryState, source: DiscoverySourceType): boolean {
  const confiance = state.engagement[source]?.confiance;
  return confiance === "utilise" || confiance === "utilise_regulierement";
}

// Primitives de fraîcheur/cooldown — génériques (aucune dépendance à
// DiscoverySourceType/NiveauPertinence), exportées pour être réutilisées
// telles quelles par tout autre moteur de sélection basé sur
// citoyen_recommendation_events (ex. lib/semaineEngine.ts) plutôt que de
// dupliquer ce calcul (même discipline anti-duplication que ce fichier
// applique déjà à lui-même, ligne 12-15).
export function joursEntre(depuisISO: string | null, nowISO: string): number {
  if (!depuisISO) return Infinity;
  return Math.floor((new Date(nowISO).getTime() - new Date(depuisISO).getTime()) / 86400000);
}

export function dansNJours(nowISO: string, n: number): string {
  const d = new Date(nowISO);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// Escalade progressive du cooldown (brief §5) : 1er affichage ignoré →
// cooldown de base, 2e → doublé, 3e → quadruplé, 4e+ → suppression tant
// qu'aucun nouveau signal réel n'apparaît (jamais une suppression
// permanente pure, cf. brief §6 et le même principe déjà retenu pour
// attentionMemory.ts).
export function cooldownEffectifJours(baseJours: number, ignorancesConsecutives: number): number | null {
  if (ignorancesConsecutives <= 0) return 0;
  if (ignorancesConsecutives === 1) return baseJours;
  if (ignorancesConsecutives === 2) return baseJours * 2;
  if (ignorancesConsecutives === 3) return baseJours * 4;
  return null;
}

// Un candidat est éligible sauf s'il est actuellement en cooldown/suppression
// ET que le contexte réel n'a pas changé depuis sa dernière exposition
// (brief §6 : un nouveau signal fort peut réactiver une suggestion malgré
// un cooldown en cours, avec une nouvelle raison).
export function estEligible(e: EngagementEntry | undefined, baseJours: number, signature: string, nowISO: string): boolean {
  if (!e) return true;
  if (e.derniere_signature !== null && e.derniere_signature !== signature) return true;
  const cooldown = cooldownEffectifJours(baseJours, e.ignorances_consecutives);
  if (cooldown === null) return false;
  return joursEntre(e.derniere_vue_le, nowISO) >= cooldown;
}

function eligible(state: DiscoveryState, source: DiscoverySourceType, niveau: NiveauPertinence, signature: string, nowISO: string): boolean {
  if (state.familles_deja_couvertes.includes(source)) return false;
  return estEligible(state.engagement[source], COOLDOWN_JOURS[niveau], signature, nowISO);
}

// États A/B/D/E (brief "Comptes existants sans activité") — seuils raisonnés,
// pas mesurés sur données réelles (aucun historique produit encore assez de
// volume pour ça) : documentés ici plutôt que cachés dans un nombre magique.
const COMPTE_RECENT_JOURS = 7; // État A (nouveau) vs État B (jamais activé).
const SEUIL_RETOUR_JOURS = 60; // États D/E : inactivité réelle prolongée malgré un historique existant.

// État A vs B — ne sert qu'au TEXTE des candidats premiere_session, jamais
// à leur éligibilité (un compte ancien jamais activé a autant droit aux
// mêmes candidats qu'un compte neuf, brief §1).
function estCompteRecent(state: DiscoveryState, nowISO: string): boolean {
  return joursEntre(state.compte_cree_le, nowISO) <= COMPTE_RECENT_JOURS;
}

// États D/E — additif à stade_decouverte, ne le fait jamais régresser
// (règle déjà actée dans discoveryProgression.ts). Un compte encore en
// "premiere_session" n'a par définition aucune activité réelle passée à
// laquelle "revenir" — le retour ne concerne que quelqu'un ayant déjà
// dépassé ce stade.
function estEnRetour(state: DiscoveryState, nowISO: string): boolean {
  // derniere_activite_le absent = inconnu, jamais "infiniment inactif" —
  // joursEntre(null,…) renvoie Infinity (comportement correct pour un
  // cooldown jamais vu), mais serait un faux positif ici.
  if (state.derniere_activite_le === null) return false;
  return state.stade_decouverte !== "premiere_session" && joursEntre(state.derniere_activite_le, nowISO) >= SEUIL_RETOUR_JOURS;
}

// Fonctionnalité la plus engagée (confiance réelle "utilise"/"utilise
// régulièrement") — sert de base à la reprise, jamais un choix arbitraire.
function fonctionnaliteLaPlusEngagee(state: DiscoveryState): DiscoverySourceType | null {
  let meilleure: DiscoverySourceType | null = null;
  let meilleurRang = 0;
  for (const cle of Object.keys(state.engagement) as DiscoverySourceType[]) {
    const confiance = state.engagement[cle]?.confiance;
    const rang = confiance === "utilise_regulierement" ? 2 : confiance === "utilise" ? 1 : 0;
    if (rang > meilleurRang) { meilleurRang = rang; meilleure = cle; }
  }
  return meilleure;
}

function construireCandidat(
  state: DiscoveryState,
  source_type: DiscoverySourceType, categorie: string, type: DiscoveryType, niveau: NiveauPertinence, signature: string,
  titre: string, interpretation: string, raison: string,
  action: RecommendationCandidate["action"], nowISO: string, expiresAtISO: string
): RecommendationCandidate {
  return {
    suggestion_id: `${source_type}:${categorie}`, source_type, source_id: null, categorie, type, niveau, signature,
    titre, interpretation, raison, action,
    priorite: calculerPriorite(type, state.engagement[source_type]?.confiance, action?.effort ?? null),
    badge: BADGE_PAR_TYPE[type],
    etat: "candidate",
    confiance: null, shown_at: null, interaction_at: null,
    rule_version: RULE_VERSION, created_at: nowISO, expires_at: expiresAtISO,
  };
}

// Textes États A (nouveau, compte créé récemment) vs B (jamais activé,
// même signal comportemental mais compte plus ancien) — brief §1 : "comme
// un nouveau, juste contenu différent". La mécanique de sélection en amont
// reste strictement identique entre A et B, seul le texte change.
const COLD_START_COPY: Record<"rdv" | "demarche" | "community", { nouveau: { titre: string; interpretation: string }; ancien: { titre: string; interpretation: string } }> = {
  rdv: {
    nouveau: { titre: "Prendre votre premier rendez-vous", interpretation: "Vous pouvez réserver un rendez-vous auprès d'un hôpital, d'une mairie, d'une banque ou d'une ambassade." },
    ancien: { titre: "Toujours aucun rendez-vous pris", interpretation: "Réservez en quelques secondes auprès d'un hôpital, d'une mairie, d'une banque ou d'une ambassade." },
  },
  demarche: {
    nouveau: { titre: "Suivre vos démarches au même endroit", interpretation: "Enregistrez les étapes et documents d'une démarche que vous avez déjà commencée dans la vraie vie." },
    ancien: { titre: "Une démarche en cours dans la vraie vie ?", interpretation: "Suivez ses étapes et documents au même endroit, sans repartir de zéro." },
  },
  community: {
    nouveau: { titre: "Découvrez Yelen Community", interpretation: "Échangez avec des professionnels, entrepreneurs et membres de la communauté." },
    ancien: { titre: "Vous n'avez pas encore exploré Yelen Community", interpretation: "Échangez avec des professionnels, entrepreneurs et membres de la communauté." },
  },
};

function construireCandidatRetour(state: DiscoveryState, now: string): RecommendationCandidate | null {
  const sig = `retour:${state.derniere_activite_le}`;
  const engagee = fonctionnaliteLaPlusEngagee(state);

  if (state.secteur_top && eligible(state, "rdv", "A", sig, now)) {
    return construireCandidat(
      state, "rdv", "retour_secteur", "reprise", "A", sig,
      "Cela fait un moment !",
      `Vous alliez régulièrement dans des établissements ${state.secteur_top.label} — envie de reprendre ?`,
      `derniere_activite_le=${state.derniere_activite_le}, secteur_top=${state.secteur_top.secteur}`,
      { label: "Reprendre", effort: "faible", destination: "/recherche" },
      now, dansNJours(now, COOLDOWN_JOURS.A),
    );
  }
  if (engagee && eligible(state, engagee, "A", sig, now)) {
    return construireCandidat(
      state, engagee, "retour_habitude", "reprise", "A", sig,
      "Reprenez où vous en étiez",
      `Vous utilisiez ${FEATURE_CATALOGUE[engagee].label} régulièrement — elle vous attend.`,
      `derniere_activite_le=${state.derniere_activite_le}, engagement.${engagee}=utilise`,
      { label: FEATURE_CATALOGUE[engagee].cta_label, effort: "faible", destination: FEATURE_CATALOGUE[engagee].destination },
      now, dansNJours(now, COOLDOWN_JOURS.A),
    );
  }
  if ((state.nb_rdv_total > 0 || state.nb_demarches_total > 0) && eligible(state, "rdv", "A", sig, now)) {
    return construireCandidat(
      state, "rdv", "retour_generique", "reprise", "A", sig,
      "Cela fait un moment qu'on ne vous a pas vu",
      "Retrouvez votre historique et reprenez vos rendez-vous et démarches là où vous les avez laissés.",
      `derniere_activite_le=${state.derniere_activite_le}`,
      { label: "Retrouver mon espace", effort: "faible", destination: "/mes-rdv" },
      now, dansNJours(now, COOLDOWN_JOURS.A),
    );
  }
  return null;
}

function construireCandidats(state: DiscoveryState, now: string): RecommendationCandidate[] {
  const candidats: RecommendationCandidate[] = [];
  const horizon = (niveau: NiveauPertinence) => dansNJours(now, COOLDOWN_JOURS[niveau]);

  // États D/E (brief) — additif, n'écarte jamais les autres candidats du
  // stade réel : un retour après absence gagne presque toujours (score de
  // type "reprise" le plus élevé) sans empêcher un signal réel concurrent.
  if (estEnRetour(state, now)) {
    const retour = construireCandidatRetour(state, now);
    if (retour) candidats.push(retour);
  }

  // Bandeau centres d'intérêt (brief "Bandeau d'activation des centres
  // d'intérêt") — FEATURE_CATALOGUE.interet documentait déjà ce signal sans
  // jamais être construit en candidat réel. Additif comme le retour
  // ci-dessus : jamais pour un compte déjà personnalisation/historique_riche
  // même sans centres d'intérêt déclarés (brief §7 — "je vous connais déjà
  // grâce à votre utilisation"), uniquement quand le moteur estime encore
  // manquer de signal comportemental.
  if (state.centres_interet.length === 0
      && (state.stade_decouverte === "premiere_session" || state.stade_decouverte === "decouverte")
      && eligible(state, "interet", "D", "centres_interet_absent", now)) {
    candidats.push(construireCandidat(
      state, "interet", "activation_interets", "decouverte", "D", "centres_interet_absent",
      "Découvrez Yelen selon vos intérêts",
      "Dites-nous ce qui vous intéresse et nous adapterons les suggestions affichées sur votre accueil.",
      `centres_interet=[], stade=${state.stade_decouverte}`,
      { label: FEATURE_CATALOGUE.interet.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.interet.destination },
      now, dansNJours(now, COOLDOWN_JOURS.D),
    ));
  }

  // --- Première session : 2-3 possibilités maximum, jamais un catalogue --
  // Niveau D partout : aucun signal personnel encore disponible sauf un
  // centre d'intérêt déjà déclaré (niveau C, brief §4 Niveau 1). Pool élargi
  // à 5 candidats réels (brief "Comptes existants sans activité" §7) pour
  // qu'un compte durablement inactif ne puisse jamais épuiser tout le pool
  // en même temps par escalade de cooldown — c'est exactement ce qui
  // produisait un accueil vide avant ce correctif.
  if (state.stade_decouverte === "premiere_session") {
    const recent = estCompteRecent(state, now);
    const sigLeconCold = [...state.centres_interet].sort().join(",");
    if (state.centres_interet.length > 0 && eligible(state, "lecon", "C", sigLeconCold, now)) {
      candidats.push(construireCandidat(
        state,
        "lecon", "lecons_interet", "decouverte", "C", sigLeconCold,
        "Vous avez besoin d'apprendre quelque chose ?",
        "Découvrez Yelen Leçons, en lien avec vos centres d'intérêt.",
        `centres_interet=[${state.centres_interet.join(",")}], stade=premiere_session`,
        { label: FEATURE_CATALOGUE.lecon.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.lecon.destination },
        now, horizon("C"),
      ));
    }
    if (state.nb_rdv_total === 0 && eligible(state, "rdv", "D", "premiere_session", now)) {
      const c = recent ? COLD_START_COPY.rdv.nouveau : COLD_START_COPY.rdv.ancien;
      candidats.push(construireCandidat(
        state,
        "rdv", "premier_rdv", "decouverte", "D", "premiere_session",
        c.titre, c.interpretation,
        `nb_rdv_total=0, stade=premiere_session, compte_recent=${recent}`,
        { label: FEATURE_CATALOGUE.rdv.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.rdv.destination },
        now, horizon("D"),
      ));
    }
    if (state.nb_demarches_total === 0 && eligible(state, "demarche", "D", "premiere_session", now)) {
      const c = recent ? COLD_START_COPY.demarche.nouveau : COLD_START_COPY.demarche.ancien;
      candidats.push(construireCandidat(
        state,
        "demarche", "suivi_demarches", "decouverte", "D", "premiere_session",
        c.titre, c.interpretation,
        `nb_demarches_total=0, stade=premiere_session, compte_recent=${recent}`,
        { label: FEATURE_CATALOGUE.demarche.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.demarche.destination },
        now, horizon("D"),
      ));
    }
    if (state.nb_depenses_total === 0 && eligible(state, "depense", "D", "premiere_session", now)) {
      candidats.push(construireCandidat(
        state,
        "depense", "suivi_depenses", "decouverte", "D", "premiere_session",
        "Gérez votre budget simplement",
        "Suivez vos dépenses et gardez une vision claire de votre rythme financier.",
        `nb_depenses_total=0, stade=premiere_session, compte_recent=${recent}`,
        { label: FEATURE_CATALOGUE.depense.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.depense.destination },
        now, horizon("D"),
      ));
    }
    if (!dejaUtilise(state, "community") && eligible(state, "community", "D", "premiere_session", now)) {
      const c = recent ? COLD_START_COPY.community.nouveau : COLD_START_COPY.community.ancien;
      candidats.push(construireCandidat(
        state,
        "community", "decouverte_communaute", "decouverte", "D", "premiere_session",
        c.titre, c.interpretation,
        `engagement.community=absent, stade=premiere_session, compte_recent=${recent}`,
        { label: FEATURE_CATALOGUE.community.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.community.destination },
        now, horizon("D"),
      ));
    }
    return classerEtLimiter(candidats, 3);
  }

  // --- Découverte (au moins une action réelle posée) : une fonctionnalité
  // complémentaire à la fois, jamais plusieurs en même temps --------------
  if (state.stade_decouverte === "decouverte") {
    const sigDemarche = `nb_rdv_total=${state.nb_rdv_total}`;
    if (state.nb_rdv_total > 0 && state.nb_demarches_total === 0 && eligible(state, "demarche", "A", sigDemarche, now)) {
      candidats.push(construireCandidat(
        state,
        "demarche", "suivi_demarches", "reprise", "A", sigDemarche,
        "Besoin d'un autre document ?",
        "Vous pouvez conserver vos démarches, leurs étapes et documents associés au même endroit.",
        "nb_rdv_total>0, nb_demarches_total=0, stade=decouverte",
        { label: FEATURE_CATALOGUE.demarche.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.demarche.destination },
        now, horizon("A"),
      ));
    } else {
      const sigDepense = `nb_rdv=${state.nb_rdv_total},nb_demarches=${state.nb_demarches_total}`;
      if ((state.nb_rdv_total > 0 || state.nb_demarches_total > 0) && state.nb_depenses_total === 0 && eligible(state, "depense", "B", sigDepense, now)) {
        candidats.push(construireCandidat(
          state,
          "depense", "suivi_depenses", "decouverte", "B", sigDepense,
          "Mieux suivre votre argent ?",
          "Enregistrez vos dépenses et gardez une vision claire de votre budget mensuel.",
          "nb_depenses_total=0 malgré activité réelle, stade=decouverte",
          { label: FEATURE_CATALOGUE.depense.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.depense.destination },
          now, horizon("B"),
        ));
      }
    }
    return classerEtLimiter(candidats, 1);
  }

  // --- Personnalisation / historique riche : comportemental, dérivé d'un
  // vrai signal, jamais un contenu générique -------------------------------
  const sigLecon = [...state.centres_interet].sort().join(",");
  if (state.centres_interet.length > 0 && !dejaUtilise(state, "lecon") && eligible(state, "lecon", "C", sigLecon, now)) {
    candidats.push(construireCandidat(
      state,
      "lecon", "lecons_interet", "comportementale", "C", sigLecon,
      "Vous avez besoin d'apprendre quelque chose ?",
      "Découvrez Yelen Leçons, en lien avec vos centres d'intérêt.",
      `centres_interet=[${state.centres_interet.join(",")}], engagement.lecon=absent`,
      { label: FEATURE_CATALOGUE.lecon.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.lecon.destination },
      now, horizon("C"),
    ));
  }
  const sigCalc = `nb_depenses_total=${state.nb_depenses_total}`;
  if (state.nb_depenses_total >= 3 && !dejaUtilise(state, "calculatrice") && eligible(state, "calculatrice", "B", sigCalc, now)) {
    candidats.push(construireCandidat(
      state,
      "calculatrice", "simulation_budget", "comportementale", "B", sigCalc,
      "Une nouvelle façon de gérer vos dépenses",
      "Vous pouvez créer un budget ou simuler un microcrédit à partir de votre rythme réel.",
      `nb_depenses_total=${state.nb_depenses_total}, engagement.calculatrice=absent`,
      { label: FEATURE_CATALOGUE.calculatrice.cta_label, effort: "moyen", destination: FEATURE_CATALOGUE.calculatrice.destination },
      now, horizon("B"),
    ));
  }
  if (state.offre_interet) {
    const sigOffre = state.offre_interet.id;
    if (eligible(state, "offre", "C", sigOffre, now)) {
      const horizonOffre = state.offre_interet.date_expiration && state.offre_interet.date_expiration < horizon("C")
        ? state.offre_interet.date_expiration : horizon("C");
      candidats.push(construireCandidat(
        state,
        "offre", state.offre_interet.categorie, "nouveaute", "C", sigOffre,
        state.offre_interet.titre,
        "Cette offre correspond à un centre d'intérêt que vous avez déclaré.",
        `offre_interet.id=${state.offre_interet.id}, categorie=${state.offre_interet.categorie}`,
        { label: FEATURE_CATALOGUE.offre.cta_label, effort: "faible", destination: `/offres/${state.offre_interet.id}` },
        now, horizonOffre,
      ));
    }
  }
  if (state.secteur_top && !dejaUtilise(state, "community")) {
    const sigCommunity = state.secteur_top.secteur;
    if (eligible(state, "community", "B", sigCommunity, now)) {
      candidats.push(construireCandidat(
        state,
        "community", "decouverte_communaute", "comportementale", "B", sigCommunity,
        "Échangez avec d'autres citoyens",
        `Vous utilisez régulièrement des établissements ${state.secteur_top.label} — Yelen Community peut vous y mettre en lien.`,
        `secteur_top=${state.secteur_top.secteur}, engagement.community=absent`,
        { label: FEATURE_CATALOGUE.community.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.community.destination },
        now, horizon("B"),
      ));
    }
  }
  const sigReward = `nb_rdv=${state.nb_rdv_total},nb_demarches=${state.nb_demarches_total}`;
  if ((state.nb_rdv_total > 0 || state.nb_demarches_total > 0) && !dejaUtilise(state, "reward") && eligible(state, "reward", "D", sigReward, now)) {
    candidats.push(construireCandidat(
      state,
      "reward", "decouverte_rewards", "decouverte", "D", sigReward,
      "Une valeur déjà accumulée vous attend",
      "Votre activité réelle sur Yelen alimente déjà Yelen Rewards.",
      `nb_rdv_total=${state.nb_rdv_total}, nb_demarches_total=${state.nb_demarches_total}, engagement.reward=absent`,
      { label: FEATURE_CATALOGUE.reward.cta_label, effort: "faible", destination: FEATURE_CATALOGUE.reward.destination },
      now, horizon("D"),
    ));
  }

  return classerEtLimiter(candidats, 2);
}

function comparerCandidats(a: RecommendationCandidate, b: RecommendationCandidate): number {
  return b.priorite - a.priorite;
}

// Jamais un catalogue : borne stricte du nombre de cartes affichées
// simultanément, ET jamais deux cartes de la même famille (source_type) —
// diversité obligatoire (brief §9). Le silence reste une sortie valide —
// un tableau vide est un résultat normal, pas une erreur (brief §11/§18).
function classerEtLimiter(candidats: RecommendationCandidate[], max: number): RecommendationCandidate[] {
  const tries = [...candidats].sort(comparerCandidats);
  const retenus: RecommendationCandidate[] = [];
  const famillesVues = new Set<DiscoverySourceType>();
  for (const c of tries) {
    if (retenus.length >= max) break;
    if (famillesVues.has(c.source_type)) continue;
    retenus.push(c);
    famillesVues.add(c.source_type);
  }
  return retenus;
}

// Enrichissement final (toujours pur — lit uniquement state.engagement déjà
// fourni par l'appelant, aucun accès DB) : reporte la confiance et
// l'historique d'exposition/interaction réels sur l'objet renvoyé, pour
// qu'il reste honnête plutôt qu'un champ mort (brief §13).
export function calculerDecouverte(state: DiscoveryState): RecommendationCandidate[] {
  const now = new Date().toISOString();
  return construireCandidats(state, now).map((c) => {
    const e = state.engagement[c.source_type];
    return { ...c, confiance: e?.confiance ?? null, shown_at: e?.derniere_vue_le ?? null, interaction_at: e?.derniere_interaction_le ?? null };
  });
}

export function etatDecouverteVide(citoyen_id: string): DiscoveryState {
  return {
    citoyen_id,
    stade_decouverte: "premiere_session",
    compte_cree_le: new Date().toISOString(),
    derniere_activite_le: null,
    nb_rdv_total: 0,
    nb_demarches_total: 0,
    nb_depenses_total: 0,
    a_favoris: false,
    centres_interet: [],
    secteur_top: null,
    offre_interet: null,
    engagement: {},
    familles_deja_couvertes: [],
  };
}
