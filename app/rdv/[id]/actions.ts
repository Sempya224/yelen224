"use server";

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createAuthedSupabaseClient } from "@/lib/supabase";
import { notifierReservation, notifierReservationChambre } from "@/lib/notificationEngine";
import { generateSlotsInRange } from "@/lib/disponibilites";
import { chargerRestrictionActive, RDV_RESTRICTION_MESSAGE_CREATION } from "@/lib/rdvRestrictions";

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

// Vérifie uniquement ce qui reste légitimement côté JS : l'institution
// existe/est validée, et le créneau correspond à ses disponibilités réelles
// (generateSlotsInRange, logique non triviale à reproduire côté SQL). La
// capacité n'est plus vérifiée ici — GAP-08-04 (audit 15/09/2026) : ce
// comptage séparé de l'insertion créait une fenêtre de course entre deux
// réservations concurrentes sur le même créneau. Le comptage + l'insertion
// sont désormais atomiques dans la fonction Postgres reserver_creneau_rdv
// (migration 20260915000001), sous un verrou consultatif par créneau.
async function validerCreneauServeur(
  institutionId: string,
  dateRdv: string,
  heureRdv: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: institution, error: instErr } = await sb
    .from("institutions")
    .select("statut, disponibilites")
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

  return { ok: true };
}

export type CreateRdvResult = { ok: true; code: string } | { ok: false; error: string };

