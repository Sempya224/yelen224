import type { VueEnsemble, PeriodeJours } from "./analyseAggregation";
import type { AnalyseTunnel } from "./analyseTunnel";
import { rdvNonTraite } from "./rdvGating";
import type { TabKey } from "./institutionPermissions";

// Moteur de règles du système de recommandation institutionnel — Phase 2
// (architecture validée CEO le 13/10/2026). Même discipline que
// lib/analyseInsight.ts/lib/reputationScore.ts::genererRecommandationsIA :
// ZÉRO appel LLM, règles déterministes sur des agrégations déjà calculées
// ailleurs (jamais de requête Supabase ici, jamais une 3e définition de
// STATUTS_CONFIRMES/STATUTS_TERMINES). Isomorphe client/serveur.
//
// Périmètre lot 1 (décision CEO) : 3 recommandations seulement —
// RDV non traités, baisse du taux de conversion, pertes du tunnel de
// réservation. Chaque règle produit soit une recommandation justifiée,
// soit aucune recommandation (jamais un constat sur un signal insuffisant).

export type NiveauPriorite = "critique" | "attention";

export type RecommandationType = "rdv_non_traites" | "baisse_conversion" | "perte_tunnel";

export type RecommandationAction = { label: string; cible: TabKey };

export type RecommandationCandidate = {
  type: RecommandationType;
  cleDeduplication: string;
  priorite: NiveauPriorite;
  constat: string;
  donnees: Record<string, number | string | null>;
  periode: { jours: number; label: string };
  action: RecommandationAction | null;
  // Conditions vérifiées pour que ce candidat soit émis — sert de trace
  // d'audit (pourquoi ce signal s'est déclenché) et de base à la logique
  // d'expiration de la Phase 3 (si une condition ne tient plus, le signal
  // n'est plus valide).
  conditionsValidite: string[];
};

function libellePeriode(jours: PeriodeJours): string {
  if (jours === 7) return "les 7 derniers jours";
  if (jours === 30) return "les 30 derniers jours";
  if (jours === 90) return "les 90 derniers jours";
  return "l'année en cours";
}

// ───────────────────────────────────────────────────────────────────────
// A — RDV non traités (accumulation)
// ───────────────────────────────────────────────────────────────────────
// Règle purement temporelle/canonique (rdvNonTraite, lib/rdvGating.ts) —
// aucun garde-fou de volume minimum ici : contrairement aux règles B/C
// basées sur un pourcentage, un seul RDV non traité est déjà un fait
// vérifiable, pas une statistique fragile sur petit échantillon.
export const SEUIL_RDV_NON_TRAITES_ATTENTION = 3;
export const SEUIL_RDV_NON_TRAITES_CRITIQUE = 8;

export type RdvOuvert = {
  id: string;
  statut: string;
  presence_status: string | null;
  date_rdv: string;
  heure_rdv: string;
};

// L'appelant (Phase 3) devrait pré-filtrer sur statut IN ('nouveau',
// 'en_attente') pour l'efficacité de la requête — pas une obligation
// fonctionnelle : rdvNonTraite() ignore de toute façon tout autre statut.
export function evaluerRdvNonTraites(rdvOuverts: RdvOuvert[], maintenant: Date = new Date()): RecommandationCandidate | null {
  const nonTraites = rdvOuverts.filter(r => rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv, maintenant));
  if (nonTraites.length < SEUIL_RDV_NON_TRAITES_ATTENTION) return null;

  const priorite: NiveauPriorite = nonTraites.length >= SEUIL_RDV_NON_TRAITES_CRITIQUE ? "critique" : "attention";

  return {
    type: "rdv_non_traites",
    cleDeduplication: "rdv_non_traites",
    priorite,
    constat: `${nonTraites.length} rendez-vous n'ont reçu aucune décision alors que la fenêtre de grâce de 30 minutes après l'heure prévue est dépassée.`,
    donnees: { nbRdvNonTraites: nonTraites.length },
    periode: { jours: 0, label: "Situation actuelle" },
    action: { label: "Voir les rendez-vous concernés", cible: "rdv" },
    conditionsValidite: [`nbRdvNonTraites(${nonTraites.length}) >= ${SEUIL_RDV_NON_TRAITES_ATTENTION}`],
  };
}

// ───────────────────────────────────────────────────────────────────────
// B — Baisse du taux de conversion
// ───────────────────────────────────────────────────────────────────────
// Seuil de volume : point de départ CEO (10 RDV), à tester et ajuster.
// calculerVueEnsemble() n'expose pas le volume brut de la période
// précédente (seul le delta déjà calculé est retourné) — le garde-fou de
// volume porte donc sur rdvGeneres.valeur de la période COURANTE, celle où
// la recommandation s'applique réellement.
export const SEUIL_VOLUME_MINIMUM_POURCENTAGE = 10;
// Même seuil que lib/analyseInsight.ts::genererInsightAnalyse — cohérence
// du produit sur ce qui compte comme une "baisse significative".
export const SEUIL_BAISSE_CONVERSION_POINTS = -10;
export const SEUIL_BAISSE_CONVERSION_CRITIQUE_POINTS = -20;

