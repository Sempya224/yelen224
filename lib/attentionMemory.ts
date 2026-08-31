// État d'attention Yelen — Lot 3 (25/08/2026). Lecture/écriture de
// citoyen_attention_memoire — jamais lue ni écrite par le moteur pur
// (lib/attentionEngine.ts) lui-même, qui reste une fonction sans accès
// DB. Seule la règle Tier 3 ("silence après 2 ignorances") consulte cette
// mémoire ; Tier 1-2 ne sont jamais concernés, verrouillé dans
// l'architecture.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BehaviorMemoryEntry, CitizenState, SourceType } from "./attentionEngine";

type MemoireRow = { source_type: SourceType; categorie: string; compteur_ignorance: number };

export async function lireMemoire(supabase: SupabaseClient, citoyenId: string): Promise<BehaviorMemoryEntry[]> {
  const { data } = await supabase
    .from("citoyen_attention_memoire")
    .select("source_type,categorie,compteur_ignorance")
    .eq("citoyen_id", citoyenId);
  return (data ?? []) as MemoireRow[];
}

// Opère sur le CitizenState brut, jamais sur la sortie filtrée du moteur —
// c'est délibéré : une anomalie rétrogradée en Tier 4 par la mémoire (déjà
// ignorée une fois) disparaît de `priorites` (qui ne garde que Tier 1-3),
// mais reste bien présente dans l'état brut tant que le fait est vrai. Si
// on suivait `priorites` au lieu de l'état brut, le compteur se figerait
// à 1 pour toujours dès la première rétrogradation — jamais atteindre le
// seuil de silence complet (>=2). Ne concerne aujourd'hui que les
// anomalies de dépenses, seule famille du moteur qui consulte la mémoire.
export async function mettreAJourMemoire(supabase: SupabaseClient, citoyenId: string, state: CitizenState): Promise<void> {
  if (state.depenses_anomalies.length === 0) return;
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const categoriesVues = new Set(state.depenses_anomalies.map((a) => a.categorie));

  for (const categorie of categoriesVues) {
    const { data: existant } = await supabase
      .from("citoyen_attention_memoire")
      .select("id,derniere_proposition_le,compteur_ignorance")
      .eq("citoyen_id", citoyenId).eq("source_type", "depense").eq("categorie", categorie)
      .maybeSingle();

    if (!existant) {
      await supabase.from("citoyen_attention_memoire").insert({
        citoyen_id: citoyenId, source_type: "depense", categorie,
        compteur_ignorance: 0, derniere_proposition_le: aujourdHui,
      });
    } else if (existant.derniere_proposition_le !== aujourdHui) {
      await supabase.from("citoyen_attention_memoire").update({
        compteur_ignorance: existant.compteur_ignorance + 1,
        derniere_proposition_le: aujourdHui,
        updated_at: new Date().toISOString(),
      }).eq("id", existant.id);
    }
  }
}
