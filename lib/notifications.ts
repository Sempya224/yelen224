import { supabase } from "@/lib/supabase";

// ⚠️ Ce module utilise le client Supabase ANONYME du navigateur — sûr
// uniquement pour un citoyen qui lit/marque ses PROPRES notifications
// (RLS `notif_destinataire_own` couvre ce cas). Chantier "Yelen Assistant"
// (20/07/2026) : notifierAnnulation/notifierReport/notifierConfirmation/
// notifierRdvTermine/notifierRdvDepasse/verifierRdvsDepasses ont été
// retirés d'ici — ils inséraient des notifications pour l'INSTITUTION
// depuis ce client anonyme, ce que la seule policy RLS de `notifications`
// (destinataire_type='citoyen' uniquement) rejette silencieusement (bug
// documenté dans CLAUDE.md). Leurs équivalents vivent maintenant dans
// lib/notificationEngine.ts (service_role, serveur uniquement), appelés
// depuis des Server Actions/routes API (ex: app/mes-rdv/actions.ts pour
// annuler/reporter). Ce qui reste ici (rappels 24h/30min/heure J via
// verifierRappels) a le même défaut côté institution — à remplacer par le
// Lot C (cron planifié) du même chantier.

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
  | "avis"
  | "rappel_manuel";

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
  rdv_id?: string | null;
  type: NotifType;
  titre: string;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    destinataire_id: params.destinataire_id,
    destinataire_type: params.destinataire_type,
    rdv_id: params.rdv_id ?? null,
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
// VÉRIFICATION AUTOMATIQUE — Rappels 24h et 30min
// À appeler au chargement du dashboard ou via cron
// ═══════════════════════════════════════════════════════════════════════════════

export async function verifierRappels(userId: string, userType: "citoyen" | "institution"): Promise<void> {
  const now = new Date();
  const demainStr = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

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
      await notifierRappel24h(rdv as unknown as RdvComplet);
    }

    // Rappel 30min : entre 28min et 32min avant
    if (diffMin >= 28 && diffMin <= 32 && !typesEnvoyes.has("rappel_30min")) {
      await notifierRappel30min(rdv as unknown as RdvComplet);
    }

    // Heure exacte : entre -2min et +2min
    if (diffMin >= -2 && diffMin <= 2 && !typesEnvoyes.has("heure_rdv")) {
      await notifierHeureRdv(rdv as unknown as RdvComplet);
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
// FETCH NOTIFICATIONS — pour les écrans citoyen (ex: app/mes-rdv/page.tsx)
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