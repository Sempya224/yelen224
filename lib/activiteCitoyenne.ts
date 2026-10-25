// Point d'écriture unique du signal "action métier qualifiante" citoyen
// (chantier COMPTES-INACTIFS.md, Phase 3, autorisation CEO 15/10/2026) —
// jamais un UPDATE dupliqué route par route (même discipline que
// lib/rdvGating.ts, suite au drift déjà rencontré sur
// institutions.moyenne_avis). `sb` est fourni par l'appelant (déjà un
// client service_role dans chaque route) plutôt qu'instancié ici, pour ne
// jamais multiplier les clients Supabase par requête.
//
// Réactivation événementielle (section 2.6 de la conception) : se
// déclenche ICI (action qualifiante) et dans
// app/api/citoyen/auth/touch-login/route.ts (connexion vérifiée fraîche).
// Volontairement JAMAIS déclenchée par un simple chargement de page avec
// une session déjà ouverte (2.11.5) — chaque appelant de
// reactiverCitoyenSiInactif prouve une action réelle, pas une lecture
// passive.
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerNotification } from "./notificationEngine";
import { salutation } from "./salutation";

export async function toucherActiviteCitoyenne(sb: SupabaseClient, citoyenId: string): Promise<void> {
  const { error } = await sb
    .from("users")
    .update({ derniere_action_qualifiante_le: new Date().toISOString() })
    .eq("id", citoyenId);
  if (error) {
    console.error("[activiteCitoyenne] échec touch:", error.message);
    return;
  }
  await reactiverCitoyenSiInactif(sb, citoyenId);
}

export async function reactiverCitoyenSiInactif(sb: SupabaseClient, citoyenId: string): Promise<void> {
  const { data: suspension } = await sb
    .from("citoyen_inactivite_suspensions")
    .select("id")
    .eq("citoyen_id", citoyenId)
    .eq("statut", "active")
    .maybeSingle();
  if (!suspension) return;

  const { error: errLift } = await sb
    .from("citoyen_inactivite_suspensions")
    .update({ statut: "levee", levee_par: "auto", levee_le: new Date().toISOString() })
    .eq("id", suspension.id);
  if (errLift) {
    console.error("[activiteCitoyenne] échec levée suspension:", errLift.message);
    return;
  }

  await sb
    .from("users")
    .update({ inactivite_j30_notifie_le: null, inactivite_j60_notifie_le: null })
    .eq("id", citoyenId);

  await sb.from("inactivite_observation_log").insert({
    acteur_type: "citoyen",
    acteur_id: citoyenId,
    evenement: "reactivation",
    effet_reel_applique: true,
  });

  const { data: user } = await sb.from("users").select("prenom").eq("id", citoyenId).maybeSingle();
  await envoyerNotification({
    destinataireId: citoyenId,
    destinataireType: "citoyen",
    rdvId: null,
    type: "citoyen_inactivite_reactivation",
    titre: salutation(user?.prenom || "cher utilisateur"),
    message: "Votre compte Yelen est de nouveau actif. Heureux de vous revoir.",
  });
}
