import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { accesUrgenceAdminDebloque } from "@/lib/comptableProtection";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Facturation — reçu HTML imprimable (Ctrl+P côté navigateur), pas de PDF
// serveur (décision Bryan 22/07/2026, aucune librairie PDF dans le projet).
// Numérotation séquentielle par institution : FA-{année}-{séquence}, la
// contrainte unique (institution_id, numero) en base rattrape toute
// collision de calcul concurrent (retry sur erreur 23505).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function prochainNumero(institutionId: string): Promise<string> {
  const annee = new Date().getFullYear();
  const { count } = await sb
    .from("factures")
    .select("id", { count: "exact", head: true })
    .eq("institution_id", institutionId)
    .like("numero", `FA-${annee}-%`);
  const seq = (count ?? 0) + 1;
  return `FA-${annee}-${String(seq).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "facturation") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const { data, error } = await sb
      .from("factures")
      .select("id,numero,montant_ht,taux_taxe,montant_ttc,statut,created_at,paid_booking_id,citoyen_id,paid_bookings(confirmation_code,date_rdv,heure_rdv,paid_services(nom)),users(nom,prenom,phone)")
      .eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    return NextResponse.json({ facture: data });
  }

  const { data, error } = await sb
    .from("factures")
    .select("id,numero,montant_ttc,statut,created_at,citoyen_id,users(nom,prenom)")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ factures: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "facturation.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const modeUrgence = membre.role === "admin";
  if (modeUrgence && !(await accesUrgenceAdminDebloque(membre.institutionId))) {
    return NextResponse.json({
      error: "Domaine réservé au comptable. Suspendez d'abord son compte (onglet Équipe) pour intervenir vous-même.",
      code: "COMPTABLE_ACTIF",
    }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const paidBookingId = body?.paid_booking_id;
  if (typeof paidBookingId !== "string") return NextResponse.json({ error: "paid_booking_id requis" }, { status: 400 });

  const { data: booking } = await sb
    .from("paid_bookings")
    .select("id,institution_id,citoyen_id,montant_paye,paid_services(taux_taxe)")
    .eq("id", paidBookingId).eq("institution_id", membre.institutionId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Réservation introuvable pour cette institution" }, { status: 404 });
  if (booking.montant_paye == null) return NextResponse.json({ error: "Ce paiement n'a pas de montant figé — impossible de facturer" }, { status: 400 });

  const { data: existante } = await sb.from("factures").select("id").eq("paid_booking_id", paidBookingId).maybeSingle();
  if (existante) return NextResponse.json({ error: "Une facture existe déjà pour ce paiement" }, { status: 409 });

  const tauxTaxe = (booking.paid_services as unknown as { taux_taxe: number } | null)?.taux_taxe ?? 0;
  const montantHt = booking.montant_paye;
  const montantTtc = Math.round(montantHt * (1 + tauxTaxe / 100));

  let numero = await prochainNumero(membre.institutionId);
  let data, error;
  for (let tentative = 0; tentative < 3; tentative++) {
    ({ data, error } = await sb.from("factures").insert({
      institution_id: membre.institutionId,
      numero,
      paid_booking_id: paidBookingId,
      citoyen_id: booking.citoyen_id,
      montant_ht: montantHt,
      taux_taxe: tauxTaxe,
      montant_ttc: montantTtc,
      cree_par_membre_id: membre.membreId,
    }).select("id,numero").single());
    if (!error) break;
    if ((error as { code?: string }).code === "23505") { numero = await prochainNumero(membre.institutionId); continue; }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (error || !data) return NextResponse.json({ error: "Impossible de générer un numéro de facture unique" }, { status: 500 });

  const membreNom = await getMembreNomPourJournal(membre.membreId);
  if (modeUrgence) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId, membreNom,
      action: "acces_urgence_comptable", cibleTable: "factures", cibleId: data.id,
      details: { action: "emission_facture" },
      req,
    });
  }

  return NextResponse.json({ ok: true, id: data.id, numero: data.numero });
}