export function evaluerBaisseConversion(v: VueEnsemble, periodeJours: PeriodeJours): RecommandationCandidate | null {
  if (v.rdvGeneres.valeur === null || v.rdvGeneres.valeur < SEUIL_VOLUME_MINIMUM_POURCENTAGE) return null;
  if (v.tauxConversion.valeur === null || v.tauxConversion.delta === null) return null;
  if (v.tauxConversion.delta > SEUIL_BAISSE_CONVERSION_POINTS) return null;

  const priorite: NiveauPriorite = v.tauxConversion.delta <= SEUIL_BAISSE_CONVERSION_CRITIQUE_POINTS ? "critique" : "attention";

  return {
    type: "baisse_conversion",
    cleDeduplication: `baisse_conversion:${periodeJours}j`,
    priorite,
    constat: `Votre taux de conversion a reculé de ${Math.abs(v.tauxConversion.delta)} points sur ${libellePeriode(periodeJours)}, à ${v.tauxConversion.valeur}% (${v.rdvGeneres.valeur} RDV sur la période).`,
    donnees: { tauxConversionActuel: v.tauxConversion.valeur, deltaPoints: v.tauxConversion.delta, rdvGeneres: v.rdvGeneres.valeur },
    periode: { jours: periodeJours, label: libellePeriode(periodeJours) },
    action: { label: "Vérifier vos disponibilités", cible: "disponibilites" },
    conditionsValidite: [
      `rdvGeneres(${v.rdvGeneres.valeur}) >= ${SEUIL_VOLUME_MINIMUM_POURCENTAGE}`,
      `deltaConversion(${v.tauxConversion.delta}) <= ${SEUIL_BAISSE_CONVERSION_POINTS}`,
    ],
  };
}

// ───────────────────────────────────────────────────────────────────────
// C — Pertes dans le tunnel de réservation
// ───────────────────────────────────────────────────────────────────────
// Même seuil de cause dominante que lib/reputationScore.ts::SEUIL_THEME_PCT
// (0.4 exprimé en fraction là-bas, 40 ici car AnalyseTunnel.causesAbandon
// exprime déjà pct en pourcentage 0-100).
export const SEUIL_CAUSE_DOMINANTE_PCT = 40;

export function evaluerPerteTunnel(t: AnalyseTunnel, periodeJours: PeriodeJours): RecommandationCandidate | null {
  if (t.demandes.valeur === null || t.demandes.valeur < SEUIL_VOLUME_MINIMUM_POURCENTAGE) return null;

  // t.pertes est déjà trié décroissant par deltaPct (analyseTunnel.ts) —
  // pertes[0] est donc l'étape la plus pénalisante du tunnel.
  const pireEtape = t.pertes[0];
  if (!pireEtape || pireEtape.niveau !== "critique") return null;

  // Motif réel (texte libre saisi par l'institution), jamais reclassé —
  // seulement cité s'il domine clairement et n'est pas une valeur fourre-tout.
  const causeDominante = t.causesAbandon.find(
    c => c.pct >= SEUIL_CAUSE_DOMINANTE_PCT && c.motif !== "Non précisé" && c.motif !== "Autres"
  );

  const constatBase = `${pireEtape.deltaPct}% des rendez-vous sont perdus à l'étape "${pireEtape.label}" sur ${libellePeriode(periodeJours)} (${t.demandes.valeur} demandes).`;
  const constat = causeDominante
    ? `${constatBase} Cause principale rapportée par votre établissement : "${causeDominante.motif}" (${causeDominante.pct}% des abandons).`
    : constatBase;

  const priorite: NiveauPriorite = pireEtape.deltaPct >= 40 ? "critique" : "attention";

  return {
    type: "perte_tunnel",
    cleDeduplication: `perte_tunnel:${pireEtape.etape}:${periodeJours}j`,
    priorite,
    constat,
    donnees: {
      etape: pireEtape.etape,
      perteCount: pireEtape.perteCount,
      deltaPct: pireEtape.deltaPct,
      demandes: t.demandes.valeur,
      causeDominanteMotif: causeDominante?.motif ?? null,
      causeDominantePct: causeDominante?.pct ?? null,
    },
    periode: { jours: periodeJours, label: libellePeriode(periodeJours) },
    // Jamais d'action fabriquée sur un motif en texte libre (décision CEO
    // §5.C) : aucun écran du produit ne permet aujourd'hui d'agir sur un
    // motif précis d'abandon — afficher le constat seul plutôt qu'inventer
    // une action qui n'existe pas.
    action: null,
    conditionsValidite: [
      `demandes(${t.demandes.valeur}) >= ${SEUIL_VOLUME_MINIMUM_POURCENTAGE}`,
      `pireEtape.niveau === "critique" (${pireEtape.deltaPct}%)`,
    ],
  };
}

// ───────────────────────────────────────────────────────────────────────
// Point d'entrée — agrège les 3 règles, trie par priorité (critique avant
// attention). Aucune dépendance Supabase/Next/React : toutes les données
// sont déjà calculées par l'appelant (Phase 3, routes API).
// ───────────────────────────────────────────────────────────────────────
export type DonneesRecommandations = {
  vueEnsemble: VueEnsemble;
  analyseTunnel: AnalyseTunnel;
  rdvOuverts: RdvOuvert[];
  periodeJours: PeriodeJours;
  maintenant?: Date;
};

export function genererRecommandations(donnees: DonneesRecommandations): RecommandationCandidate[] {
  const maintenant = donnees.maintenant ?? new Date();

  const candidats = [
    evaluerRdvNonTraites(donnees.rdvOuverts, maintenant),
    evaluerBaisseConversion(donnees.vueEnsemble, donnees.periodeJours),
    evaluerPerteTunnel(donnees.analyseTunnel, donnees.periodeJours),
  ].filter((c): c is RecommandationCandidate => c !== null);

  const ordrePriorite: Record<NiveauPriorite, number> = { critique: 0, attention: 1 };
  return candidats.sort((a, b) => ordrePriorite[a.priorite] - ordrePriorite[b.priorite]);
}
