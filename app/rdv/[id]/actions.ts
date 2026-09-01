"use server";

import { createClient } from "@supabase/supabase-js";
import { createAuthedSupabaseClient } from "@/lib/supabase";
import { notifierReservation } from "@/lib/notificationEngine";
import { generateSlotsInRange } from "@/lib/disponibilites";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Correctif sécurité (01/09/2026, revue critique express) — avant, rien
// côté serveur ne vérifiait que l'institution existe/est validée, que le
// créneau correspond à ses disponibilités réelles, ou que sa capacité
// n'était pas dépassée : seul un filtre côté UI (app/rdv/[id]/page.tsx)
// empêchait ça, jamais revérifié à l'insertion elle-même. Fenêtre de 28
// jours identique à celle du wizard (page.tsx:658,
// generateSlotsInRange(institution.disponibilites, 28)) pour ne jamais
// rejeter un créneau que l'écran a lui-même proposé. Comptage par tally
// JS (pas .eq("heure_rdv", ...) exact) — mêmes pattern et raison déjà
// éprouvés dans app/api/rdv-disponibilite/route.ts : heure_rdv peut
// revenir avec des secondes ("09:00:00") selon le type Postgres, seule la
// comparaison sur les 5 premiers caractères est fiable.
const JOURS_FENETRE_CRENEAUX = 28;

async function validerCreneauServeur(
  institutionId: string,
  dateRdv: string,
  heureRdv: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: institution, error: instErr } = await sb
    .from("institutions")
    .select("statut, disponibilites, capacite_par_creneau")
    .eq("id", institutionId)
    .maybeSingle();
  if (instErr || !institution) {
    return { ok: false, error: "Cet établissement est introuvable." };
  }
  if (institution.statut !== "validee") {
    return { ok: false, error: "Cet établissement n'est plus disponible pour la réservation." };
  }

  const heureCourte = heureRdv.slice(0, 5);
  const slots = generateSlotsInRange(institution.disponibilites, JOURS_FENETRE_CRENEAUX);
  const creneauExiste = slots.some((s) => s.dateRdv === dateRdv && s.heureRdv === heureCourte);
  if (!creneauExiste) {
    return { ok: false, error: "Ce créneau n'est plus disponible. Merci de sélectionner un autre horaire." };
  }

  const [{ data: rdvRows }, { data: bookingRows }] = await Promise.all([
    sb.from("rdv").select("heure_rdv").eq("institution_id", institutionId).eq("date_rdv", dateRdv).neq("statut", "annule"),
    sb.from("paid_bookings").select("heure_rdv").eq("institution_id", institutionId).eq("date_rdv", dateRdv).neq("statut", "annule"),
  ]);
  const capacite = Number(institution.capacite_par_creneau ?? 1);
  const dejaPris = [...(rdvRows ?? []), ...(bookingRows ?? [])]
    .filter((r) => (r.heure_rdv || "").slice(0, 5) === heureCourte).length;
  if (dejaPris >= capacite) {
    return { ok: false, error: "Ce créneau est complet. Merci de sélectionner un autre horaire." };
  }

  return { ok: true };
}

export type CreateRdvResult = { ok: true } | { ok: false; error: string };

