import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifType =
  | "confirmation"
  | "rappel_24h"
  | "rappel_30min"
  | "heure_rdv"
  | "rdv_termine"
  | "rdv_annule"
  | "rdv_reporte"
  | "rdv_depasse"
  | "message"
  | "avis";

export type AuteurType = "citoyen" | "institution" | "system";

export type RdvAction =
  | "creation"
  | "confirmation"
  | "annulation"
  | "report"
  | "termine"
  | "absent"
  | "message"
  | "depasse";

export interface RdvComplet {
  id: string;
  date_rdv: string;
  heure_rdv: string;
  objet?: string | null;
  statut: string;
  citoyen_id: string;
  institution_id: string;
  motif_annulation?: string | null;
  motif_report?: string | null;
  termine_at?: string | null;
  termine_par?: string | null;
  avis_demande?: boolean;
  depasse_notifie?: boolean;
  institution?: { name: string } | null;
  citoyen?: { prenom?: string | null; nom?: string | null; phone?: string | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function nomCitoyen(rdv: RdvComplet): string {
  if (!rdv.citoyen) return "Citoyen";
  const { prenom, nom, phone } = rdv.citoyen;
  return [prenom, nom].filter(Boolean).join(" ") || phone || "Citoyen";
}

// ─── Envoi notification ───────────────────────────────────────────────────────

export async function envoyerNotification(params: {
  destinataire_id: string;
  destinataire_type: "citoyen" | "institution";
  rdv_id: string;
  type: NotifType;
  titre: string;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    destinataire_id: params.destinataire_id,
    destinataire_type: params.destinataire_type,
    rdv_id: params.rdv_id,
    type: params.type,
    titre: params.titre,
    message: params.message,
    lu: false,
  });
  if (error) console.error("[Notif] Erreur insertion:", error.message);
}

// ─── Enregistrer un événement RDV (audit trail) ───────────────────────────────

export async function logRdvEvent(params: {
  rdv_id: string;
  auteur_id: string;
  auteur_type: AuteurType;
  action: RdvAction;
  ancien_statut?: string;
  nouveau_statut?: string;
  motif?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("rdv_events").insert({
    rdv_id: params.rdv_id,
    auteur_id: params.auteur_id,
    auteur_type: params.auteur_type,
    action: params.action,
    ancien_statut: params.ancien_statut ?? null,
    nouveau_statut: params.nouveau_statut ?? null,
    motif: params.motif ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) console.error("[Event] Erreur log:", error.message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION 1 — Confirmation après prise de RDV
// Déclenchement : citoyen prend RDV → institution confirme
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierConfirmation(rdv: RdvComplet): Promise<void> {
  const dateLabel = formatDateFR(rdv.date_rdv);
  const instName = rdv.institution?.name ?? "l'institution";

  // → Citoyen
  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdv.id,
    type: "confirmation",
    titre: "✅ Rendez-vous confirmé",
    message: `Votre RDV chez ${instName} le ${dateLabel} à ${rdv.heure_rdv} est confirmé.`,
  });

  // → Institution
  await envoyerNotification({
    destinataire_id: rdv.institution_id,
    destinataire_type: "institution",
    rdv_id: rdv.id,
    type: "confirmation",
    titre: "📅 Nouveau RDV confirmé",
    message: `RDV de ${nomCitoyen(rdv)} le ${dateLabel} à ${rdv.heure_rdv} — ${rdv.objet ?? "Sans objet"}.`,
  });

  // Audit
  await logRdvEvent({
    rdv_id: rdv.id,
    auteur_id: rdv.institution_id,
    auteur_type: "institution",
    action: "confirmation",
    ancien_statut: "en_attente",
    nouveau_statut: "confirme",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION 2 — Rappel 24h avant
// Déclenchement : à appeler via cron ou au chargement du dashboard
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierRappel24h(rdv: RdvComplet): Promise<void> {
  const dateLabel = formatDateFR(rdv.date_rdv);
  const instName = rdv.institution?.name ?? "l'institution";

  // → Citoyen
  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdv.id,
    type: "rappel_24h",
    titre: "⏰ Rappel — RDV demain",
    message: `N'oubliez pas votre RDV chez ${instName} demain ${dateLabel} à ${rdv.heure_rdv}.`,
  });

  // → Institution
  await envoyerNotification({
    destinataire_id: rdv.institution_id,
    destinataire_type: "institution",
    rdv_id: rdv.id,
    type: "rappel_24h",
    titre: "📋 RDV demain",
    message: `${nomCitoyen(rdv)} a un RDV demain à ${rdv.heure_rdv} — ${rdv.objet ?? "Sans objet"}.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION 3 — Rappel 30min avant
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierRappel30min(rdv: RdvComplet): Promise<void> {
  const instName = rdv.institution?.name ?? "l'institution";

  // → Citoyen
  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdv.id,
    type: "rappel_30min",
    titre: "🔔 Dans 30 minutes !",
    message: `Votre RDV chez ${instName} commence dans 30 minutes à ${rdv.heure_rdv}. Préparez-vous !`,
  });

  // → Institution
  await envoyerNotification({
    destinataire_id: rdv.institution_id,
    destinataire_type: "institution",
    rdv_id: rdv.id,
    type: "rappel_30min",
    titre: "⏱️ RDV dans 30 min",
    message: `${nomCitoyen(rdv)} arrive dans 30 minutes pour son RDV à ${rdv.heure_rdv}.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION 4 — Heure exacte du RDV
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierHeureRdv(rdv: RdvComplet): Promise<void> {
  const instName = rdv.institution?.name ?? "l'institution";

  // → Citoyen
  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdv.id,
    type: "heure_rdv",
    titre: "🟢 C'est l'heure de votre RDV !",
    message: `Votre rendez-vous chez ${instName} commence maintenant à ${rdv.heure_rdv}. Bonne visite !`,
  });

  // → Institution
  await envoyerNotification({
    destinataire_id: rdv.institution_id,
    destinataire_type: "institution",
    rdv_id: rdv.id,
    type: "heure_rdv",
    titre: "🟢 RDV en cours",
    message: `Le RDV de ${nomCitoyen(rdv)} commence maintenant à ${rdv.heure_rdv}.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION 5 — RDV terminé (déclenché par le prestataire)
// + CTA laisser un avis pour le citoyen
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierRdvTermine(
  rdv: RdvComplet,
  terminePar: string
): Promise<void> {
  const instName = rdv.institution?.name ?? "l'institution";

  // → Citoyen : notification + CTA avis
  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdv.id,
    type: "rdv_termine",
    titre: "✅ RDV terminé — Donnez votre avis !",
    message: `Votre RDV chez ${instName} est terminé. Partagez votre expérience en laissant un avis.`,
  });

  // → Institution
  await envoyerNotification({
    destinataire_id: rdv.institution_id,
    destinataire_type: "institution",
    rdv_id: rdv.id,
    type: "rdv_termine",
    titre: "✅ RDV marqué terminé",
    message: `Le RDV de ${nomCitoyen(rdv)} a été marqué terminé.`,
  });

  // Marquer avis_demande = true sur le RDV
  await supabase
    .from("rdv")
    .update({
      statut: "termine",
      termine_at: new Date().toISOString(),
      termine_par: terminePar,
      avis_demande: true,
    })
    .eq("id", rdv.id);

  // Audit
  await logRdvEvent({
    rdv_id: rdv.id,
    auteur_id: terminePar,
    auteur_type: "institution",
    action: "termine",
    ancien_statut: "confirme",
    nouveau_statut: "termine",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION — RDV annulé (citoyen ou institution)
// Avec motif obligatoire
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierAnnulation(
  rdv: RdvComplet,
  annulePar: string,
  annuleParType: "citoyen" | "institution",
  motif: string
): Promise<void> {
  const instName = rdv.institution?.name ?? "l'institution";
  const dateLabel = formatDateFR(rdv.date_rdv);
  const auteurLabel = annuleParType === "citoyen" ? nomCitoyen(rdv) : instName;

  // Notifier l'autre partie
  const destinataireId =
    annuleParType === "citoyen" ? rdv.institution_id : rdv.citoyen_id;
  const destinataireType =
    annuleParType === "citoyen" ? "institution" : "citoyen";

  await envoyerNotification({
    destinataire_id: destinataireId,
    destinataire_type: destinataireType,
    rdv_id: rdv.id,
    type: "rdv_annule",
    titre: "❌ RDV annulé",
    message: `Le RDV du ${dateLabel} à ${rdv.heure_rdv} a été annulé par ${auteurLabel}. Motif : ${motif}`,
  });

  // Notifier aussi l'auteur (confirmation)
  await envoyerNotification({
    destinataire_id: annulePar,
    destinataire_type: annuleParType,
    rdv_id: rdv.id,
    type: "rdv_annule",
    titre: "❌ Annulation confirmée",
    message: `Votre annulation du RDV du ${dateLabel} à ${rdv.heure_rdv} a bien été enregistrée.`,
  });

  // Update rdv
  await supabase
    .from("rdv")
    .update({ statut: "annule", motif_annulation: motif })
    .eq("id", rdv.id);

  // Audit
  await logRdvEvent({
    rdv_id: rdv.id,
    auteur_id: annulePar,
    auteur_type: annuleParType,
    action: "annulation",
    ancien_statut: rdv.statut,
    nouveau_statut: "annule",
    motif,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION — RDV reporté (citoyen ou institution)
// Avec motif obligatoire
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierReport(
  rdv: RdvComplet,
  reportePar: string,
  reporteParType: "citoyen" | "institution",
  motif: string,
  nouvelleDateRdv: string,
  nouvelleHeureRdv: string
): Promise<void> {
  const instName = rdv.institution?.name ?? "l'institution";
  const ancienneDateLabel = formatDateFR(rdv.date_rdv);
  const nouvelleDateLabel = formatDateFR(nouvelleDateRdv);
  const auteurLabel = reporteParType === "citoyen" ? nomCitoyen(rdv) : instName;

  const destinataireId =
    reporteParType === "citoyen" ? rdv.institution_id : rdv.citoyen_id;
  const destinataireType =
    reporteParType === "citoyen" ? "institution" : "citoyen";

  // → L'autre partie
  await envoyerNotification({
    destinataire_id: destinataireId,
    destinataire_type: destinataireType,
    rdv_id: rdv.id,
    type: "rdv_reporte",
    titre: "🔄 RDV reporté",
    message: `${auteurLabel} a reporté le RDV du ${ancienneDateLabel} au ${nouvelleDateLabel} à ${nouvelleHeureRdv}. Motif : ${motif}`,
  });

  // → L'auteur (confirmation)
  await envoyerNotification({
    destinataire_id: reportePar,
    destinataire_type: reporteParType,
    rdv_id: rdv.id,
    type: "rdv_reporte",
    titre: "🔄 Report confirmé",
    message: `Votre RDV a été reporté au ${nouvelleDateLabel} à ${nouvelleHeureRdv}.`,
  });

  // Update rdv
  await supabase
    .from("rdv")
    .update({
      date_rdv: nouvelleDateRdv,
      heure_rdv: nouvelleHeureRdv,
      statut: "en_attente",
      motif_report: motif,
    })
    .eq("id", rdv.id);

  // Audit
  await logRdvEvent({
    rdv_id: rdv.id,
    auteur_id: reportePar,
    auteur_type: reporteParType,
    action: "report",
    ancien_statut: rdv.statut,
    nouveau_statut: "en_attente",
    motif,
    metadata: {
      ancienne_date: rdv.date_rdv,
      ancienne_heure: rdv.heure_rdv,
      nouvelle_date: nouvelleDateRdv,
      nouvelle_heure: nouvelleHeureRdv,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION — RDV dépassé (+10min après heure de fin)
// Déclenchement : dashboard institution au chargement
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifierRdvDepasse(rdv: RdvComplet): Promise<void> {
  const instName = rdv.institution?.name ?? "l'institution";
  const dateLabel = formatDateFR(rdv.date_rdv);

  // → Institution : action requise
  await envoyerNotification({
    destinataire_id: rdv.institution_id,
    destinataire_type: "institution",
    rdv_id: rdv.id,
    type: "rdv_depasse",
    titre: "⚠️ RDV dépassé — Action requise",
    message: `Le RDV de ${nomCitoyen(rdv)} du ${dateLabel} à ${rdv.heure_rdv} a dépassé son délai. Veuillez le marquer comme terminé, absent ou signaler un problème.`,
  });

  // → Citoyen : information
  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdv.id,
    type: "rdv_depasse",
    titre: "⚠️ RDV en attente de clôture",
    message: `Votre RDV chez ${instName} du ${dateLabel} est en attente de confirmation de fin par l'établissement.`,
  });

  // Marquer depasse_notifie pour ne pas renvoyer
  await supabase
    .from("rdv")
    .update({ depasse_notifie: true })
    .eq("id", rdv.id);

  // Audit
  await logRdvEvent({
    rdv_id: rdv.id,
    auteur_id: "system",
    auteur_type: "system",
    action: "depasse",
    ancien_statut: rdv.statut,
    nouveau_statut: rdv.statut,
    metadata: { heure_rdv: rdv.heure_rdv, date_rdv: rdv.date_rdv },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION AUTOMATIQUE — RDVs dépassés
// À appeler au chargement du dashboard institution
// Vérifie tous les RDV confirmés dont l'heure est dépassée de +10min
// ═══════════════════════════════════════════════════════════════════════════════

export async function verifierRdvsDepasses(institutionId: string): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Récupérer RDVs confirmés d'aujourd'hui non encore notifiés
  const { data: rdvsAujourdhui } = await supabase
    .from("rdv")
    .select(`
      id, date_rdv, heure_rdv, statut, citoyen_id, institution_id,
      depasse_notifie, objet, motif_annulation, motif_report,
      institution:institutions!rdv_institution_id_fkey(name),
      citoyen:users!rdv_citoyen_id_fkey(prenom, nom, phone)
    `)
    .eq("institution_id", institutionId)
    .eq("statut", "confirme")
    .eq("depasse_notifie", false)
    .eq("date_rdv", todayStr);

  if (!rdvsAujourdhui) return;

  for (const rdv of rdvsAujourdhui) {
    const [hh, mm] = rdv.heure_rdv.split(":").map(Number);

    // Durée estimée : 30min par défaut (ou calculée via disponibilites)
    const heureFinEstimee = new Date(rdv.date_rdv);
    heureFinEstimee.setHours(hh, mm + 30, 0, 0); // +30min par défaut

    const depasseSeuil = new Date(heureFinEstimee.getTime() + 10 * 60 * 1000); // +10min

    if (now >= depasseSeuil) {
      await notifierRdvDepasse(rdv as RdvComplet);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION AUTOMATIQUE — Rappels 24h et 30min
// À appeler au chargement du dashboard ou via cron
// ═══════════════════════════════════════════════════════════════════════════════

export async function verifierRappels(userId: string, userType: "citoyen" | "institution"): Promise<void> {
  const now = new Date();
  const demainStr = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const filter = userType === "citoyen"
    ? { citoyen_id: userId }
    : { institution_id: userId };

  const { data: rdvs } = await supabase
    .from("rdv")
    .select(`
      id, date_rdv, heure_rdv, statut, citoyen_id, institution_id, objet,
      institution:institutions!rdv_institution_id_fkey(name),
      citoyen:users!rdv_citoyen_id_fkey(prenom, nom, phone)
    `)
    .eq(userType === "citoyen" ? "citoyen_id" : "institution_id", userId)
    .eq("statut", "confirme")
    .in("date_rdv", [demainStr, now.toISOString().split("T")[0]]);

  if (!rdvs) return;

  for (const rdv of rdvs) {
    const [hh, mm] = rdv.heure_rdv.split(":").map(Number);
    const heureRdv = new Date(rdv.date_rdv);
    heureRdv.setHours(hh, mm, 0, 0);

    const diffMs = heureRdv.getTime() - now.getTime();
    const diffMin = diffMs / 60000;

    // Vérifier si notif déjà envoyée
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("type")
      .eq("rdv_id", rdv.id)
      .eq("destinataire_id", userId);

    const typesEnvoyes = new Set(existingNotifs?.map(n => n.type) ?? []);

    // Rappel 24h : entre 23h et 25h avant
    if (diffMin >= 23 * 60 && diffMin <= 25 * 60 && !typesEnvoyes.has("rappel_24h")) {
      await notifierRappel24h(rdv as RdvComplet);
    }

    // Rappel 30min : entre 28min et 32min avant
    if (diffMin >= 28 && diffMin <= 32 && !typesEnvoyes.has("rappel_30min")) {
      await notifierRappel30min(rdv as RdvComplet);
    }

    // Heure exacte : entre -2min et +2min
    if (diffMin >= -2 && diffMin <= 2 && !typesEnvoyes.has("heure_rdv")) {
      await notifierHeureRdv(rdv as RdvComplet);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION — RDV peut être terminé ?
// Règle : ne peut être terminé qu'après l'heure de début du RDV
// ═══════════════════════════════════════════════════════════════════════════════

export function peutTerminerRdv(rdv: { date_rdv: string; heure_rdv: string }): boolean {
  const now = new Date();
  const [hh, mm] = rdv.heure_rdv.split(":").map(Number);
  const heureDebut = new Date(rdv.date_rdv);
  heureDebut.setHours(hh, mm, 0, 0);
  return now >= heureDebut;
}

export function minutesAvantFin(rdv: { date_rdv: string; heure_rdv: string }, dureeMins = 30): number {
  const now = new Date();
  const [hh, mm] = rdv.heure_rdv.split(":").map(Number);
  const heureFin = new Date(rdv.date_rdv);
  heureFin.setHours(hh, mm + dureeMins, 0, 0);
  return Math.floor((heureFin.getTime() - now.getTime()) / 60000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FETCH NOTIFICATIONS — Pour NotificationBell et dashboards
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchNotifications(destinataireId: string, limit = 20) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("destinataire_id", destinataireId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

export async function marquerNotifsLues(destinataireId: string, rdvId?: string): Promise<void> {
  let query = supabase
    .from("notifications")
    .update({ lu: true })
    .eq("destinataire_id", destinataireId)
    .eq("lu", false);

  if (rdvId) query = query.eq("rdv_id", rdvId);
  await query;
}

export async function countNotifsNonLues(destinataireId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("destinataire_id", destinataireId)
    .eq("lu", false);
  return count ?? 0;
}