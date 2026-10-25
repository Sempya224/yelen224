import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerPauseEtablissementActive, type PauseEtablissementActive } from "@/lib/institutionReservationPause";

// Booking Governance, Lot 2 (docs/product/YELEN_BOOKING_GOVERNANCE.md
// §8/§11.3-b) — service central unique pour ne jamais reproduire le trou
// déjà constaté au §10 (3 routes dispersées qui vérifient
// institutions.statut chacune de leur côté). Les 5 états du §2 sont
// représentés, mais seuls CAN_BOOK/PAUSED_BY_ESTABLISHMENT/SUSPENDED ont
// aujourd'hui une source réelle qui les alimente : PAUSED_BY_YELEN
// (pause imposée hors suspension) et RESTRICTED n'existent dans aucun
// mécanisme en prod à ce jour (voir §10 "n'existe pas du tout") — gardés
// dans le type pour que le Lot 3 et les futurs appelants n'aient pas à
// réécrire leur switch le jour où une source réelle apparaît.
export type BookingAccessState =
  | "CAN_BOOK"
  | "PAUSED_BY_ESTABLISHMENT"
  | "PAUSED_BY_YELEN"
  | "RESTRICTED"
  | "SUSPENDED";

export type BookingAccess = {
  etat: BookingAccessState;
  // Détail de la pause active uniquement si etat === "PAUSED_BY_ESTABLISHMENT".
  pause: PauseEtablissementActive | null;
};

// Deux sources indépendantes, jamais fusionnées en amont (décision §11.3-2
// de Bryan : la pause volontaire ne dit rien de la santé/l'activité
// générale de l'établissement, sémantiquement distincte de la suspension
// imposée) — réconciliées uniquement ici, au moment de produire un état
// unique à consommer par l'appelant.
export async function getBookingAccess(
  sb: SupabaseClient,
  institutionId: string
): Promise<BookingAccess> {
  const [{ data: institution, error }, pause] = await Promise.all([
    sb.from("institutions").select("statut").eq("id", institutionId).maybeSingle(),
    chargerPauseEtablissementActive(sb, institutionId),
  ]);

  // Fail closed, jamais fail-open sur une vraie erreur DB (corrigé le
  // 19/10/2026, revue critique du Lot 3) : à la différence de la pause
  // (verrou RLS réel en base, migration 20261018000006),
  // bloqueTraitementExistant n'a aucun filet de sécurité au niveau base —
  // si cette lecture échoue, supposer silencieusement "non suspendue"
  // laisserait une institution suspendue continuer à traiter des
  // réservations pendant une panne/erreur DB. Laissé remonter tel quel
  // (pas de try/catch ici) : les 3 routes appelantes n'en ont pas non
  // plus, Next.js renvoie alors un 500 générique sans fuite de message —
  // même principe que /pieges-techniques-connus "destructurer error avant
  // de tester !data".
  if (error) throw new Error(`getBookingAccess: lecture institutions.statut impossible (${error.message})`);

  // Suspension imposée = mesure la plus sévère (§4) : prévaut toujours sur
  // une pause volontaire par ailleurs active, même si les deux sont vraies
  // en même temps.
  if (institution?.statut === "suspendue") {
    return { etat: "SUSPENDED", pause: null };
  }
  if (pause) {
    return { etat: "PAUSED_BY_ESTABLISHMENT", pause };
  }
  return { etat: "CAN_BOOK", pause: null };
}

// La pause volontaire (§3) ne bloque que l'admission de NOUVELLES
// réservations (déjà appliqué au niveau RLS, voir
// institution_a_pause_active() dans la migration 20261018000006) — elle ne
// doit jamais empêcher l'établissement de traiter un RDV déjà existant
// (accepter/refuser/terminer, valider un paiement, check-in QR). Seule la
// suspension imposée bloque aussi le traitement de l'existant (§5,
// comportement déjà en prod depuis le 15/09/2026 dans les 3 routes
// dispersées que le Lot 3 doit migrer vers cette fonction).
export function bloqueTraitementExistant(etat: BookingAccessState): boolean {
  return etat === "SUSPENDED";
}

export const BOOKING_ACCESS_SUSPENDU_MESSAGE =
  "Votre établissement est actuellement suspendu — vous ne pouvez plus traiter de rendez-vous tant que cette mesure n'est pas levée. Consultez l'écran « Espace suspendu » pour comprendre pourquoi et, si besoin, demander une révision.";
