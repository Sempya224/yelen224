// ⚠️ MODULE SERVEUR UNIQUEMENT — ne jamais importer depuis un fichier
// "use client". Utilise SUPABASE_SERVICE_ROLE_KEY (secret) : un import
// accidentel depuis un composant client l'embarquerait dans le bundle
// navigateur. N'importer que depuis des Server Actions ("use server") ou
// des routes API (app/api/**/route.ts).
//
// Chantier "Yelen Assistant" (décision CEO + Bryan, 20/07/2026) — moteur de
// notifications RDV, phases 1 à 8 (réservation → fin de prestation ;
// phases 9-11 liées aux avis = chantier séparé, plus tard). Remplace
// l'ancien envoyerNotification() de lib/notifications.ts qui insérait via
// le client anonyme du navigateur : la seule policy RLS sur `notifications`
// (notif_destinataire_own) n'autorise que destinataire_type='citoyen',
// donc tout envoi vers une institution échouait silencieusement (bug
// documenté dans CLAUDE.md, chantier notifications, 20/07/2026). Ce module
// utilise service_role, qui bypass RLS — même convention que les autres
// écritures cross-partie du projet (rdv/statut, qr/validate, etc.).
//
// Règle CEO + Bryan (20/07/2026) : CHAQUE notification, citoyen comme
// institution, sur TOUTES les phases, commence par la salutation
// Bonjour/Bon après-midi/Bonsoir + prénom du citoyen ou nom de
// l'établissement — utilisée comme `titre`, jamais répétée dans le corps.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { salutation } from "./salutation";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Push Web (Lot D, 20/07/2026) — configuré seulement si les clés VAPID sont
// présentes, pour ne jamais faire planter l'app si elles ne sont pas encore
// déployées (ex: build Netlify avant que Bryan ait ajouté les variables).
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contact@yelen224.com", VAPID_PUBLIC, VAPID_PRIVATE);
}

// Envoie un push à chaque appareil abonné d'un destinataire — best-effort,
// ne fait jamais échouer l'appelant. Nettoie automatiquement les
// abonnements expirés/révoqués (404/410, réponse standard du navigateur
// quand l'utilisateur désinstalle l'app ou révoque la permission).
async function envoyerPush(destinataireId: string, destinataireType: "citoyen" | "institution", titre: string, message: string, url: string): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("destinataire_id", destinataireId)
    .eq("destinataire_type", destinataireType);
  if (!subs || subs.length === 0) return;

  const payload = JSON.stringify({ titre, message, url });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sb.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("[notificationEngine] push error:", err);
      }
    }
  }));
}

export type NotifPhase =
  | "reservation"
  | "rappel_24h"
  | "rappel_2h"
  | "rappel_45min"
  | "rappel_15min"
  | "arrivee"
  | "prise_en_charge"
  | "termine";

export interface RdvNotifContext {
  rdvId: string;
  citoyenId: string;
  citoyenPrenom: string;
  institutionId: string;
  institutionNom: string;
  dateRdv: string;   // "2026-07-20"
  heureRdv: string;  // "09:30" ou "09:30:00"
}

// Même logique que parseLocalDate (dashboard institution) — un date_rdv
// "brut" donné à `new Date(...)` est réinterprété en UTC puis reconverti en
// fuseau local, ce qui décale la date d'un jour hors GMT+0. Construction
// locale directe pour éviter le bug déjà corrigé le 19/07/2026.
function formatDateLongue(dateRdv: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateRdv);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateRdv);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatHeureCourte(heureRdv: string): string {
  return (heureRdv || "").slice(0, 5);
}

