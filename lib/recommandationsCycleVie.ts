// Décisions de cycle de vie du système de recommandation institutionnel —
// fonctions PURES uniquement (zéro Supabase/Next/React), isomorphe comme
// lib/recommandationsInstitution.ts. Séparé de lib/recommandationsLifecycle.ts
// (qui porte les accès Supabase) pour rester testable sans variables
// d'environnement, même convention que lib/semaineEngine.ts/lib/discoveryEngine.ts.

export const STATUTS_RECOMMANDATION = ["nouvelle", "consultee", "traitee", "expiree"] as const;
export type StatutRecommandation = (typeof STATUTS_RECOMMANDATION)[number];

export function isStatutRecommandation(value: unknown): value is StatutRecommandation {
  return typeof value === "string" && (STATUTS_RECOMMANDATION as readonly string[]).includes(value);
}

// Répond explicitement à la consigne CEO section 6 : "Le comportement lors
// de la disparition puis du retour d'un signal devra être spécifié... afin
// d'éviter aussi bien les doublons que la réapparition intempestive d'une
// recommandation déjà traitée."
export type ActionCycleVie = "creer" | "reactiver" | "rafraichir" | "laisser_traitee" | "expirer" | "ignorer";

export function decisionCycleVie(statutExistant: StatutRecommandation | null, signalActif: boolean): ActionCycleVie {
  if (statutExistant === null) return signalActif ? "creer" : "ignorer";

  if (signalActif) {
    // Le signal était complètement retombé puis est réapparu : nouvelle
    // occurrence à part entière, redevient "nouvelle".
    if (statutExistant === "expiree") return "reactiver";
    // Marquée traitée par un membre, mais le signal sous-jacent persiste :
    // ne JAMAIS la rouvrir automatiquement (sinon un traitement réel se
    // ferait écraser à la prochaine actualisation) — seule une nouvelle
    // disparition/réapparition peut la faire revenir.
    if (statutExistant === "traitee") return "laisser_traitee";
    // nouvelle/consultee : toujours actif, on rafraîchit juste les données
    // (constat/priorité), le statut de workflow ne bouge pas.
    return "rafraichir";
  }

  // Signal retombé : seules nouvelle/consultee expirent (une recommandation
  // déjà traitee ou déjà expiree n'a rien à faire ici).
  if (statutExistant === "nouvelle" || statutExistant === "consultee") return "expirer";
  return "ignorer";
}

// Transitions déclenchables manuellement par un membre autorisé (PATCH) —
// "nouvelle"/"expiree" ne sont jamais des cibles manuelles : seul
// decisionCycleVie() ci-dessus les produit.
export function transitionManuelleAutorisee(statutActuel: StatutRecommandation, statutCible: StatutRecommandation): boolean {
  if (statutCible === "consultee") return statutActuel === "nouvelle";
  if (statutCible === "traitee") return statutActuel === "nouvelle" || statutActuel === "consultee";
  return false;
}
