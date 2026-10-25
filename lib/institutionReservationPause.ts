import type { SupabaseClient } from "@supabase/supabase-js";

// Booking Governance, Lot 1 (docs/product/YELEN_BOOKING_GOVERNANCE.md
// §3/§6) — même forme que chargerRestrictionActive/
// chargerSuspensionInactiviteActive (lib/rdvRestrictions.ts,
// lib/inactiviteCitoyenne.ts) : le vrai verrou est la policy RLS INSERT
// (institution_a_pause_active(), migration 20261018000006), cette
// vérification amont ne sert qu'à renvoyer un message humanisé au lieu de
// laisser remonter l'erreur Postgres brute.
export type PauseEtablissementActive = {
  id: string;
  type: "immediate" | "jusqu_a_date" | "periode";
  debutLe: string;
  finLe: string | null;
};

// Retour Bryan 18/10/2026 : le §6 de la vision CEO (motif interne jamais
// exposé) reste respecté, mais un titre sec donnait l'impression d'un
// problème/bug côté établissement. Reformulé pour expliquer calmement la
// situation (pause volontaire côté établissement, raisons plausibles sans
// jamais affirmer la vraie, pas de panique) et guider le citoyen — même
// tonalité que les messages "temporairement indisponible" des plateformes
// de référence (DoorDash/Uber Eats). Affiché uniquement au moment où le
// citoyen déclenche l'action de réservation (retour d'erreur de
// validerCreneauServeur/validerChambreServeur), jamais en bandeau permanent
// — voir "hors scope" du plan Lot 1 pour la bannière sur la fiche publique.
export const PAUSE_MESSAGE_CITOYEN =
  "Cet établissement a mis les nouvelles réservations en pause pour le moment — cela peut être lié à une forte demande, une réorganisation interne ou ses horaires d'ouverture. Vos rendez-vous déjà confirmés restent inchangés. Vous pouvez réessayer un peu plus tard ou consulter les horaires de l'établissement.";

export async function chargerPauseEtablissementActive(
  sb: SupabaseClient,
  institutionId: string
): Promise<PauseEtablissementActive | null> {
  const { data } = await sb
    .from("institution_reservation_pauses")
    .select("id, type, debut_le, fin_le")
    .eq("institution_id", institutionId)
    .is("levee_le", null)
    .order("cree_le", { ascending: false })
    .limit(5);
  if (!data) return null;

  const maintenant = Date.now();
  const active = data.find(p => {
    const debut = new Date(p.debut_le).getTime();
    const fin = p.fin_le ? new Date(p.fin_le).getTime() : null;
    return debut <= maintenant && (fin === null || fin > maintenant);
  });
  if (!active) return null;

  return { id: active.id, type: active.type, debutLe: active.debut_le, finLe: active.fin_le };
}
