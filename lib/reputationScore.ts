// Calcul du score "Santé du compte" (onglet Avis & Réputation, dashboard
// institution) — même esprit que lib/citoyenSecurite.ts et scoreRisque()
// dans lib/journalTaxonomie.ts : règles déterministes, zéro appel LLM, zéro
// pondération inventée sur un signal qu'on n'a pas. Isomorphe client/serveur
// (aucun import next/server ni supabase-js).
//
// Signaux volontairement exclus (données absentes, vérifié sur le code
// réel) : ponctualité/respect des horaires (aucune donnée), taux de réponse
// aux messages citoyens (messages n'a ni rdv_id ni horodatage de réponse).

export type NiveauReputation = "platinum" | "gold" | "silver" | "danger";

// "30 derniers rendez-vous évaluables" — fenêtre glissante, remplace
// naturellement le plus ancien avis dès qu'un nouveau arrive (LIMIT sur une
// requête ORDER BY created_at desc), aucune table de compteur à maintenir.
export const TAILLE_FENETRE = 30;

// En dessous, le score n'est pas affiché (évite un score à 0 trompeur pour
// une institution qui débute).
export const MIN_AVIS_POUR_SCORE = 3;

// Convention positif/négatif/neutre — hypothèse produit ajustable, pas une
// vérité absolue.
export const NOTE_POSITIVE_MIN = 4;
export const NOTE_NEGATIVE_MAX = 2;

// 4 signaux seulement — les seuls mesurables avec les données réelles
// existantes aujourd'hui. Poids ajustables, à valider avec Bryan.
export const POIDS = {
  note: 0.60,
  reponseNegatifs: 0.15,
  annulationInstitution: 0.15,
  reclamations: 0.10,
} as const;

export const SEUILS = { platinum: 90, gold: 75, silver: 55, surveillance: 35 } as const;
// >=90 platinum | >=75 gold | >=55 silver | >=35 danger(surveillance) | <35 danger(critique, alerteAdmin)

export function classifierAvis(note: number): "positif" | "neutre" | "negatif" {
  if (note >= NOTE_POSITIVE_MIN) return "positif";
  if (note <= NOTE_NEGATIVE_MAX) return "negatif";
  return "neutre";
}

/**
 * rdv.objet est toujours préfixé `[Nom du service]` au moment de la
 * création du RDV (app/rdv/[id]/page.tsx : `` `[${selectedService.nom}]...` ``),
 * que le RDV soit gratuit (nom venant de institutions.services) ou payant
 * (nom venant de paid_services) — jamais du texte libre saisi par le
 * citoyen. On peut donc en extraire le service de façon fiable sans colonne
 * dédiée sur avis.
 */
