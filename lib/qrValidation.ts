import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { creneauEstOuvert, RDV_HORS_CRENEAU_MESSAGE, RDV_QR_EXPIRE_DEFINITIF_MESSAGE, absenceDeclarable, RDV_ABSENT_TROP_TOT_MESSAGE } from "@/lib/rdvGating";
import { enregistrerAction } from "@/lib/journalActivite";
import { notifierArrivee, notifierPriseEnCharge, logRdvEvent } from "@/lib/notificationEngine";
import { chargerRestrictionActive, notifierSiEscalade } from "@/lib/rdvRestrictions";
import { accorderPoints } from "@/lib/rewardsEngine";

// Logique métier partagée par le scanner du dashboard
// (app/api/qr/validate/route.ts) et YELEN Accueil (app/api/checkin/scan|
// confirm) — un seul point de vérité pour les règles de validation d'un
// scan QR de présence (RDV gratuits uniquement, les RDV payants restent
// sur paid_bookings.confirmation_code). Toute règle changée ici s'applique
// aux deux parcours automatiquement — ne jamais la redupliquer ailleurs
// (voir CLAUDE.md /pieges-techniques-connus sur le drift de formules
// dupliquées, ex. institutions.moyenne_avis).

export type EchecValidation = { ok: false; status: number; body: Record<string, unknown> };

type CitoyenJoint = { prenom: string | null; nom: string | null; phone: string | null } | { prenom: string | null; nom: string | null; phone: string | null }[] | null;

function unRow<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export type RdvScanne = {
  id: string; date_rdv: string; heure_rdv: string; objet: string | null;
  statut: string; presence_status: string | null; institution_id: string; citoyen_id: string;
  citoyen_prenom: string | null; citoyen_nom: string | null; citoyen_phone: string | null;
};

export type ScanValide = { ok: true; rdv: RdvScanne };

// Étape 1 (scan caméra) — vérifie institution, token, statut, unicité de
// scan, expiration et créneau. Ne modifie rien en base (lecture seule) :
// la confirmation réelle passe par confirmerPresenceRdv ci-dessous.
export async function validerScanQr(
  sb: SupabaseClient,
  params: { rdvId: string; qrToken: string; institutionId: string }
): Promise<ScanValide | EchecValidation> {
  const { data: rdv, error: rdvErr } = await sb
    .from("rdv")
    .select(`
      id, date_rdv, heure_rdv, statut, presence_status,
      institution_id, citoyen_id, objet,
      qr_token, qr_expires_at, qr_regenere_le,
      users!rdv_citoyen_id_fkey (nom, prenom, phone)
    `)
    .eq("id", params.rdvId)
    .eq("institution_id", params.institutionId)
    .single();

  if (rdvErr || !rdv) return { ok: false, status: 404, body: { error: "Aucun rendez-vous trouvé. Vérifiez qu'il s'agit du bon client." } };
  if (rdv.statut === "annule") return { ok: false, status: 400, body: { error: "Ce rendez-vous a été annulé." } };
  if (rdv.presence_status === "present") return { ok: false, status: 400, body: { error: "La présence de ce client a déjà été confirmée." } };
  if (rdv.qr_token !== params.qrToken) return { ok: false, status: 401, body: { error: "Ce QR code n'est pas valide. Redemandez au client de l'ouvrir depuis Mon QR Code." } };

  if (rdv.qr_expires_at && new Date() > new Date(rdv.qr_expires_at)) {
    if (rdv.qr_regenere_le) {
      return { ok: false, status: 410, body: { error: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.message, titre: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.titre, expire_definitif: true } };
    }
    return {
      ok: false, status: 401,
      body: { error: "Ce QR a expiré. Demandez au citoyen de régénérer son code depuis l'écran \"Mon QR Code\" — une dernière génération, valable 10 minutes, reste possible." },
    };
  }

  if (!creneauEstOuvert(rdv.date_rdv, rdv.heure_rdv)) {
    return { ok: false, status: 403, body: { error: RDV_HORS_CRENEAU_MESSAGE.message, hors_creneau: true, titre: RDV_HORS_CRENEAU_MESSAGE.titre } };
  }

  const citoyen = unRow(rdv.users as unknown as CitoyenJoint);

  return {
    ok: true,
    rdv: {
      id: rdv.id, date_rdv: rdv.date_rdv, heure_rdv: rdv.heure_rdv, objet: rdv.objet,
      statut: rdv.statut, presence_status: rdv.presence_status,
      institution_id: rdv.institution_id, citoyen_id: rdv.citoyen_id,
      citoyen_prenom: citoyen?.prenom ?? null, citoyen_nom: citoyen?.nom ?? null, citoyen_phone: citoyen?.phone ?? null,
    },
  };
}