export async function createRdv(payload: {
  citoyenId: string;
  institutionId: string;
  dateRdv: string;
  heureRdv: string;
  objet: string;
  pourAutre: boolean;
  nomAutre: string | null;
  phoneAutre: string | null;
  qrToken: string;
  champsComplementairesReponses: Record<string, string> | null;
  dureeMinutes: number | null;
  descriptionBesoin: string | null;
  provenance: string | null;
  accessToken: string;
}): Promise<CreateRdvResult> {
  const c = payload.citoyenId?.trim();
  const i = payload.institutionId?.trim();
  if (!c || !i) {
    return { ok: false, error: "Session ou établissement invalide." };
  }
  if (!payload.accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }
  const objet = payload.objet.trim();
  if (!objet) {
    return { ok: false, error: "L'objet de la visite est obligatoire." };
  }
  if (!payload.dateRdv?.trim() || !payload.heureRdv?.trim()) {
    return { ok: false, error: "Date et heure du rendez-vous requises." };
  }

  if (payload.pourAutre) {
    const n = payload.nomAutre?.trim() ?? "";
    const p = payload.phoneAutre?.trim() ?? "";
    if (!n || !p) {
      return {
        ok: false,
        error: "Nom et téléphone requis pour un rendez-vous pour autrui.",
      };
    }
  }

  const verifCreneau = await validerCreneauServeur(i, payload.dateRdv.trim(), payload.heureRdv.trim());
  if (!verifCreneau.ok) {
    return verifCreneau;
  }

  const row: Record<string, unknown> = {
    citoyen_id: c,
    institution_id: i,
    date_rdv: payload.dateRdv.trim(),
    heure_rdv: payload.heureRdv.trim(),
    objet,
    statut: "nouveau",
    pour_autre: payload.pourAutre,
    nom_autre: payload.pourAutre ? (payload.nomAutre ?? "").trim() : null,
    phone_autre: payload.pourAutre ? (payload.phoneAutre ?? "").trim() : null,
    qr_token: payload.qrToken,
    champs_complementaires_reponses: payload.champsComplementairesReponses,
    duree_minutes: payload.dureeMinutes,
    description_besoin: payload.descriptionBesoin?.trim() || null,
    provenance: payload.provenance,
  };

  const supabase = createAuthedSupabaseClient(payload.accessToken);
  const { data: inserted, error } = await supabase.from("rdv").insert(row).select("id").single();

  if (error) {
    // Message humanisé — le texte brut de l'erreur Postgres ne doit jamais
    // remonter au citoyen (retour Bryan 25/07/2026), seul le detail en
    // console sert au diagnostic.
    console.error("[rdv] insert:", error.message);
    return { ok: false, error: "Une erreur est survenue pendant la réservation. Réessayez dans un instant." };
  }

  // Chantier "Yelen Assistant" (20/07/2026), Phase 1 — insert non-bloquant :
  // une erreur ici ne doit jamais faire échouer la réservation elle-même.
  if (inserted?.id) {
    try {
      const [{ data: citoyen }, { data: institution }] = await Promise.all([
        sb.from("users").select("prenom,nom").eq("id", c).maybeSingle(),
        sb.from("institutions").select("name").eq("id", i).maybeSingle(),
      ]);
      await notifierReservation({
        rdvId: inserted.id,
        citoyenId: c,
        citoyenPrenom: citoyen?.prenom || citoyen?.nom || "Citoyen",
        institutionId: i,
        institutionNom: institution?.name ?? "l'établissement",
        dateRdv: payload.dateRdv.trim(),
        heureRdv: payload.heureRdv.trim(),
      });
    } catch (e) {
      console.error("[rdv] notification réservation:", e);
    }
  }

  return { ok: true };
}

// Chantier "Yelen Assistant" (20/07/2026), Phase 1 — flux payant :
// app/rdv/[id]/page.tsx insère directement dans `rdv`/`paid_bookings`
// depuis le navigateur (RLS INSERT citoyen le permet), mais le moteur de
// notifications est service_role — ne peut pas être appelé depuis un
// composant client. Appelée juste après l'insert côté client, revérifie
// via accessToken que l'appelant est bien le citoyen du RDV avant d'envoyer
// (jamais un rdvId de confiance aveugle).
export async function notifierReservationPayante(params: {
  rdvId: string;
  accessToken: string;
}): Promise<void> {
  const { data: { user } } = await sb.auth.getUser(params.accessToken);
  if (!user) return;

  const { data: rdv } = await sb
    .from("rdv")
    .select("id,citoyen_id,institution_id,date_rdv,heure_rdv,institutions!rdv_institution_id_fkey(name),users!rdv_citoyen_id_fkey(prenom,nom)")
    .eq("id", params.rdvId)
    .maybeSingle();
  if (!rdv || rdv.citoyen_id !== user.id) return;

  const institutionsRel = rdv.institutions as unknown as { name: string } | { name: string }[] | null;
  const usersRel = rdv.users as unknown as { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null;
  const instRow = Array.isArray(institutionsRel) ? institutionsRel[0] : institutionsRel;
  const userRow = Array.isArray(usersRel) ? usersRel[0] : usersRel;

  await notifierReservation({
    rdvId: rdv.id,
    citoyenId: rdv.citoyen_id,
    citoyenPrenom: userRow?.prenom || userRow?.nom || "Citoyen",
    institutionId: rdv.institution_id,
    institutionNom: instRow?.name ?? "l'établissement",
    dateRdv: rdv.date_rdv,
    heureRdv: rdv.heure_rdv,
  });
}