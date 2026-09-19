// Guidance / Découverte — Lot 3 (26/08/2026). Palier de découverte
// progressive, piloté par des événements réels (nombre d'actions réelles
// posées), jamais par un délai arbitraire (brief §8). Le palier ne
// régresse jamais automatiquement — voir supabase/migrations/
// 20260826000002_citoyen_progression_decouverte.sql.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StadeDecouverte } from "./discoveryEngine";

const STADE_RANG: Record<StadeDecouverte, number> = {
  premiere_session: 0, decouverte: 1, personnalisation: 2, historique_riche: 3,
};

// Une "action réelle" = un rdv, une démarche ou une dépense créée par le
// citoyen — le total (pas la diversité) suffit à situer la maturité
// d'usage, aligné sur la progression décrite au brief §8/§9.
export function calculerStadeCible(totalActionsReelles: number): StadeDecouverte {
  if (totalActionsReelles >= 3) return "historique_riche";
  if (totalActionsReelles === 2) return "personnalisation";
  if (totalActionsReelles === 1) return "decouverte";
  return "premiere_session";
}

export async function lireStade(supabase: SupabaseClient, citoyenId: string): Promise<StadeDecouverte> {
  const { data } = await supabase
    .from("citoyen_progression_decouverte")
    .select("stade")
    .eq("citoyen_id", citoyenId)
    .maybeSingle();
  return (data?.stade as StadeDecouverte | undefined) ?? "premiere_session";
}

// Fait avancer le palier persisté si le palier cible (calculé depuis des
// faits réels) dépasse le palier actuellement stocké — jamais l'inverse.
// Retourne le palier final (inchangé si aucune progression n'a eu lieu).
export async function synchroniserStade(
  supabase: SupabaseClient,
  citoyenId: string,
  totalActionsReelles: number
): Promise<StadeDecouverte> {
  const cible = calculerStadeCible(totalActionsReelles);
  const { data: existant } = await supabase
    .from("citoyen_progression_decouverte")
    .select("stade")
    .eq("citoyen_id", citoyenId)
    .maybeSingle();

  const actuel = (existant?.stade as StadeDecouverte | undefined) ?? null;
  if (actuel !== null && STADE_RANG[cible] <= STADE_RANG[actuel]) return actuel;

  const raison = `total_actions_reelles=${totalActionsReelles}`;
  if (actuel === null) {
    await supabase.from("citoyen_progression_decouverte").insert({
      citoyen_id: citoyenId, stade: cible, stade_atteint_le: new Date().toISOString(),
    });
  } else {
    await supabase.from("citoyen_progression_decouverte").update({
      stade: cible, stade_atteint_le: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("citoyen_id", citoyenId);
  }
  await supabase.from("citoyen_progression_decouverte_historique").insert({
    citoyen_id: citoyenId, ancien_stade: actuel, nouveau_stade: cible, raison,
  });
  return cible;
}