export function extraireServiceDepuisObjet(objet: string | null): string | null {
  if (!objet) return null;
  const m = objet.match(/^\[([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

/**
 * rdv.statut n'a pas de colonne "annulé par qui" — mais rdv_events ne trace
 * une annulation (action="annulation") que côté citoyen (le seul appelant
 * est app/mes-rdv/actions.ts::annulerRdv, toujours avec
 * auteur_type="citoyen" ; la route institution d'annulation n'écrit jamais
 * dans rdv_events). Donc un RDV annulé sans entrée rdv_events "citoyen"
 * associée est, par élimination, annulé par l'institution.
 * ⚠️ Avant le 20/07/2026, cette table n'avait aucune policy RLS et l'ancien
 * code écrivait via le client anonyme du navigateur — l'insert échouait
 * donc toujours silencieusement, ce signal était systématiquement faux
 * (toute annulation comptait par défaut comme "institution"). Corrigé en
 * déplaçant l'écriture vers un service_role côté serveur (chantier
 * notifications "Yelen Assistant", voir CLAUDE.md).
 */
export function estAnnuleParInstitution(rdvId: string, rdvIdsAnnulesParCitoyen: Set<string>): boolean {
  return !rdvIdsAnnulesParCitoyen.has(rdvId);
}

export type AvisPourSignal = { note: number; reponse_institution: string | null };

export type Signaux = { tNote: number; tReponseNegatifs: number; tAnnulation: number; tReclamations: number };

export function calculerSignaux(params: {
  avisFenetre: AvisPourSignal[];
  nbRdvAnnulesInstitutionPeriode: number;
  nbRdvTotalPeriode: number;
  nbReclamationsResoluesPeriode: number;
}): Signaux {
  const { avisFenetre, nbRdvAnnulesInstitutionPeriode, nbRdvTotalPeriode, nbReclamationsResoluesPeriode } = params;

  const moyenne = avisFenetre.length ? avisFenetre.reduce((s, a) => s + a.note, 0) / avisFenetre.length : 0;
  const tNote = (moyenne / 5) * 100;

  const negatifs = avisFenetre.filter(a => classifierAvis(a.note) === "negatif");
  const tReponseNegatifs = negatifs.length === 0
    ? 100
    : (negatifs.filter(a => !!a.reponse_institution).length / negatifs.length) * 100;

  const tauxAnnulationPct = nbRdvTotalPeriode > 0 ? (nbRdvAnnulesInstitutionPeriode / nbRdvTotalPeriode) * 100 : 0;
  const tAnnulation = Math.max(0, 100 - tauxAnnulationPct * 4); // -4 pts par point de % d'annulation institution

  const tReclamations = Math.max(0, 100 - nbReclamationsResoluesPeriode * 20); // -20 pts par réclamation validée

  return { tNote, tReponseNegatifs, tAnnulation, tReclamations };
}

export type ScoreReputation = {
  score: number;
  niveau: NiveauReputation;
  phrase: string;
  alerteAdmin: boolean;
};

/**
 * Aucune fermeture automatique dans aucun cas : en dessous du seuil de
 * surveillance, le système ne fait que signaler ("alerteAdmin"), la
 * décision reste toujours humaine (admin Yelen).
 */
export function calculerScoreReputation(s: Signaux): ScoreReputation {
  const score = Math.round(
    s.tNote * POIDS.note +
    s.tReponseNegatifs * POIDS.reponseNegatifs +
    s.tAnnulation * POIDS.annulationInstitution +
    s.tReclamations * POIDS.reclamations
  );

  if (score >= SEUILS.platinum) return { score, niveau: "platinum", phrase: "Compte exemplaire.", alerteAdmin: false };
  if (score >= SEUILS.gold) return { score, niveau: "gold", phrase: "Bon niveau de qualité.", alerteAdmin: false };
  if (score >= SEUILS.silver) return { score, niveau: "silver", phrase: "À améliorer — surveillance renforcée.", alerteAdmin: false };
  if (score >= SEUILS.surveillance) return { score, niveau: "danger", phrase: "Compte sous surveillance.", alerteAdmin: false };
  return { score, niveau: "danger", phrase: "Zone critique — recommandation de révision administrative transmise à Yelen.", alerteAdmin: true };
}

export type StatService = { service: string; nbAvis: number; nbNegatifs: number; noteMoyenne: number };

type AvisPourRecommandation = { note: number; commentaire: string | null };

const MOTS_CLES_THEME: Record<string, string[]> = {
  "le temps d'attente": ["attente", "attendu", "retard", "lent", "lenteur"],
  "l'accueil": ["accueil", "impoli", "désagréable", "froid"],
  "la propreté des locaux": ["sale", "propre", "propreté", "hygiène"],
};
const SEUIL_THEME_PCT = 0.4; // 40% des commentaires négatifs mentionnent le thème
const SEUIL_TAUX_ANNULATION_ALERTE_PCT = 15;

/**
 * Recommandations "IA Yelen" — règles déterministes sur des comptages
 * réels (mirroring app/api/institution/journal/resume/route.ts), ZÉRO appel
 * LLM. N'affirme jamais rien qui ne soit pas directement dérivé des
 * données passées en paramètre.
 */
export function genererRecommandationsIA(params: {
  avisNegatifsMois: AvisPourRecommandation[];
  servicesMois: StatService[];
  tauxAnnulationInstitutionMoisPct: number;
  nbReclamationsResoluesMois: number;
}): string[] {
  const { avisNegatifsMois, servicesMois, tauxAnnulationInstitutionMoisPct, nbReclamationsResoluesMois } = params;
  const phrases: string[] = [];

  const avecCommentaire = avisNegatifsMois.filter(a => !!a.commentaire);
  for (const [theme, mots] of Object.entries(MOTS_CLES_THEME)) {
    if (avecCommentaire.length === 0) continue;
    const match = avecCommentaire.filter(a => mots.some(m => a.commentaire!.toLowerCase().includes(m)));
    if (match.length / avecCommentaire.length >= SEUIL_THEME_PCT) {
      phrases.push(`Les avis négatifs concernent principalement ${theme}.`);
    }
  }

  const totalNeg = avisNegatifsMois.length;
  if (totalNeg > 0) {
    const pire = [...servicesMois].sort((a, b) => b.nbNegatifs - a.nbNegatifs)[0];
    if (pire && pire.nbNegatifs / totalNeg >= 0.5) {
      phrases.push(`${pire.service} reçoit ${Math.round((pire.nbNegatifs / totalNeg) * 100)}% des avis négatifs ce mois.`);
    }
  }

  if (tauxAnnulationInstitutionMoisPct > SEUIL_TAUX_ANNULATION_ALERTE_PCT) {
    phrases.push(`Le taux d'annulation à l'initiative de l'établissement est élevé ce mois (${Math.round(tauxAnnulationInstitutionMoisPct)}%).`);
  }

  if (nbReclamationsResoluesMois > 0) {
    phrases.push(`${nbReclamationsResoluesMois} réclamation${nbReclamationsResoluesMois > 1 ? "s" : ""} validée${nbReclamationsResoluesMois > 1 ? "s" : ""} par l'administration Yelen ce mois.`);
  }

  if (phrases.length === 0) phrases.push("Aucune anomalie détectée sur la période.");
  return phrases;
}