async function inserer(
  destinataireId: string,
  destinataireType: "citoyen" | "institution",
  rdvId: string,
  type: NotifPhase,
  titre: string,
  message: string,
): Promise<void> {
  const { data, error } = await sb.from("notifications").insert({
    destinataire_id: destinataireId,
    destinataire_type: destinataireType,
    rdv_id: rdvId,
    type,
    titre,
    message,
    lu: false,
  }).select("id").single();
  if (error) { console.error("[notificationEngine] insert error:", error.message); return; }

  // Route vers l'id de la notification elle-même, pas rdv_id (12/08/2026,
  // bug réel trouvé lors de l'audit : rdv_id pouvait être absent pour
  // certains types de notification, produisant une URL cassée
  // /messagerie?rdv_id=null sur les push envoyées app fermée). La popup de
  // détail (app/page.tsx + NotificationDetailOverlay) résout elle-même le
  // lien "Voir la conversation" si un rdv_id existe réellement en base.
  const url = destinataireType === "citoyen" ? `/?notif=${data.id}` : `/institution/${destinataireId}/dashboard`;
  await envoyerPush(destinataireId, destinataireType, titre, message, url);
}

// ─── Phase 1 — Immédiatement après la réservation ──────────────────────
export async function notifierReservation(ctx: RdvNotifContext): Promise<void> {
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "reservation",
    salutation(ctx.citoyenPrenom),
    `Votre visite chez ${ctx.institutionNom} est maintenant planifiée. Nous préparerons cette visite avec vous jusqu'à votre arrivée. Vous recevrez uniquement les rappels utiles.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "reservation",
    salutation(ctx.institutionNom),
    `Nouvelle visite planifiée. ${ctx.citoyenPrenom} sera accueilli le ${formatDateLongue(ctx.dateRdv)} à ${formatHeureCourte(ctx.heureRdv)}. Cette visite est désormais intégrée à votre planning.`);
}

// ─── Phase 2 — 24 heures avant ──────────────────────────────────────────
export async function notifierRappel24h(ctx: RdvNotifContext): Promise<void> {
  const heure = formatHeureCourte(ctx.heureRdv);
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "rappel_24h",
    salutation(ctx.citoyenPrenom),
    `Demain, vous serez accueilli par ${ctx.institutionNom} à ${heure}. Votre journée est déjà organisée. Je resterai à vos côtés jusqu'à votre arrivée.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "rappel_24h",
    salutation(ctx.institutionNom),
    `Votre planning de demain est prêt. ${ctx.citoyenPrenom} sera accueilli demain à ${heure}. Je vous rappellerai chaque visite importante au bon moment.`);
}

// ─── Phase 3 — 2 heures avant ───────────────────────────────────────────
export async function notifierRappel2h(ctx: RdvNotifContext): Promise<void> {
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "rappel_2h",
    salutation(ctx.citoyenPrenom),
    `Il reste environ 2 heures avant votre visite chez ${ctx.institutionNom}. Si vous devez préparer un document ou commencer votre déplacement, c'est le bon moment.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "rappel_2h",
    salutation(ctx.institutionNom),
    `Votre activité commence bientôt. Vérifiez que votre équipe est prête à accueillir les premiers visiteurs.`);
}

// ─── Phase 4 — 45 minutes avant ─────────────────────────────────────────
export async function notifierRappel45min(ctx: RdvNotifContext): Promise<void> {
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "rappel_45min",
    salutation(ctx.citoyenPrenom),
    `Plus que 45 minutes avant votre arrivée chez ${ctx.institutionNom}. Si vous êtes en déplacement, vous êtes parfaitement dans les temps.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "rappel_45min",
    salutation(ctx.institutionNom),
    `Votre journée est bien engagée. ${ctx.citoyenPrenom} sera accueilli dans environ 45 minutes. Profitez de ce moment pour préparer son accueil.`);
}

// ─── Phase 5 — 15 minutes avant ─────────────────────────────────────────
export async function notifierRappel15min(ctx: RdvNotifContext): Promise<void> {
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "rappel_15min",
    salutation(ctx.citoyenPrenom),
    `Vous arrivez bientôt. Toute l'équipe de ${ctx.institutionNom} est prête à vous recevoir.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "rappel_15min",
    salutation(ctx.institutionNom),
    `Votre prochain visiteur arrive dans environ 15 minutes. L'équipe peut désormais préparer son accueil.`);
}

