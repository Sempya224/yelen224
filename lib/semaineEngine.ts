// Cette semaine — v1 (27/08/2026). Moteur pur, déterministe, zéro LLM,
// zéro accès DB à l'intérieur de ce fichier : le SemaineState est toujours
// injecté par l'appelant (même contrat que lib/attentionEngine.ts et
// lib/discoveryEngine.ts). Répond à "qu'est-ce qui caractérise ma semaine
// sur Yelen et qu'est-ce qui mérite mon attention ?" — distinct de :
// - "À faire" (lib/attentionEngine.ts) : ce qui bloque ou a une échéance à
//   conséquence réelle. Non modifié par ce fichier.
// - "Pour vous aujourd'hui" (lib/discoveryEngine.ts) : ce que le citoyen
//   pourrait vouloir essayer. "Cette semaine" ne propose PAS de
//   découverte de fonctionnalité — uniquement un résumé d'activité réelle
//   déjà posée (niveau 3 du brief volontairement non implémenté : aucun
//   signal distinct et réel qui ne soit pas déjà couvert par "Pour vous
//   aujourd'hui" n'a été identifié — l'ajouter sans preuve reviendrait à
//   la carte artificielle interdite par le brief §4).
//
// Réutilise telles quelles les primitives de fraîcheur/cooldown de
// lib/discoveryEngine.ts (joursEntre/dansNJours/cooldownEffectifJours/
// estEligible) et le même journal citoyen_recommendation_events via
// lib/discoveryMemory.ts — aucune nouvelle mémoire, aucune nouvelle table.
import type { Effort } from "./attentionEngine";
import type { Confiance, EngagementEntry } from "./discoveryEngine";
import { estEligible } from "./discoveryEngine";

export type SemaineSourceType = "depense" | "demarche" | "rdv" | "reward" | "avis";

// Niveau 1 = activité personnelle importante. Niveau 2 = activité utile.
// Niveau 3 = découverte (non implémenté, voir en-tête). Distinct des
// niveaux A-D de discoveryEngine.ts (sémantique différente : ceci décrit
// l'IMPORTANCE d'un fait déjà survenu, pas la nature d'une suggestion).
export type SemaineNiveau = 1 | 2 | 3;

export type SemaineCandidate = {
  suggestion_id: string;
  source_type: SemaineSourceType;
  source_id: string | null;
  categorie: string;
  niveau: SemaineNiveau;
  signature: string;
  titre: string;
  // Texte factuel — une carte d'observation n'a pas besoin d'un CTA
  // agressif (brief §8) : `action` reste optionnelle.
  observation: string;
  action: { label: string; effort: Effort; destination: string } | null;
  priorite: number;
  etat: "candidate";
  confiance: Confiance | null;
  shown_at: string | null;
  interaction_at: string | null;
  rule_version: string;
  created_at: string;
  // Toujours la fin réelle de la semaine calendaire en cours (dimanche
  // 23:59) — une carte de la semaine passée ne doit jamais continuer à
  // apparaître (brief §9).
  expires_at: string;
};

export type SemaineState = {
  citoyen_id: string;
  semaine_debut: string;
  semaine_fin: string;
  nb_depenses_semaine: number;
  montant_total_semaine: number;
  categorie_dominante: { categorie: string; label: string; montant: number; part_pct: number } | null;
  // Suppression de la carte "dépense dominante" si cette catégorie a déjà
  // un budget dépassé actif côté État d'attention — jamais la même
  // histoire racontée deux fois (brief §12).
  categorie_dominante_deja_signalee_attention: boolean;
  nouvelle_demarche: { id: string; titre: string } | null;
  demarche_avancee: { id: string; titre: string } | null;
  nb_rdv_effectues_semaine: number;
  rdv_a_venir_semaine: { id: string; institution: string; date: string } | null;
  points_gagnes_semaine: number;
  avis_en_attente: { id: string; institution: string }[];
  engagement: Partial<Record<SemaineSourceType, EngagementEntry>>;
};

const RULE_VERSION = "semaine_v1";
// Fenêtre de cooldown de base par niveau — plus courte qu'en découverte
// (une carte "cette semaine" doit naturellement se renouveler chaque
// semaine, pas s'incruster sur plusieurs cycles).
const COOLDOWN_JOURS: Record<SemaineNiveau, number> = { 1: 2, 2: 3, 3: 5 };
const NIVEAU_RANG: Record<SemaineNiveau, number> = { 1: 0, 2: 1, 3: 2 };
const EFFORT_RANG: Record<Effort, number> = { faible: 0, moyen: 1, eleve: 2 };

function eligible(state: SemaineState, source: SemaineSourceType, niveau: SemaineNiveau, signature: string, nowISO: string): boolean {
  return estEligible(state.engagement[source], COOLDOWN_JOURS[niveau], signature, nowISO);
}

