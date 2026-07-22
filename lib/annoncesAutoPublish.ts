import type { SupabaseClient } from "@supabase/supabase-js";

// Lot D (refonte Communication → Annonces, 20/07/2026) — pas de cron
// disponible sur ce projet (aucune infra pg_cron/Edge Function planifiée
// trouvée). Convention déjà utilisée ailleurs dans le code (voir
// lib/notifications.ts) : bascule vérifiée à chaque chargement plutôt
// qu'à l'heure exacte. Appelé à la fois par la route institution
// (dashboard) et par la route publique (fiche citoyen) pour que la
// bascule se déclenche dès que l'une ou l'autre est consultée.
export async function flipAnnoncesPlanifiees(sb: SupabaseClient, institutionId: string): Promise<void> {
  await sb
    .from("annonces")
    .update({ statut: "publiee" })
    .eq("institution_id", institutionId)
    .eq("statut", "planifiee")
    .lte("date_publication", new Date().toISOString());
}
