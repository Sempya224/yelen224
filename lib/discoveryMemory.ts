// Mémoire d'exposition partagée — v2 (27/08/2026). Lecture/écriture de
// citoyen_recommendation_events — jamais lue ni écrite par un moteur pur
// (lib/discoveryEngine.ts, lib/semaineEngine.ts), qui restent des
// fonctions sans accès DB. Même séparation que attentionMemory.ts vis-à-
// vis de attentionEngine.ts.
//
// Généralisé à `string` plutôt que DiscoverySourceType (27/08/2026) : ce
// journal sert désormais à la fois aux recommandations de découverte et
// aux cartes "Cette semaine" — même table, même mécanisme, pas de
// duplication (chaque appelant caste le résultat vers son propre union de
// source_type, qu'il contrôle entièrement à l'écriture).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Confiance, EngagementEntry } from "./discoveryEngine";

type EventRow = { source_type: string; action: "vue" | "ouverte" | "utilisee"; created_at: string; signature: string | null };

// Forme structurelle minimale requise pour journaliser une exposition —
// RecommendationCandidate et SemaineCandidate la satisfont toutes les deux
// sans import croisé entre les deux moteurs.
export type ExpositionCandidate = {
  source_type: string;
  categorie: string;
  source_id: string | null;
  signature: string;
  shown_at: string | null;
};

const SEUIL_UTILISE_REGULIEREMENT = 3;

export async function lireEngagement(
  supabase: SupabaseClient,
  citoyenId: string
): Promise<Partial<Record<string, EngagementEntry>>> {
  const { data } = await supabase
    .from("citoyen_recommendation_events")
    .select("source_type,action,created_at,signature")
    .eq("citoyen_id", citoyenId)
    .order("created_at", { ascending: false });

  const parType = new Map<string, EventRow[]>();
  for (const r of (data ?? []) as EventRow[]) {
    parType.set(r.source_type, [...(parType.get(r.source_type) ?? []), r]);
  }

  const engagement: Partial<Record<string, EngagementEntry>> = {};
  for (const [source_type, evts] of parType) {
    const nbUtilise = evts.filter((e) => e.action === "utilisee").length;
    let confiance: Confiance;
    if (nbUtilise >= SEUIL_UTILISE_REGULIEREMENT) confiance = "utilise_regulierement";
    else if (nbUtilise >= 1) confiance = "utilise";
    else if (evts.some((e) => e.action === "ouverte")) confiance = "ouvert";
    else confiance = "vu";

    const derniereInteraction = evts.find((e) => e.action === "ouverte" || e.action === "utilisee") ?? null;
    const derniereVue = evts.find((e) => e.action === "vue") ?? null;

    // Ignorances consécutives : nombre de JOURS distincts où la
    // recommandation a été montrée ("vue") sans interaction réelle depuis
    // la dernière ouverture/utilisation — un simple affichage répété le
    // même jour (rechargement de l'accueil) ne compte qu'une fois, même
    // principe que attentionMemory.ts (derniere_proposition_le !== aujourd'hui).
    const joursVus = new Set<string>();
    for (const e of evts) {
      if (derniereInteraction && e.created_at <= derniereInteraction.created_at) break;
      if (e.action === "vue") joursVus.add(e.created_at.slice(0, 10));
    }

    engagement[source_type] = {
      confiance,
      ignorances_consecutives: joursVus.size,
      derniere_vue_le: derniereVue?.created_at ?? null,
      derniere_interaction_le: derniereInteraction?.created_at ?? null,
      derniere_signature: derniereVue?.signature ?? null,
    };
  }
  return engagement;
}

export async function enregistrerEvenementDecouverte(
  supabase: SupabaseClient,
  citoyenId: string,
  source_type: string,
  categorie: string,
  action: "vue" | "ouverte" | "utilisee",
  source_id: string | null = null,
  signature: string | null = null
): Promise<void> {
  await supabase.from("citoyen_recommendation_events").insert({
    citoyen_id: citoyenId, source_type, categorie, source_id, action, signature,
  });
}

// Journalise une "vue" (impression) pour chaque candidat effectivement
// renvoyé au citoyen aujourd'hui — au plus une par jour et par
// source_type, pour ne jamais fausser le compteur d'ignorances
// consécutives par de simples rechargements de l'accueil. Fire-and-forget
// côté route (un échec ici ne doit jamais bloquer l'affichage des
// suggestions déjà calculées).
export async function enregistrerImpressions(
  supabase: SupabaseClient,
  citoyenId: string,
  candidats: ExpositionCandidate[]
): Promise<void> {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  for (const c of candidats) {
    if (c.shown_at && c.shown_at.slice(0, 10) === aujourdHui) continue;
    await enregistrerEvenementDecouverte(supabase, citoyenId, c.source_type, c.categorie, "vue", c.source_id, c.signature);
  }
}
