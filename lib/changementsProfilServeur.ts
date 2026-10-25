import type { SupabaseClient } from "@supabase/supabase-js";
import { idsActiviteReferences, type LibellesActivite } from "./changementsProfilAffichage";

// Traduction serveur des identifiants de catégorie / activité (valeurs avant /
// après d'une demande d'examen de changement de profil) en libellés. Partagé
// par la file admin (api/admin/changements-profil) et le suivi côté
// établissement (api/institution/changements-profil). Requêtes séparées,
// jamais d'embed PostgREST ; relance toute erreur Supabase à l'appelant.
export async function chargerLibellesActivite(sb: SupabaseClient, valeurs: unknown[]): Promise<LibellesActivite> {
  const refs = idsActiviteReferences(valeurs);
  const [categories, activites] = await Promise.all([
    refs.categories.length ? sb.from("activite_categories").select("id,label").in("id", refs.categories) : Promise.resolve({ data: [], error: null }),
    refs.activites.length ? sb.from("activites").select("id,label").in("id", refs.activites) : Promise.resolve({ data: [], error: null }),
  ]);
  if (categories.error) throw categories.error;
  if (activites.error) throw activites.error;
  return {
    categories: new Map((categories.data ?? []).map(c => [c.id as string, c.label as string])),
    activites: new Map((activites.data ?? []).map(a => [a.id as string, a.label as string])),
  };
}