// Code de confirmation / qr_token à 6 chiffres — généré ici (serveur),
// jamais accepté tel quel du client. Avant ce correctif (GAP-08-05, audit
// 15/09/2026), createRdv() recevait `qrToken` directement du navigateur
// (genCode() dans page.tsx, Math.random()) : un appelant direct de ce
// Server Action pouvait donc imposer n'importe quelle valeur, y compris
// prévisible ou déjà utilisée par un autre RDV. Même génération que l'OTP
// citoyen (lib/auth/otp.ts, corrigé le 14/09/2026) : crypto.randomInt,
// jamais Math.random().
function genererCodeConfirmation(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function createRdv(payload: {
  citoyenId: string;
  institutionId: string;
  dateRdv: string;
  heureRdv: string;
  objet: string;
  pourAutre: boolean;
  nomAutre: string | null;
  phoneAutre: string | null;
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

  // Restriction automatique des rendez-vous (no-show, décision CEO
  // 03/09/2026) — le vrai verrou est la policy RLS INSERT sur `rdv`
  // (voir migration 20260903000001_citoyen_rdv_restrictions.sql), cette
  // vérification amont ne sert qu'à renvoyer un message humanisé au lieu
  // de laisser remonter l'erreur Postgres brute de la policy.
  const restriction = await chargerRestrictionActive(sb, c);
  if (restriction) {
    return { ok: false, error: RDV_RESTRICTION_MESSAGE_CREATION };
  }

  const verifCreneau = await validerCreneauServeur(i, payload.dateRdv.trim(), payload.heureRdv.trim());
  if (!verifCreneau.ok) {
    return verifCreneau;
  }

  const qrToken = genererCodeConfirmation();
  const supabase = createAuthedSupabaseClient(payload.accessToken);
  const { data: nouveauId, error } = await supabase.rpc("reserver_creneau_rdv", {
    p_institution_id: i,
    p_date_rdv: payload.dateRdv.trim(),
    p_heure_rdv: payload.heureRdv.trim(),
    p_citoyen_id: c,
    p_objet: objet,
    p_pour_autre: payload.pourAutre,
    p_nom_autre: payload.pourAutre ? (payload.nomAutre ?? "").trim() : null,
    p_phone_autre: payload.pourAutre ? (payload.phoneAutre ?? "").trim() : null,
    p_qr_token: qrToken,
    p_champs_complementaires_reponses: payload.champsComplementairesReponses,
    p_duree_minutes: payload.dureeMinutes,
    p_description_besoin: payload.descriptionBesoin?.trim() || null,
    p_provenance: payload.provenance,
  });

  if (error) {
    // Message humanisé — le texte brut de l'erreur Postgres ne doit jamais
    // remonter au citoyen (retour Bryan 25/07/2026), seul le detail en
    // console sert au diagnostic. CRENEAU_COMPLET est le seul cas métier
    // attendu de reserver_creneau_rdv (migration 20260915000001) — tout le
    // reste (institution introuvable, restriction RLS, etc.) retombe sur le
    // message générique, comme avant.
    console.error("[rdv] reserver_creneau_rdv:", error.message);
    if (error.message.includes("CRENEAU_COMPLET")) {
      return { ok: false, error: "Ce créneau est complet. Merci de sélectionner un autre horaire." };
    }
    return { ok: false, error: "Une erreur est survenue pendant la réservation. Réessayez dans un instant." };
  }

  const inserted = { id: nouveauId as string };

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

  return { ok: true, code: qrToken };
}

// GAP-09-02 (audit 15/09/2026, revue critique élargie) — le flux PAYANT
// (page.tsx, service payant) insérait directement depuis le navigateur
// dans paid_bookings PUIS rdv, sans jamais passer par un équivalent de
// validerCreneauServeur()/createRdv() ci-dessus. Seules les policies RLS
// (auth.uid()=citoyen_id, migration 20260720000004) protégeaient l'appel —
// aucune vérification d'institution validée, de créneau réellement
// disponible, ou de capacité. Les deux inserts n'étaient de plus pas
// atomiques entre eux (un paid_booking pouvait rester orphelin sans rdv
// jumeau si le second insert échouait). Ce Server Action reproduit la même
// discipline que createRdv() : vérifications JS (institution/créneau) +
// insertion atomique via reserver_creneau_rdv_payant() (migration
// 20260915000001, verrou de créneau + capacité + appartenance du service +
// insertion paid_bookings/rdv en tout-ou-rien).
export async function creerReservationPayante(payload: {
  citoyenId: string;
  institutionId: string;
  serviceId: string;
  dateRdv: string;
  heureRdv: string;
  objet: string;
  pourAutre: boolean;
  nomAutre: string | null;
  phoneAutre: string | null;
  champsComplementairesReponses: Record<string, string> | null;
  dureeMinutes: number | null;
  descriptionBesoin: string | null;
  provenance: string | null;
  accessToken: string;
}): Promise<CreateRdvResult> {
  const c = payload.citoyenId?.trim();
  const i = payload.institutionId?.trim();
  const s = payload.serviceId?.trim();
  if (!c || !i || !s) {
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
      return { ok: false, error: "Nom et téléphone requis pour un rendez-vous pour autrui." };
    }
  }

  const restriction = await chargerRestrictionActive(sb, c);
  if (restriction) {
    return { ok: false, error: RDV_RESTRICTION_MESSAGE_CREATION };
  }

  const verifCreneau = await validerCreneauServeur(i, payload.dateRdv.trim(), payload.heureRdv.trim());
  if (!verifCreneau.ok) {
    return verifCreneau;
  }

  const confirmationCode = genererCodeConfirmation();
  const supabase = createAuthedSupabaseClient(payload.accessToken);
  const { data: nouveauRdvId, error } = await supabase.rpc("reserver_creneau_rdv_payant", {
    p_institution_id: i,
    p_service_id: s,
    p_date_rdv: payload.dateRdv.trim(),
    p_heure_rdv: payload.heureRdv.trim(),
    p_citoyen_id: c,
    p_confirmation_code: confirmationCode,
    p_objet: objet,
    p_pour_autre: payload.pourAutre,
    p_nom_autre: payload.pourAutre ? (payload.nomAutre ?? "").trim() : null,
    p_phone_autre: payload.pourAutre ? (payload.phoneAutre ?? "").trim() : null,
    p_champs_complementaires_reponses: payload.champsComplementairesReponses,
    p_duree_minutes: payload.dureeMinutes,
    p_description_besoin: payload.descriptionBesoin?.trim() || null,
    p_provenance: payload.provenance,
  });

  if (error) {
    console.error("[rdv] reserver_creneau_rdv_payant:", error.message);
    if (error.message.includes("CRENEAU_COMPLET")) {
      return { ok: false, error: "Ce créneau est complet. Merci de sélectionner un autre horaire." };
    }
    if (error.message.includes("SERVICE_INTROUVABLE")) {
      return { ok: false, error: "Ce service n'est plus disponible." };
    }
    return { ok: false, error: "Une erreur est survenue pendant la réservation. Réessayez dans un instant." };
  }

  const rdvId = nouveauRdvId as string;
  if (rdvId) {
    try {
      const [{ data: citoyen }, { data: institution }] = await Promise.all([
        sb.from("users").select("prenom,nom").eq("id", c).maybeSingle(),
        sb.from("institutions").select("name").eq("id", i).maybeSingle(),
      ]);
      await notifierReservation({
        rdvId,
        citoyenId: c,
        citoyenPrenom: citoyen?.prenom || citoyen?.nom || "Citoyen",
        institutionId: i,
        institutionNom: institution?.name ?? "l'établissement",
        dateRdv: payload.dateRdv.trim(),
        heureRdv: payload.heureRdv.trim(),
      });
    } catch (e) {
      console.error("[rdv] notification réservation payante:", e);
    }
  }

  return { ok: true, code: confirmationCode };
}

// ═══════════════════════════════════════════════════════════════════════
// Réservation de chambre hôtel (25/09/2026, "vraie disponibilité") — le
// wizard exige normalement un créneau (date, heure) tiré de
// institutions.disponibilites, mais DisponibilitesTab.tsx bloque
// volontairement cet écran pour tout hôtel (n'a pas de sens pour un
// séjour) : institutions.disponibilites reste donc toujours vide et
// aucune chambre n'a jamais pu être réservée. Ce Server Action est
// délibérément séparé de createRdv/creerReservationPayante ci-dessus
// (jamais une branche à l'intérieur) — même discipline que tout le
// chantier Hôtel. Inventaire réel : paid_services.nombre_unites,
// vérifié atomiquement par reserver_chambre_hotel (migration
// 20260925000001_reservation_chambre_hotel.sql) sur un chevauchement de
// plages [date_arrivee, date_depart), jamais un simple créneau horaire.
async function validerChambreServeur(
  institutionId: string,
  dateArrivee: string,
  dateDepart: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: institution, error: instErr } = await sb
    .from("institutions")
    .select("statut")
    .eq("id", institutionId)
    .maybeSingle();
  if (instErr || !institution) {
    return { ok: false, error: "Cet établissement est introuvable." };
  }
  if (institution.statut !== "validee") {
    return { ok: false, error: "Cet établissement n'est plus disponible pour la réservation." };
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const arrivee = new Date(`${dateArrivee}T00:00:00`);
  const depart = new Date(`${dateDepart}T00:00:00`);
  if (isNaN(arrivee.getTime()) || arrivee < today) {
    return { ok: false, error: "La date d'arrivée n'est plus valide." };
  }
  if (isNaN(depart.getTime()) || depart <= arrivee) {
    return { ok: false, error: "La date de départ doit être après la date d'arrivée." };
  }

  return { ok: true };
}

export async function creerReservationChambre(payload: {
  citoyenId: string;
  institutionId: string;
  serviceId: string;
  dateArrivee: string;
  dateDepart: string;
  objet: string;
  pourAutre: boolean;
  nomAutre: string | null;
  phoneAutre: string | null;
  champsComplementairesReponses: Record<string, string> | null;
  descriptionBesoin: string | null;
  provenance: string | null;
  paysDepart: string;
  villeDepart: string;
  accessToken: string;
}): Promise<CreateRdvResult> {
  const c = payload.citoyenId?.trim();
  const i = payload.institutionId?.trim();
  const s = payload.serviceId?.trim();
  if (!c || !i || !s) {
    return { ok: false, error: "Session ou établissement invalide." };
  }
  if (!payload.accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }
  const objet = payload.objet.trim();
  if (!objet) {
    return { ok: false, error: "L'objet de la réservation est obligatoire." };
  }
  const dateArrivee = payload.dateArrivee?.trim();
  const dateDepart = payload.dateDepart?.trim();
  if (!dateArrivee || !dateDepart) {
    return { ok: false, error: "Dates d'arrivée et de départ requises." };
  }
  if (payload.pourAutre) {
    const n = payload.nomAutre?.trim() ?? "";
    const p = payload.phoneAutre?.trim() ?? "";
    if (!n || !p) {
      return { ok: false, error: "Nom et téléphone requis pour une réservation pour autrui." };
    }
  }
  const paysDepart = payload.paysDepart?.trim();
  const villeDepart = payload.villeDepart?.trim();
  if (!paysDepart || !villeDepart) {
    return { ok: false, error: "Pays et ville de départ requis." };
  }

  const restriction = await chargerRestrictionActive(sb, c);
  if (restriction) {
    return { ok: false, error: RDV_RESTRICTION_MESSAGE_CREATION };
  }

  const verifDates = await validerChambreServeur(i, dateArrivee, dateDepart);
  if (!verifDates.ok) {
    return verifDates;
  }

  const confirmationCode = genererCodeConfirmation();
  const supabase = createAuthedSupabaseClient(payload.accessToken);
  const { data: nouveauRdvId, error } = await supabase.rpc("reserver_chambre_hotel", {
    p_institution_id: i,
    p_service_id: s,
    p_date_arrivee: dateArrivee,
    p_date_depart: dateDepart,
    p_citoyen_id: c,
    p_confirmation_code: confirmationCode,
    p_objet: objet,
    p_pour_autre: payload.pourAutre,
    p_nom_autre: payload.pourAutre ? (payload.nomAutre ?? "").trim() : null,
    p_phone_autre: payload.pourAutre ? (payload.phoneAutre ?? "").trim() : null,
    p_champs_complementaires_reponses: payload.champsComplementairesReponses,
    p_description_besoin: payload.descriptionBesoin?.trim() || null,
    p_provenance: payload.provenance,
    p_pays_depart: paysDepart,
    p_ville_depart: villeDepart,
  });

  if (error) {
    console.error("[rdv] reserver_chambre_hotel:", error.message);
    if (error.message.includes("CHAMBRE_COMPLETE")) {
      return { ok: false, error: "Ces dates ne sont plus disponibles pour ce type de chambre. Merci d'essayer d'autres dates." };
    }
    if (error.message.includes("SERVICE_INTROUVABLE")) {
      return { ok: false, error: "Cette chambre n'est plus disponible." };
    }
    return { ok: false, error: "Une erreur est survenue pendant la réservation. Réessayez dans un instant." };
  }

  const rdvId = nouveauRdvId as string;
  if (rdvId) {
    try {
      const [{ data: citoyen }, { data: institution }] = await Promise.all([
        sb.from("users").select("prenom,nom").eq("id", c).maybeSingle(),
        sb.from("institutions").select("name").eq("id", i).maybeSingle(),
      ]);
      await notifierReservationChambre({
        rdvId,
        citoyenId: c,
        citoyenPrenom: citoyen?.prenom || citoyen?.nom || "Citoyen",
        institutionId: i,
        institutionNom: institution?.name ?? "l'établissement",
        dateArrivee,
        dateDepart,
      });
    } catch (e) {
      console.error("[rdv] notification réservation chambre:", e);
    }
  }

  return { ok: true, code: confirmationCode };
}