// ─── Phase 6 — Arrivée détectée (scan QR) ───────────────────────────────
export async function notifierArrivee(ctx: RdvNotifContext): Promise<void> {
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "arrivee",
    salutation(ctx.citoyenPrenom),
    `Bienvenue — votre arrivée a bien été enregistrée. L'établissement a été informé de votre présence.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "arrivee",
    salutation(ctx.institutionNom),
    `${ctx.citoyenPrenom} est arrivé. Vous pouvez maintenant commencer sa prise en charge.`);
}

// ─── Phase 7 — Début de la prise en charge ──────────────────────────────
// Décision Bryan (20/07/2026) : même trigger réel que la Phase 6 (le scan
// QR) — il n'existe pas d'action "commencer la prise en charge" séparée
// dans le flux institution. Les deux phases sont envoyées l'une après
// l'autre depuis le même point de code (route de validation QR, Lot B).
export async function notifierPriseEnCharge(ctx: RdvNotifContext): Promise<void> {
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "prise_en_charge",
    salutation(ctx.citoyenPrenom),
    `Vous êtes maintenant pris en charge. Nous espérons que tout se déroulera dans les meilleures conditions.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "prise_en_charge",
    salutation(ctx.institutionNom),
    `La prise en charge de ${ctx.citoyenPrenom} est en cours. Nous vous souhaitons une excellente intervention.`);
}

// ─── Phase 8 — Fin de la prestation ─────────────────────────────────────
export async function notifierFinPrestation(ctx: RdvNotifContext): Promise<void> {
  await inserer(ctx.citoyenId, "citoyen", ctx.rdvId, "termine",
    salutation(ctx.citoyenPrenom),
    `Merci d'avoir choisi ${ctx.institutionNom} aujourd'hui. Votre expérience est maintenant terminée. Votre avis aidera les prochains citoyens et permettra à l'établissement d'améliorer la qualité de son accueil.`);
  await inserer(ctx.institutionId, "institution", ctx.rdvId, "termine",
    salutation(ctx.institutionNom),
    `Cette visite est terminée. Nous espérons que tout s'est bien déroulé. Le citoyen sera invité à partager son expérience.`);
}

// ─── Envoi générique (annulation/report — motif variable, pas un des 8
// phases fixes du brief CEO) ─────────────────────────────────────────────
export async function envoyerNotification(params: {
  destinataireId: string;
  destinataireType: "citoyen" | "institution";
  rdvId: string | null;
  // FK optionnelles (24/08/2026, Mission Ghost — Notifications V2) — les
  // colonnes existent en base depuis les Lots précédents (démarches,
  // dépenses) mais cette fonction générique ne les acceptait pas encore,
  // laissant `demarche_creee`/`depense_ajoutee` sans lien exploitable pour
  // un CTA précis. Toutes optionnelles, rétrocompatible avec chaque appel
  // existant qui ne passe que `rdvId`.
  demarcheId?: string | null;
  etapeId?: string | null;
  depenseId?: string | null;
  budgetId?: string | null;
  objectifId?: string | null;
  type: string;
  titre: string;
  message: string;
}): Promise<void> {
  const { data, error } = await sb.from("notifications").insert({
    destinataire_id: params.destinataireId,
    destinataire_type: params.destinataireType,
    rdv_id: params.rdvId,
    demarche_id: params.demarcheId ?? null,
    etape_id: params.etapeId ?? null,
    depense_id: params.depenseId ?? null,
    budget_id: params.budgetId ?? null,
    objectif_id: params.objectifId ?? null,
    type: params.type,
    titre: params.titre,
    message: params.message,
    lu: false,
  }).select("id").single();
  if (error) { console.error("[notificationEngine] insert error:", error.message); return; }

  const url = params.destinataireType === "citoyen" ? `/?notif=${data.id}` : `/institution/${params.destinataireId}/dashboard`;
  await envoyerPush(params.destinataireId, params.destinataireType, params.titre, params.message, url);
}

