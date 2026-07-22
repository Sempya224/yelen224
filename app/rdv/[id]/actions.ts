"use server";

import { createClient } from "@supabase/supabase-js";
import { createAuthedSupabaseClient } from "@/lib/supabase";
import { notifierReservation } from "@/lib/notificationEngine";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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
  };

  const supabase = createAuthedSupabaseClient(payload.accessToken);
  const { data: inserted, error } = await supabase.from("rdv").insert(row).select("id").single();

  if (error) {
    console.error("[rdv] insert:", error.message);
    return { ok: false, error: error.message };
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