function construireCandidat(
  source_type: SemaineSourceType, categorie: string, niveau: SemaineNiveau, signature: string,
  titre: string, observation: string, action: SemaineCandidate["action"],
  nowISO: string, expiresAtISO: string
): SemaineCandidate {
  return {
    suggestion_id: `semaine:${source_type}:${categorie}`, source_type, source_id: null, categorie, niveau, signature,
    titre, observation, action, priorite: 0, etat: "candidate",
    confiance: null, shown_at: null, interaction_at: null,
    rule_version: RULE_VERSION, created_at: nowISO, expires_at: expiresAtISO,
  };
}

function construireCandidats(state: SemaineState, now: string): SemaineCandidate[] {
  const candidats: SemaineCandidate[] = [];
  const finSemaine = state.semaine_fin;

  // --- Niveau 1 — activité personnelle importante ------------------------
  if (state.categorie_dominante && !state.categorie_dominante_deja_signalee_attention) {
    const d = state.categorie_dominante;
    const sig = `${d.categorie}:${d.montant}`;
    if (eligible(state, "depense", 1, sig, now)) {
      candidats.push(construireCandidat(
        "depense", d.categorie, 1, sig,
        `${d.label} est votre plus grosse dépense`,
        `${d.label} représente ${d.part_pct}% de vos dépenses cette semaine.`,
        { label: "Voir mes dépenses", effort: "faible", destination: "/menu/depenses" },
        now, finSemaine,
      ));
    }
  }
  if (state.nouvelle_demarche) {
    const sig = state.nouvelle_demarche.id;
    if (eligible(state, "demarche", 1, sig, now)) {
      candidats.push(construireCandidat(
        "demarche", "nouvelle", 1, sig,
        "Nouvelle démarche créée",
        `Vous avez créé « ${state.nouvelle_demarche.titre} » cette semaine.`,
        { label: "Voir la démarche", effort: "faible", destination: `/compte/mes-demarches?id=${state.nouvelle_demarche.id}` },
        now, finSemaine,
      ));
    }
  } else if (state.demarche_avancee) {
    const sig = state.demarche_avancee.id;
    if (eligible(state, "demarche", 1, sig, now)) {
      candidats.push(construireCandidat(
        "demarche", "avancee", 1, sig,
        "Votre démarche avance",
        `« ${state.demarche_avancee.titre} » est passée à l'étape suivante.`,
        { label: "Voir la démarche", effort: "faible", destination: `/compte/mes-demarches?id=${state.demarche_avancee.id}` },
        now, finSemaine,
      ));
    }
  }
  if (state.nb_rdv_effectues_semaine > 0) {
    const sig = `nb=${state.nb_rdv_effectues_semaine}`;
    if (eligible(state, "rdv", 1, sig, now)) {
      candidats.push(construireCandidat(
        "rdv", "effectues", 1, sig,
        state.nb_rdv_effectues_semaine > 1 ? `${state.nb_rdv_effectues_semaine} rendez-vous honorés` : "Rendez-vous honoré",
        "Vous avez terminé un rendez-vous cette semaine.",
        { label: "Voir mes rendez-vous", effort: "faible", destination: "/mes-rdv" },
        now, finSemaine,
      ));
    }
  }
  if (state.points_gagnes_semaine >= 50) {
    const sig = `points=${state.points_gagnes_semaine}`;
    if (eligible(state, "reward", 1, sig, now)) {
      candidats.push(construireCandidat(
        "reward", "gain", 1, sig,
        `${state.points_gagnes_semaine} points Yelen Reward gagnés`,
        "Votre activité réelle sur Yelen cette semaine a fait progresser votre solde.",
        { label: "Voir mes récompenses", effort: "faible", destination: "/menu/recompenses" },
        now, finSemaine,
      ));
    }
  }

  // --- Niveau 2 — activité utile ------------------------------------------
  if (state.avis_en_attente.length > 0) {
    const sig = state.avis_en_attente.map((a) => a.id).sort().join(",");
    if (eligible(state, "avis", 2, sig, now)) {
      candidats.push(construireCandidat(
        "avis", "attente", 2, sig,
        state.avis_en_attente.length > 1 ? `${state.avis_en_attente.length} avis à laisser` : "Un avis à laisser",
        `${state.avis_en_attente[0].institution}${state.avis_en_attente.length > 1 ? ` et ${state.avis_en_attente.length - 1} autre${state.avis_en_attente.length > 2 ? "s" : ""}` : ""}`,
        { label: "Laisser un avis", effort: "faible", destination: "/compte/mes-avis" },
        now, finSemaine,
      ));
    }
  }
  if (state.rdv_a_venir_semaine) {
    const r = state.rdv_a_venir_semaine;
    const sig = r.id;
    if (eligible(state, "rdv", 2, sig, now)) {
      candidats.push(construireCandidat(
        "rdv", "a_venir", 2, sig,
        "Rendez-vous cette semaine",
        `Vous avez un rendez-vous le ${r.date} chez ${r.institution}.`,
        { label: "Voir le rendez-vous", effort: "faible", destination: `/mes-rdv?rdv_id=${r.id}` },
        now, finSemaine,
      ));
    }
  }
  if ((!state.categorie_dominante || state.categorie_dominante_deja_signalee_attention) && state.nb_depenses_semaine > 0) {
    const sig = `nb=${state.nb_depenses_semaine},total=${state.montant_total_semaine}`;
    if (eligible(state, "depense", 2, sig, now)) {
      candidats.push(construireCandidat(
        "depense", "resume", 2, sig,
        state.nb_depenses_semaine > 1 ? `${state.nb_depenses_semaine} dépenses cette semaine` : "Une dépense cette semaine",
        `${state.montant_total_semaine.toLocaleString("fr-FR")} GNF enregistrés cette semaine.`,
        { label: "Voir mes dépenses", effort: "faible", destination: "/menu/depenses" },
        now, finSemaine,
      ));
    }
  }

  return classerEtLimiter(candidats, 2);
}

