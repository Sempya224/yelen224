import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerNotification } from "@/lib/notificationEngine";

// Restriction automatique des rendez-vous (no-show), décision CEO
// 03/09/2026 — voir migration 20260903000001_citoyen_rdv_restrictions.sql.
// Les seuils (3/5/10) et la logique d'escalade vivent UNIQUEMENT dans le
// trigger SQL (citoyen_rdv_evaluer_restriction) — ce fichier ne fait que
// lire l'état déjà calculé, jamais le recalculer côté application (évite le
// type de drift déjà rencontré une fois sur institutions.moyenne_avis).
// RDV_ABSENCE_SEUILS n'est donc qu'un miroir d'affichage (échelle des
// paliers montrée au citoyen), pas une source de décision.
//
// RDV_ABSENCE_SEUILS/RDV_RESTRICTION_DUREE_JOURS/RdvRestrictionNiveau
// vivent maintenant dans lib/rdvRestrictionsConstants.ts (fichier sans
// aucun import), ré-exportés ici pour ne rien casser côté serveur — ce
// fichier-ci reste celui à ne jamais importer depuis un composant client
// (il tire lib/notificationEngine.ts, donc web-push, Node-only net/tls).
export { RDV_ABSENCE_SEUILS, RDV_RESTRICTION_DUREE_JOURS, type RdvRestrictionNiveau } from "@/lib/rdvRestrictionsConstants";
import type { RdvRestrictionNiveau } from "@/lib/rdvRestrictionsConstants";

export type RdvRestrictionActive = {
  id: string;
  reference: string;
  niveau: RdvRestrictionNiveau;
  absencesTotal: number;
  jusquAu: string | null;
  createdAt: string;
};

// Réutilisé par GET /api/citoyen/rdv-restriction ET par la vérification
// amont de createRdv (app/rdv/[id]/actions.ts) — le vrai verrou reste la
// policy RLS INSERT (defense en profondeur), ceci ne sert qu'à produire un
// message humanisé avant l'écriture plutôt que de laisser remonter une
// erreur Postgres brute.
export async function chargerRestrictionActive(
  sb: SupabaseClient,
  citoyenId: string
): Promise<RdvRestrictionActive | null> {
  const { data } = await sb
    .from("citoyen_rdv_restrictions")
    .select("id, reference, niveau, absences_total, jusqu_au, created_at")
    .eq("citoyen_id", citoyenId)
    .eq("statut", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    reference: data.reference,
    niveau: data.niveau as RdvRestrictionNiveau,
    absencesTotal: data.absences_total,
    jusquAu: data.jusqu_au,
    createdAt: data.created_at,
  };
}

export const RDV_RESTRICTION_MESSAGE_CREATION =
  "Votre compte ne peut actuellement pas effectuer de nouvelles réservations. Consultez votre écran de restriction pour plus de détails.";

// Messages structurés en 3 temps (constat → ce qui change/ne change pas →
// action possible) — retour Bryan 30/09/2026 : le message d'origine
// (une seule phrase) ne donnait ni le détail du palier ni de chemin vers
// components/RdvRestrictionScreen.tsx, seule source réelle du détail
// (compte à rebours, historique des RDV absents, formulaire d'appel). Le
// CTA "En savoir plus" (lib/notificationContent.tsx::resoudreCta) y renvoie
// désormais, donc ce texte n'a plus besoin de tout répéter — seulement
// d'orienter correctement avant que le citoyen ouvre l'écran dédié.
// Rendu avec whiteSpace:"pre-wrap" (NotificationDetailOverlay.tsx), les
// sauts de ligne sont donc affichés tels quels.
const RDV_RESTRICTION_NOTIFICATION: Record<RdvRestrictionNiveau, { type: string; titre: string; message: string }> = {
  restreint_7j: {
    type: "rdv_restriction_7j",
    titre: "Restriction de vos rendez-vous (7 jours)",
    message:
      "Votre compte ne peut plus effectuer de nouvelles réservations pendant 7 jours.\n\n" +
      "Motif : plusieurs rendez-vous confirmés ont été enregistrés comme non honorés.\n\n" +
      "Ce qui change : impossible de réserver un nouveau rendez-vous pendant cette période.\n" +
      "Ce qui ne change pas : le reste de Yelen (rendez-vous déjà pris, messagerie, documents…) reste accessible normalement.\n\n" +
      "Consultez votre écran de restriction pour voir le détail et la date de réactivation.",
  },
  restreint_30j: {
    type: "rdv_restriction_30j",
    titre: "Restriction de vos rendez-vous (30 jours)",
    message:
      "Votre compte ne peut plus effectuer de nouvelles réservations pendant 30 jours.\n\n" +
      "Motif : de nouveaux rendez-vous confirmés ont été enregistrés comme non honorés, en plus d'une précédente restriction de 7 jours.\n\n" +
      "Ce qui change : impossible de réserver un nouveau rendez-vous pendant cette période.\n" +
      "Ce qui ne change pas : le reste de Yelen (rendez-vous déjà pris, messagerie, documents…) reste accessible normalement.\n\n" +
      "Consultez votre écran de restriction pour voir le détail et la date de réactivation.",
  },
  clos: {
    type: "rdv_restriction_clos",
    titre: "Votre accès aux rendez-vous a été clôturé",
    message:
      "Votre accès à la prise de rendez-vous et aux réservations a été clôturé définitivement, après l'enregistrement de 10 rendez-vous non honorés.\n\n" +
      "Ce qui change : la prise de rendez-vous et les réservations ne sont plus accessibles.\n" +
      "Ce qui ne change pas : le reste de votre compte Yelen (messagerie, documents, historique…) reste accessible normalement.\n\n" +
      "Si vous estimez que cette décision est une erreur, vous pouvez faire appel depuis votre écran de restriction.",
  },
};

// Pont minimal entre le trigger SQL (citoyen_rdv_evaluer_restriction, seul
// point de calcul des seuils) et le moteur de notifications TS — appelé
// juste après qu'une institution ait marqué un rdv "absent". 3 points
// d'écriture réels de presence_status='absent' à ce jour :
// app/api/institution/rdv/statut/route.ts,
// app/api/institution/paid-bookings/valider/route.ts (appellent cette
// fonction directement), et lib/qrValidation.ts::confirmerPresenceRdv
// (partagée par le scan QR dashboard et YELEN Accueil — appelle cette
// fonction elle-même, inconditionnellement, trou comblé le 14/09/2026).
// Compare l'id de la restriction active avant/après l'update : s'il a
// changé, le trigger vient d'escalader, jamais recalculé ici.
export async function notifierSiEscalade(
  sb: SupabaseClient,
  citoyenId: string,
  restrictionAvantId: string | null
): Promise<void> {
  const apres = await chargerRestrictionActive(sb, citoyenId);
  if (!apres || apres.id === restrictionAvantId) return;
  const meta = RDV_RESTRICTION_NOTIFICATION[apres.niveau];
  await envoyerNotification({
    destinataireId: citoyenId,
    destinataireType: "citoyen",
    rdvId: null,
    type: meta.type,
    titre: meta.titre,
    message: meta.message,
  });
}
