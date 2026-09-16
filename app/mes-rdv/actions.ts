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

// GAP-09-03 (audit sécurité 14-15/09/2026) — avant ce correctif,
// app/mes-rdv/page.tsx insérait directement dans `avis` depuis le
// navigateur. Confirmé par requête SQL de Bryan (15/09/2026) :
// `avis` n'a qu'UNE policy, `avis_citoyen_own`, `FOR ALL USING
// (auth.uid()=citoyen_id)`, `with_check` NULL — en Postgres, une policy
// FOR ALL sans WITH CHECK séparé réutilise USING pour valider les INSERT
// (même piège déjà documenté dans CLAUDE.md, déjà rencontré une fois sur
// `notifications`). Autrement dit : la SEULE vérification à l'insertion
// était `citoyen_id = auth.uid()` — aucune vérification que `rdv_id`
// appartient réellement à ce citoyen, que le rendez-vous est terminé, ou
// que `institution_id` correspond au vrai `rdv.institution_id` (rien
// n'empêchait techniquement d'associer un avis à une institution sans
// rapport avec le rdv_id fourni). Déjà signalé sans être corrigé par
// docs/product/YELEN_TRUST_DATA_AUDIT.md le 16/08/2026 (`avis_citoyen_own`
// marquée [NV], policy jamais confirmée à l'époque).
//
// Ce Server Action revérifie tout côté serveur avant l'insertion :
// appartenance du rdv (chargerRdvEtVerifier, déjà utilisée par
// annulerRdv/reporterRdv ci-dessus), rdv.statut==='termine',
// institution_id dérivé du rdv réel (jamais du client), et empêche un
// second avis pour le même rdv_id+citoyen_id (aucune contrainte UNIQUE
// connue en base sur ce couple, contrairement à avis_utile qui en a
// une). service_role comme le reste de ce fichier — cohérent avec
// annulerRdv/reporterRdv, la policy RLS `avis_citoyen_own` reste de
// toute façon insuffisante seule comme démontré ci-dessus.
export async function soumettreAvis(params: {
  rdvId: string;
  note: number;
  titre: string;
  commentaire: string;
  brouillon: boolean;
  accessToken: string;
}): Promise<{ ok: true; avisId: string } | { ok: false; error: string }> {
  if (!Number.isInteger(params.note) || params.note < 1 || params.note > 5) {
    return { ok: false, error: "Note invalide." };
  }

  const verif = await chargerRdvEtVerifier(params.rdvId, params.accessToken);
  if (!verif.ok) return verif;
  const rdv = verif.rdv;

  if (rdv.statut !== "termine") {
    return { ok: false, error: "Un avis ne peut être laissé que pour un rendez-vous terminé." };
  }

  const { data: avisExistant } = await sb
    .from("avis")
    .select("id")
    .eq("rdv_id", rdv.id)
    .eq("citoyen_id", rdv.citoyen_id)
    .maybeSingle();
  if (avisExistant) {
    return { ok: false, error: "Vous avez déjà soumis un avis pour ce rendez-vous." };
  }

  const { data: avisCree, error } = await sb.from("avis").insert({
    institution_id: rdv.institution_id,
    citoyen_id: rdv.citoyen_id,
    rdv_id: rdv.id,
    note: params.note,
    titre: params.titre.trim() || null,
    commentaire: params.commentaire.trim() || null,
    brouillon: params.brouillon,
  }).select("id").single();
  if (error || !avisCree) return { ok: false, error: "Une erreur est survenue pendant l'envoi de l'avis. Réessayez dans un instant." };

  // Même logique que api/citoyen/avis/notifier-publication/route.ts —
  // dupliquée ici volontairement pour ne pas faire dépendre ce Server
  // Action d'un second aller-retour HTTP côté client. Un brouillon
  // n'est pas terminé : avis_demande reste true.
  if (!params.brouillon) {
    await sb.from("rdv").update({ avis_demande: false }).eq("id", rdv.id);
    const instNom = rdv.institutions?.name ?? "l'établissement";
    const citNom = nomCitoyen(rdv.users);
    await envoyerNotification({
      destinataireId: rdv.institution_id, destinataireType: "institution", rdvId: rdv.id, type: "avis_publie",
      titre: salutation(instNom),
      message: `${citNom} a publié un avis (${params.note}/5)${params.titre.trim() ? ` — « ${params.titre.trim()} »` : ""}. Vous pouvez y répondre depuis Avis & réputation.`,
    });
  }

  return { ok: true, avisId: avisCree.id as string };
}