// ─── Audit trail rdv_events (service_role) ──────────────────────────────
// `rdv_events` a RLS activé mais AUCUNE policy (migration
// 20260709000012_create_rdv_events.sql) — un insert via le client anonyme
// du navigateur échoue donc toujours silencieusement, quel que soit
// l'auteur. L'ancien logRdvEvent() de lib/notifications.ts en souffrait
// déjà (utilisé par notifierAnnulation/notifierReport, jamais persisté en
// pratique) — reputationScore.ts::estAnnuleParInstitution() s'appuie sur
// ces entrées pour distinguer annulation citoyen/institution ; ce signal
// était donc faussé (toute annulation comptait par défaut comme
// "institution"). Ce nouvel export, appelé depuis app/mes-rdv/actions.ts,
// est le premier point qui écrit réellement dans cette table côté citoyen.
export async function logRdvEvent(params: {
  rdvId: string;
  auteurId: string;
  auteurType: "citoyen" | "institution" | "system";
  action: "creation" | "confirmation" | "annulation" | "report" | "termine" | "absent" | "message" | "depasse";
  ancienStatut?: string;
  nouveauStatut?: string;
  motif?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await sb.from("rdv_events").insert({
    rdv_id: params.rdvId,
    auteur_id: params.auteurId,
    auteur_type: params.auteurType,
    action: params.action,
    ancien_statut: params.ancienStatut ?? null,
    nouveau_statut: params.nouveauStatut ?? null,
    motif: params.motif ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("[notificationEngine] logRdvEvent error:", error.message);
}

// ─── Documents citoyen (plan rétention v2, item 1 — voir CLAUDE.md
// /chantier-strategie-retention-v2) — citoyen_documents ne déclenchait
// jusqu'ici AUCUNE notification, ni à la création d'une demande/d'un envoi
// par l'institution, ni quand le citoyen répond en téléversant. Réutilise
// envoyerNotification() (générique, pas l'une des 8 phases RDV fixes),
// avec le vrai rdv_id de citoyen_documents.rdv_id — pas de nouveau type de
// lien à construire, la navigation par rdv_id existe déjà.
export async function notifierDocumentDemande(params: { citoyenId: string; citoyenPrenom: string | null; institutionNom: string; label: string; rdvId: string }): Promise<void> {
  await envoyerNotification({
    destinataireId: params.citoyenId,
    destinataireType: "citoyen",
    rdvId: params.rdvId,
    type: "document_demande",
    titre: salutation(params.citoyenPrenom || "cher client"),
    message: `${params.institutionNom} vous demande de fournir : « ${params.label} ». Vous pouvez le téléverser depuis Mes documents.`,
  });
}

export async function notifierDocumentEnvoye(params: { citoyenId: string; citoyenPrenom: string | null; institutionNom: string; label: string; rdvId: string }): Promise<void> {
  await envoyerNotification({
    destinataireId: params.citoyenId,
    destinataireType: "citoyen",
    rdvId: params.rdvId,
    type: "document_envoye",
    titre: salutation(params.citoyenPrenom || "cher client"),
    message: `${params.institutionNom} vous a envoyé un document : « ${params.label} ». Vous pouvez le consulter dans Mes documents.`,
  });
}

export async function notifierDocumentTeleverse(params: { institutionId: string; institutionNom: string | null; citoyenPrenom: string; label: string; rdvId: string }): Promise<void> {
  await envoyerNotification({
    destinataireId: params.institutionId,
    destinataireType: "institution",
    rdvId: params.rdvId,
    type: "document_televerse",
    titre: salutation(params.institutionNom || "votre équipe"),
    message: `${params.citoyenPrenom} a téléversé le document demandé : « ${params.label} ».`,
  });
}

export { formatDateLongue, formatHeureCourte, salutation };
