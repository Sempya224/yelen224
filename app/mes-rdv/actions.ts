"use server";

// Chantier notifications "Yelen Assistant" (20/07/2026) — corrige un bug
// critique déjà en production : `rdv` n'a aucune policy RLS UPDATE pour le
// citoyen (seulement INSERT + SELECT, voir migration
// 20260720000004_rdv_paid_bookings_citoyen_policies.sql). L'ancien code
// (lib/notifications.ts::notifierAnnulation/notifierReport, appelé
// directement depuis app/mes-rdv/page.tsx via le client anonyme du
// navigateur) faisait un `supabase.from("rdv").update(...)` qui échouait
// silencieusement (RLS refuse, Postgrest ne renvoie pas d'erreur pour 0
// ligne affectée) — le citoyen voyait "Annulé avec succès" sans que rien
// ne change réellement en base. Cette Server Action utilise service_role
// (comme les routes institution) après avoir vérifié l'identité via
// accessToken — jamais un userId fourni tel quel par le client.

import { createClient } from "@supabase/supabase-js";
import { salutation } from "@/lib/salutation";
import { formatDateLongue, formatHeureCourte, envoyerNotification, logRdvEvent } from "@/lib/notificationEngine";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type ActionResult = { ok: true } | { ok: false; error: string };

type RdvVerifie = {
  id: string;
  citoyen_id: string;
  institution_id: string;
  date_rdv: string;
  heure_rdv: string;
  statut: string;
  institutions: { name: string } | null;
  users: { prenom: string | null; nom: string | null; phone: string | null } | null;
};

type VerifResult = { ok: false; error: string } | { ok: true; rdv: RdvVerifie };

async function chargerRdvEtVerifier(rdvId: string, accessToken: string): Promise<VerifResult> {
  const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
  if (authErr || !user) return { ok: false, error: "Session expirée, reconnectez-vous." };

  const { data: rdv } = await sb
    .from("rdv")
    .select("id,citoyen_id,institution_id,date_rdv,heure_rdv,statut,institutions!rdv_institution_id_fkey(name),users!rdv_citoyen_id_fkey(prenom,nom,phone)")
    .eq("id", rdvId)
    .maybeSingle();
  if (!rdv || rdv.citoyen_id !== user.id) return { ok: false, error: "Rendez-vous introuvable." };

  return { ok: true, rdv: rdv as unknown as RdvVerifie };
}

function nomCitoyen(u: { prenom: string | null; nom: string | null; phone: string | null } | null | undefined): string {
  if (!u) return "Citoyen";
  return [u.prenom, u.nom].filter(Boolean).join(" ") || u.phone || "Citoyen";
}

export async function annulerRdv(params: {
  rdvId: string;
  motif: string;
  accessToken: string;
}): Promise<ActionResult> {
  const motif = params.motif.trim();
  if (!motif) return { ok: false, error: "Le motif est obligatoire." };

  const verif = await chargerRdvEtVerifier(params.rdvId, params.accessToken);
  if (!verif.ok) return verif;
  const rdv = verif.rdv;

  const { error } = await sb.from("rdv").update({ statut: "annule", motif_annulation: motif }).eq("id", rdv.id);
  if (error) return { ok: false, error: error.message };

  const instNom = rdv.institutions?.name ?? "l'établissement";
  const citNom = nomCitoyen(rdv.users);
  const dateLabel = formatDateLongue(rdv.date_rdv);
  const heure = formatHeureCourte(rdv.heure_rdv);

  await envoyerNotification({
    destinataireId: rdv.institution_id, destinataireType: "institution", rdvId: rdv.id, type: "rdv_annule",
    titre: salutation(instNom),
    message: `Le rendez-vous de ${citNom} du ${dateLabel} à ${heure} a été annulé par le citoyen. Motif : ${motif}`,
  });
  await envoyerNotification({
    destinataireId: rdv.citoyen_id, destinataireType: "citoyen", rdvId: rdv.id, type: "rdv_annule",
    titre: salutation(rdv.users?.prenom ?? "Citoyen"),
    message: `Votre annulation du rendez-vous du ${dateLabel} à ${heure} chez ${instNom} a bien été enregistrée.`,
  });
  await logRdvEvent({
    rdvId: rdv.id, auteurId: rdv.citoyen_id, auteurType: "citoyen", action: "annulation",
    ancienStatut: rdv.statut, nouveauStatut: "annule", motif,
  });

  return { ok: true };
}

export async function reporterRdv(params: {
  rdvId: string;
  motif: string;
  nouvelleDate: string;
  nouvelleHeure: string;
  accessToken: string;
}): Promise<ActionResult> {
  const motif = params.motif.trim();
  if (!motif || !params.nouvelleDate || !params.nouvelleHeure) {
    return { ok: false, error: "Motif, date et heure sont obligatoires." };
  }

  const verif = await chargerRdvEtVerifier(params.rdvId, params.accessToken);
  if (!verif.ok) return verif;
  const rdv = verif.rdv;

  const { error } = await sb.from("rdv").update({
    date_rdv: params.nouvelleDate, heure_rdv: params.nouvelleHeure, statut: "en_attente", motif_report: motif,
  }).eq("id", rdv.id);
  if (error) return { ok: false, error: error.message };

  const instNom = rdv.institutions?.name ?? "l'établissement";
  const citNom = nomCitoyen(rdv.users);
  const nouvelleDateLabel = formatDateLongue(params.nouvelleDate);
  const nouvelleHeureLabel = formatHeureCourte(params.nouvelleHeure);

  await envoyerNotification({
    destinataireId: rdv.institution_id, destinataireType: "institution", rdvId: rdv.id, type: "rdv_reporte",
    titre: salutation(instNom),
    message: `${citNom} a reporté son rendez-vous au ${nouvelleDateLabel} à ${nouvelleHeureLabel}. Motif : ${motif}`,
  });
  await envoyerNotification({
    destinataireId: rdv.citoyen_id, destinataireType: "citoyen", rdvId: rdv.id, type: "rdv_reporte",
    titre: salutation(rdv.users?.prenom ?? "Citoyen"),
    message: `Votre rendez-vous chez ${instNom} a été reporté au ${nouvelleDateLabel} à ${nouvelleHeureLabel}.`,
  });
  await logRdvEvent({
    rdvId: rdv.id, auteurId: rdv.citoyen_id, auteurType: "citoyen", action: "report",
    ancienStatut: rdv.statut, nouveauStatut: "en_attente", motif,
    metadata: { ancienne_date: rdv.date_rdv, ancienne_heure: rdv.heure_rdv, nouvelle_date: params.nouvelleDate, nouvelle_heure: params.nouvelleHeure },
  });

  return { ok: true };
}