function comparerCandidats(a: SemaineCandidate, b: SemaineCandidate): number {
  if (a.niveau !== b.niveau) return NIVEAU_RANG[a.niveau] - NIVEAU_RANG[b.niveau];
  const ea = a.action ? EFFORT_RANG[a.action.effort] : 3;
  const eb = b.action ? EFFORT_RANG[b.action.effort] : 3;
  return ea - eb;
}

// Jamais un mur de cartes : borne stricte à 2, ET jamais deux cartes de la
// même famille (source_type) — diversité obligatoire, même logique que
// discoveryEngine.ts::classerEtLimiter. Le silence reste une sortie
// valide (brief §4/§18 : "Rien à afficher" est un résultat correct).
function classerEtLimiter(candidats: SemaineCandidate[], max: number): SemaineCandidate[] {
  const tries = [...candidats].sort(comparerCandidats);
  const retenus: SemaineCandidate[] = [];
  const famillesVues = new Set<SemaineSourceType>();
  for (const c of tries) {
    if (retenus.length >= max) break;
    if (famillesVues.has(c.source_type)) continue;
    retenus.push(c);
    famillesVues.add(c.source_type);
  }
  return retenus;
}

// Enrichissement final (toujours pur — lit uniquement state.engagement
// déjà fourni par l'appelant, aucun accès DB).
export function calculerSemaine(state: SemaineState): SemaineCandidate[] {
  const now = new Date().toISOString();
  return construireCandidats(state, now).map((c) => {
    const e = state.engagement[c.source_type];
    return { ...c, confiance: e?.confiance ?? null, shown_at: e?.derniere_vue_le ?? null, interaction_at: e?.derniere_interaction_le ?? null };
  });
}

const MOIS_COURT = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Bornes réelles (lundi 00:00 → dimanche 23:59) de la semaine calendaire
// contenant la date du jour — source unique, réutilisée à la fois par le
// state builder (filtrage réel des requêtes) et par l'affichage (libellé),
// jamais une seconde implémentation du calcul de lundi/dimanche.
export function limitesSemaineCourante(): { debutISO: string; finISO: string; label: string } {
  const aujourdHui = new Date();
  const jour = aujourdHui.getDay(); // 0 = dimanche … 6 = samedi
  const decalageLundi = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(aujourdHui); lundi.setHours(0, 0, 0, 0); lundi.setDate(aujourdHui.getDate() + decalageLundi);
  const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6); dimanche.setHours(23, 59, 59, 999);
  const label = lundi.getMonth() === dimanche.getMonth()
    ? `du ${lundi.getDate()} au ${dimanche.getDate()} ${MOIS_COURT[lundi.getMonth()]}`
    : `du ${lundi.getDate()} ${MOIS_COURT[lundi.getMonth()]} au ${dimanche.getDate()} ${MOIS_COURT[dimanche.getMonth()]}`;
  return { debutISO: lundi.toISOString(), finISO: dimanche.toISOString(), label };
}

export function etatSemaineVide(citoyen_id: string, semaine_debut: string, semaine_fin: string): SemaineState {
  return {
    citoyen_id, semaine_debut, semaine_fin,
    nb_depenses_semaine: 0, montant_total_semaine: 0,
    categorie_dominante: null, categorie_dominante_deja_signalee_attention: false,
    nouvelle_demarche: null, demarche_avancee: null,
    nb_rdv_effectues_semaine: 0, rdv_a_venir_semaine: null,
    points_gagnes_semaine: 0, avis_en_attente: [],
    engagement: {},
  };
}
