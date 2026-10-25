import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { CODES_EQUIPEMENTS_CHAMBRE } from "@/lib/hotelEquipements";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { reponseErreur, reponseErreurServeur } from "@/lib/erreursApi";
import { validerChampsService } from "@/lib/servicesValidation";

// Contourne RLS via service role — paid_services n'a qu'une policy SELECT
// anon limitée à is_active=true (migration 20260709000013, pensée pour la
// fiche publique) et paid_bookings n'a aucune policy du tout (volontairement
// verrouillée en attendant cette route, voir commentaire dans cette même
// migration). Le insert/update/delete client direct depuis ServicesTab.tsx
// échouait avec "new row violates row-level security policy", et la lecture
// (services suspendus, réservations, noms clients via `users`) était filtrée
// en silence par RLS sans erreur visible. Institution ciblée dérivée du
// cookie de session JWT, jamais d'un id fourni par le client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPTIONS_VALIDATION = { codesEquipementsValides: CODES_EQUIPEMENTS_CHAMBRE };

// Journal non bloquant (Lot 1a) : une panne du journal ne doit jamais faire
// échouer l'action métier déjà réalisée.
async function journaliser(
  req: NextRequest,
  membre: { institutionId: string; membreId: string },
  params: { action: string; cibleId: string; details?: Record<string, unknown>; ancienneValeur?: Record<string, unknown>; nouvelleValeur?: Record<string, unknown> },
): Promise<void> {
  try {
    await enregistrerAction({
      institutionId: membre.institutionId,
      membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: params.action,
      cibleTable: "paid_services",
      cibleId: params.cibleId,
      details: params.details,
      ancienneValeur: params.ancienneValeur ?? null,
      nouvelleValeur: params.nouvelleValeur ?? null,
      req,
    });
  } catch (e) {
    console.error("[services] journal:", e instanceof Error ? e.message : e);
  }
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return reponseErreur("NON_AUTHENTIFIE", "Non authentifié", 401);
  if (canAccessTab(membre.role, "services") === "none") {
    return reponseErreur("ACCES_REFUSE", "Accès non autorisé pour votre rôle", 403);
  }
  const authInstId = membre.institutionId;

  // Colonnes listées explicitement (audit sécurité 14/09/2026, finding
  // "select(*) sur surface financière exposée au dashboard institution") —
  // toute colonne future sur paid_services/paid_bookings doit être ajoutée
  // ici volontairement, jamais héritée silencieusement d'un select("*").
  const { data: services, error: svcErr } = await sb
    .from("paid_services")
    .select("id, institution_id, nom, prix, duree_minutes, description, is_active, created_at, categorie, champs_complementaires, taux_taxe, prix_promo, promo_actif, type_prestation, unite_prix, horaires, localisation, est_chambre, photos, video_url, video_duree_secondes, equipements_chambre, nombre_unites, description_courte, inclus, non_inclus, a_savoir, public_cible, capacite_max, capacite_adultes, capacite_enfants, superficie_m2")
    .eq("institution_id", authInstId).order("created_at", { ascending: false });
  if (svcErr) return reponseErreurServeur("services GET paid_services", svcErr);

  const sids = (services ?? []).map((s) => s.id);
  let bookings: Record<string, unknown>[] = [];
  if (sids.length > 0) {
    const { data: bkRaw, error: bkErr } = await sb
      .from("paid_bookings")
      .select("id, service_id, citoyen_id, institution_id, date_rdv, heure_rdv, confirmation_code, statut, created_at, champs_complementaires_reponses, montant_paye, prix_unitaire_reserve, nuits, montant_total_reserve, methode_paiement, provenance, traite_le, montant_declare_citoyen, declare_le")
      .in("service_id", sids).order("created_at", { ascending: false });
    if (bkErr) return reponseErreurServeur("services GET paid_bookings", bkErr);

    const cids = [...new Set((bkRaw ?? []).map((b) => b.citoyen_id))];
    const uMap: Record<string, { nom: string; phone: string }> = {};
    if (cids.length > 0) {
      const { data: usersData } = await sb.from("users").select("id, nom, prenom, phone").in("id", cids);
      (usersData ?? []).forEach((u) => {
        const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
        uMap[u.id] = { nom: parts || u.phone || "Citoyen", phone: u.phone || "" };
      });
    }
    bookings = (bkRaw ?? []).map((b) => ({ ...b, citoyen_nom: uMap[b.citoyen_id]?.nom ?? "Citoyen", citoyen_phone: uMap[b.citoyen_id]?.phone ?? "" }));
  }

  return NextResponse.json({ services: services ?? [], bookings });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return reponseErreur("NON_AUTHENTIFIE", "Non authentifié", 401);
  if (!can(membre.role, "services.write")) return reponseErreur("ACCES_REFUSE", "Accès non autorisé pour votre rôle", 403);
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const verif = validerChampsService(body, "creation", OPTIONS_VALIDATION);
  if (!verif.ok) return reponseErreur(verif.code, verif.message, 400);

  // prix_promo / promo_actif volontairement jamais écrits (Lot 1a : la promo
  // n'est appliquée nulle part côté citoyen) — défauts de colonne conservés.
  const { data, error } = await sb.from("paid_services").insert({
    institution_id: authInstId,
    ...verif.champs,
  }).select("*").single();
  if (error || !data) return reponseErreurServeur("services POST insert", error);

  await journaliser(req, membre, {
    action: "service_cree", cibleId: data.id,
    details: { nom: data.nom, prix: data.prix, est_chambre: data.est_chambre },
  });
  return NextResponse.json({ ok: true, service: data });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return reponseErreur("NON_AUTHENTIFIE", "Non authentifié", 401);
  if (!can(membre.role, "services.write")) return reponseErreur("ACCES_REFUSE", "Accès non autorisé pour votre rôle", 403);
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) return reponseErreur("CORPS_INVALIDE", "Identifiant du service manquant.", 400);

  // État AVANT modification : sert à l'appartenance et au journal (ancien prix).
  const { data: cible, error: cibleErr } = await sb.from("paid_services").select("id,institution_id,nom,prix,is_active").eq("id", id).maybeSingle();
  if (cibleErr) return reponseErreurServeur("services PATCH lecture cible", cibleErr);
  if (!cible || cible.institution_id !== authInstId) return reponseErreur("SERVICE_INTROUVABLE", "Service introuvable pour cette institution.", 404);

  const verif = validerChampsService(body, "modification", OPTIONS_VALIDATION);
  if (!verif.ok) return reponseErreur(verif.code, verif.message, 400);
  const updates = verif.champs;

  const { data, error } = await sb.from("paid_services").update(updates).eq("id", id).eq("institution_id", authInstId).select("*").single();
  if (error || !data) return reponseErreurServeur("services PATCH update", error);

  if (typeof updates.prix === "number" && Number(cible.prix) !== updates.prix) {
    await journaliser(req, membre, {
      action: "service_prix_modifie", cibleId: id,
      details: { nom: data.nom },
      ancienneValeur: { prix: Number(cible.prix) }, nouvelleValeur: { prix: updates.prix },
    });
  }
  if (typeof updates.is_active === "boolean" && updates.is_active !== cible.is_active) {
    await journaliser(req, membre, {
      action: updates.is_active ? "service_reactive" : "service_suspendu", cibleId: id,
      details: { nom: data.nom, prix: Number(data.prix) },
    });
  }
  return NextResponse.json({ ok: true, service: data });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return reponseErreur("NON_AUTHENTIFIE", "Non authentifié", 401);
  if (!can(membre.role, "services.write")) return reponseErreur("ACCES_REFUSE", "Accès non autorisé pour votre rôle", 403);
  const authInstId = membre.institutionId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return reponseErreur("CORPS_INVALIDE", "Identifiant du service manquant.", 400);

  const { data: cible, error: cibleErr } = await sb.from("paid_services").select("id,institution_id,nom,prix,is_active").eq("id", id).maybeSingle();
  if (cibleErr) return reponseErreurServeur("services DELETE lecture cible", cibleErr);
  if (!cible || cible.institution_id !== authInstId) return reponseErreur("SERVICE_INTROUVABLE", "Service introuvable pour cette institution.", 404);

  const { error } = await sb.from("paid_services").delete().eq("id", id).eq("institution_id", authInstId);
  if (error) {
    // 23503 = clé étrangère : des paiements/reçus liés (recus.paid_booking_id,
    // ON DELETE RESTRICT) empêchent la suppression — conflit métier, pas une panne.
    if (error.code === "23503") {
      console.error("[services DELETE] service lié à des paiements/reçus:", error.message);
      return reponseErreur("SERVICE_NON_SUPPRIMABLE", "Ce service est lié à des paiements ou à des reçus et ne peut pas être supprimé. Suspendez-le à la place.", 409);
    }
    return reponseErreurServeur("services DELETE", error);
  }

  await journaliser(req, membre, {
    action: "service_supprime", cibleId: id,
    details: { nom: cible.nom },
    ancienneValeur: { prix: Number(cible.prix), is_active: cible.is_active },
  });
  return NextResponse.json({ ok: true });
}