// Code manuel de secours (chantier YELEN Accueil, 13/09/2026) — résout un
// code saisi vers le (rdvId, qrToken) réel, puis le caller doit toujours
// repasser par validerScanQr ci-dessus avec ce token : un seul chemin de
// vérification (statut, unicité de scan, expiration, créneau), que
// l'entrée soit un scan caméra ou une saisie manuelle.
export async function resoudreCodeManuel(
  sb: SupabaseClient,
  params: { code: string; institutionId: string }
): Promise<{ rdvId: string; qrToken: string } | null> {
  const { data, error } = await sb
    .from("rdv")
    .select("id, qr_token, code_secours_expires_at")
    .eq("code_secours", params.code)
    .eq("institution_id", params.institutionId)
    .maybeSingle();
  if (error || !data || !data.qr_token) return null;
  if (!data.code_secours_expires_at || new Date() > new Date(data.code_secours_expires_at)) return null;
  return { rdvId: data.id, qrToken: data.qr_token };
}

export type ConfirmationReussie = {
  ok: true; action: "present" | "absent"; rdvId: string; citoyenId: string; institutionId: string;
  citoyenPrenom: string | null; citoyenNom: string | null; institutionNom: string | null;
  dateRdv: string; heureRdv: string; etaitEnAttente: boolean; statutAvant: string;
};

// Étape 2 (bouton "Confirmer"/"Absent") — revérifie créneau + expiration
// (l'état a pu changer entre le scan et le clic), puis transitionne
// presence_status/statut. N'envoie pas les effets de bord nécessitant
// l'identité de l'appelant (journal, rdv_events) : voir
// effetsBordConfirmationPresente/effetsBordConfirmationAbsente ci-dessous,
// appelées séparément par chaque consommateur. En revanche les
// conséquences côté CITOYEN de "absent" (escalade de restriction, pénalité
// Rewards) sont exécutées ICI, inconditionnellement — trou trouvé le
// 14/09/2026 : ce chemin partagé (dashboard QR scan ET YELEN Accueil, voir
// en-tête de fichier) écrivait presence_status='absent' (qui alimente le
// trigger SQL trg_citoyen_rdv_evaluer_restriction, voir
// lib/rdvRestrictions.ts) sans aucun des garde-fous déjà exigés sur
// app/api/institution/rdv/statut/route.ts (motif obligatoire, fenêtre
// minimale, notification d'escalade) — jamais aucun motif, aucune fenêtre
// minimale, aucune notification si le trigger venait de restreindre/clôturer
// le compte du citoyen. Centralisé ici plutôt que dans chaque route pour
// qu'un futur 3e appelant ne puisse pas reproduire le même trou.
export async function confirmerPresenceRdv(
  sb: SupabaseClient,
  params: { rdvId: string; action: "present" | "absent"; institutionId: string; motif?: string }
): Promise<ConfirmationReussie | EchecValidation> {
  const { data: rdv, error } = await sb
    .from("rdv")
    .select("id, institution_id, citoyen_id, date_rdv, heure_rdv, statut, qr_expires_at, qr_regenere_le, institutions!rdv_institution_id_fkey(name), users!rdv_citoyen_id_fkey(prenom,nom,phone)")
    .eq("id", params.rdvId)
    .eq("institution_id", params.institutionId)
    .single();

  if (error || !rdv) return { ok: false, status: 404, body: { error: "Aucun rendez-vous trouvé. Vérifiez qu'il s'agit du bon client." } };

  if (!creneauEstOuvert(rdv.date_rdv, rdv.heure_rdv)) {
    return { ok: false, status: 403, body: { error: RDV_HORS_CRENEAU_MESSAGE.message, hors_creneau: true, titre: RDV_HORS_CRENEAU_MESSAGE.titre } };
  }

  if (params.action === "present" && rdv.qr_expires_at && new Date() > new Date(rdv.qr_expires_at)) {
    if (rdv.qr_regenere_le) {
      return { ok: false, status: 410, body: { error: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.message, titre: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.titre, expire_definitif: true } };
    }
    return { ok: false, status: 401, body: { error: "Le QR a expiré entre le scan et la confirmation. Redemandez au citoyen de rescanner son code." } };
  }

  // Même règle que app/api/institution/rdv/statut/route.ts : une absence ne
  // peut jamais être déclarée avant l'ouverture de la fenêtre de
  // confirmation, et un motif écrit (≥5 caractères) est obligatoire —
  // décision CEO 08/09/2026, l'accountability l'exige puisque ce constat
  // peut mener jusqu'à la clôture du compte citoyen.
  if (params.action === "absent") {
    if (!absenceDeclarable(rdv.date_rdv, rdv.heure_rdv)) {
      return { ok: false, status: 403, body: { error: RDV_ABSENT_TROP_TOT_MESSAGE } };
    }
    if (!params.motif || params.motif.trim().length < 5) {
      return { ok: false, status: 400, body: { error: "Un motif (au moins 5 caractères) est requis pour marquer ce RDV absent." } };
    }
  }

  const etaitEnAttente = rdv.statut === "en_attente";
  // Capturé AVANT l'update pour pouvoir détecter, juste après, si le
  // trigger citoyen_rdv_evaluer_restriction vient d'escalader.
  const restrictionAvant = params.action === "absent" ? await chargerRestrictionActive(sb, rdv.citoyen_id) : null;

  const updates: Record<string, unknown> = { presence_status: params.action, presence_confirmed_at: new Date().toISOString() };
  if (params.action === "present" && etaitEnAttente) updates.statut = "confirme";

  const { error: updateErr } = await sb.from("rdv").update(updates).eq("id", params.rdvId);
  if (updateErr) return { ok: false, status: 500, body: { error: "La mise à jour a échoué. Réessayez." } };

  const instRow = unRow(rdv.institutions as unknown as { name: string } | { name: string }[] | null);
  const userRow = unRow(rdv.users as unknown as CitoyenJoint);

  if (params.action === "absent") {
    await notifierSiEscalade(sb, rdv.citoyen_id, restrictionAvant?.id ?? null);
    await accorderPoints({ citoyenId: rdv.citoyen_id, sourceType: "rdv", sourceId: rdv.id, eventType: "rdv_no_show" });
  }

  return {
    ok: true, action: params.action, rdvId: rdv.id, citoyenId: rdv.citoyen_id, institutionId: rdv.institution_id,
    citoyenPrenom: userRow?.prenom ?? null, citoyenNom: userRow?.nom ?? null, institutionNom: instRow?.name ?? null,
    dateRdv: rdv.date_rdv, heureRdv: rdv.heure_rdv, etaitEnAttente, statutAvant: rdv.statut,
  };
}

