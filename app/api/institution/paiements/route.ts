import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { accesUrgenceAdminDebloque } from "@/lib/comptableProtection";
import { enregistrerTransaction } from "@/lib/transactionsFinancieres";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Écran Paiements du comptable — liste complète de paid_bookings (tous
// statuts, toute période), contrairement à app/api/institution/paid-bookings/
// valider/route.ts qui ne sert que le flux "Valider un RDV" de l'agent
// (aujourd'hui, actions confirme/no_show/annule). Ici : lecture large +
// action de remboursement, domaine réservé comptable (voir
// lib/comptableProtection.ts pour l'accès d'urgence admin).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "paiements") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statut = searchParams.get("statut");

  let query = sb
    .from("paid_bookings")
    .select("id,confirmation_code,statut,date_rdv,heure_rdv,montant_paye,methode_paiement,created_at,citoyen_id,service_id,paid_services(nom)")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (statut) query = query.eq("statut", statut);

  const { data: raw, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cids = [...new Set((raw ?? []).map((b: any) => b.citoyen_id).filter(Boolean))];
  const uMap = new Map<string, { nom: string; phone: string }>();
  if (cids.length > 0) {
    const { data: usersD } = await sb.from("users").select("id,nom,prenom,phone").in("id", cids);
    (usersD ?? []).forEach(u => uMap.set(u.id, { nom: buildNom(u), phone: u.phone ?? "" }));
  }

  const paiements = (raw ?? []).map((b: any) => ({
    id: b.id,
    reference: b.confirmation_code,
    statut: b.statut,
    date_rdv: b.date_rdv,
    heure_rdv: b.heure_rdv,
    montant: b.montant_paye ?? 0,
    methode_paiement: b.methode_paiement,
    created_at: b.created_at,
    service_nom: b.paid_services?.nom ?? "Service",
    citoyen_nom: uMap.get(b.citoyen_id)?.nom ?? "Citoyen",
    citoyen_phone: uMap.get(b.citoyen_id)?.phone ?? "",
  }));

  return NextResponse.json({ paiements });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "paiements.rembourser")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const modeUrgence = membre.role === "admin";
  if (modeUrgence && !(await accesUrgenceAdminDebloque(membre.institutionId))) {
    return NextResponse.json({
      error: "Domaine réservé au comptable. Suspendez d'abord son compte (onglet Équipe) pour intervenir vous-même.",
      code: "COMPTABLE_ACTIF",
    }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const motif = typeof body?.motif === "string" ? body.motif.trim() : null;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: booking } = await sb
    .from("paid_bookings")
    .select("id,institution_id,statut,montant_paye")
    .eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Paiement introuvable pour cette institution" }, { status: 404 });
  if (booking.statut !== "confirme" && booking.statut !== "termine") {
    return NextResponse.json({ error: "Seul un paiement confirmé peut être remboursé" }, { status: 400 });
  }

  const { error } = await sb.from("paid_bookings").update({ statut: "rembourse" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const membreNom = await getMembreNomPourJournal(membre.membreId);
  await enregistrerTransaction({
    institutionId: membre.institutionId,
    paidBookingId: id,
    typeTransaction: "remboursement",
    montant: booking.montant_paye ?? 0,
    ancienneValeur: { statut: booking.statut },
    nouvelleValeur: { statut: "rembourse" },
    motif,
    membreId: membre.membreId,
    membreNom,
  });

  if (modeUrgence) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId, membreNom,
      action: "acces_urgence_comptable", cibleTable: "paid_bookings", cibleId: id,
      details: { action: "remboursement" },
      req,
    });
  }

  return NextResponse.json({ ok: true });
}
