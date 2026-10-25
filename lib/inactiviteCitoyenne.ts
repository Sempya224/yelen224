import type { SupabaseClient } from "@supabase/supabase-js";

// Lecture de l'état déjà calculé (citoyen_inactivite_suspensions) — jamais
// recalculé ici, même discipline que lib/rdvRestrictions.ts::chargerRestrictionActive.
// Seuils/escalade vivent exclusivement dans les fonctions SQL
// citoyen_inactivite_evaluer()/citoyen_inactivite_suspendre() (migration
// 20261015000002).
export type SuspensionInactiviteActive = {
  id: string;
  reference: string;
  motif: string;
  createdAt: string;
};

export async function chargerSuspensionInactiviteActive(
  sb: SupabaseClient,
  citoyenId: string
): Promise<SuspensionInactiviteActive | null> {
  const { data } = await sb
    .from("citoyen_inactivite_suspensions")
    .select("id, reference, motif, created_at")
    .eq("citoyen_id", citoyenId)
    .eq("statut", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, reference: data.reference, motif: data.motif, createdAt: data.created_at };
}