// Effets de bord — jamais appelés pour "absent" (hors des phases du
// chantier "Yelen Assistant", 20/07/2026). Le journal n'est écrit que si
// le RDV était réellement en_attente avant confirmation (cohérent avec la
// règle "transition depuis en_attente uniquement").
export async function effetsBordConfirmationPresente(params: {
  confirmation: ConfirmationReussie;
  membreId: string;
  membreNom: string;
  req: NextRequest;
}): Promise<void> {
  const { confirmation: c } = params;
  if (c.etaitEnAttente) {
    await enregistrerAction({
      institutionId: c.institutionId, membreId: params.membreId, membreNom: params.membreNom,
      action: "rdv_confirme", cibleTable: "rdv", cibleId: c.rdvId, req: params.req,
    });
  }
  const ctx = {
    rdvId: c.rdvId, citoyenId: c.citoyenId,
    citoyenPrenom: c.citoyenPrenom || c.citoyenNom || "Citoyen",
    institutionId: c.institutionId, institutionNom: c.institutionNom ?? "l'établissement",
    dateRdv: c.dateRdv, heureRdv: c.heureRdv,
  };
  await notifierArrivee(ctx);
  await notifierPriseEnCharge(ctx);
}

// Effets de bord "absent" nécessitant l'identité de l'appelant (rdv_events
// + journal d'activité institution) — les conséquences côté citoyen
// (escalade de restriction, pénalité Rewards) sont déjà exécutées
// inconditionnellement dans confirmerPresenceRdv ci-dessus, jamais laissées
// à la charge de chaque consommateur. Même découpage que
// effetsBordConfirmationPresente, symétrique de handleAction("no_show", …)
// côté app/api/institution/rdv/statut/route.ts.
export async function effetsBordConfirmationAbsente(params: {
  confirmation: ConfirmationReussie;
  motif: string;
  membreId: string;
  membreNom: string;
  req: NextRequest;
}): Promise<void> {
  const { confirmation: c } = params;
  await logRdvEvent({
    rdvId: c.rdvId, auteurId: params.membreId, auteurType: "institution",
    action: "absent", ancienStatut: c.statutAvant, nouveauStatut: c.statutAvant, motif: params.motif,
  });
  await enregistrerAction({
    institutionId: c.institutionId, membreId: params.membreId, membreNom: params.membreNom,
    action: "rdv_absent", cibleTable: "rdv", cibleId: c.rdvId,
    details: { statut_avant: c.statutAvant, presence_status_apres: "absent", motif: params.motif },
    ancienneValeur: { presence_status: null }, nouvelleValeur: { presence_status: "absent" },
    req: params.req,
  });
}
