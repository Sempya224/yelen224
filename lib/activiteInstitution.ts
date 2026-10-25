// Équivalent institution de lib/activiteCitoyenne.ts — voir ce fichier
// pour le raisonnement complet (chantier COMPTES-INACTIFS.md, Phase 3,
// autorisation CEO 15/10/2026). Réactivation événementielle appelée (a)
// ici, depuis toucherActiviteInstitution (action qualifiante), et (b)
// depuis lib/institutionAuth.ts::creerSessionInstitution (connexion
// vérifiée — point d'écriture déjà unique pour les 5 flux de connexion
// institution existants, aucune route supplémentaire à modifier).
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerNotification } from "./notificationEngine";
import { salutation } from "./salutation";

export async function toucherActiviteInstitution(sb: SupabaseClient, institutionId: string): Promise<void> {
  const { error } = await sb
    .from("institutions")
    .update({ derniere_action_qualifiante_le: new Date().toISOString() })
    .eq("id", institutionId);
  if (error) {
    console.error("[activiteInstitution] échec touch:", error.message);
    return;
  }
  await reactiverInstitutionSiInactif(sb, institutionId);
}

export async function reactiverInstitutionSiInactif(sb: SupabaseClient, institutionId: string): Promise<void> {
  const { data: suspension } = await sb
    .from("institution_suspensions")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("statut", "active")
    .eq("origine", "auto_inactivite")
    .maybeSingle();
  if (!suspension) return;

  const { error: errLift } = await sb
    .from("institution_suspensions")
    .update({ statut: "levee", levee_par: "auto", levee_le: new Date().toISOString() })
    .eq("id", suspension.id);
  if (errLift) {
    console.error("[activiteInstitution] échec levée suspension:", errLift.message);
    return;
  }

  // Sûr par construction : une suspension auto_inactivite active implique
  // (invariant posé par institution_inactivite_evaluer()) qu'aucune autre
  // suspension active n'existe pour cette institution — remettre
  // statut='validee' ne réactive donc jamais un compte suspendu pour une
  // autre cause en parallèle.
  await sb.from("institutions").update({ statut: "validee" }).eq("id", institutionId);
  await sb
    .from("institutions")
    .update({ inactivite_j30_notifie_le: null, inactivite_j60_notifie_le: null })
    .eq("id", institutionId);

  await sb.from("inactivite_observation_log").insert({
    acteur_type: "institution",
    acteur_id: institutionId,
    evenement: "reactivation",
    effet_reel_applique: true,
  });

  const { data: inst } = await sb.from("institutions").select("name").eq("id", institutionId).maybeSingle();
  await envoyerNotification({
    destinataireId: institutionId,
    destinataireType: "institution",
    rdvId: null,
    type: "institution_inactivite_reactivation",
    titre: salutation(inst?.name || "votre équipe"),
    message: "Votre établissement est de nouveau actif et visible par les citoyens.",
  });
}
