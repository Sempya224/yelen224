import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { accesUrgenceAdminDebloque } from "@/lib/comptableProtection";
import { METHODES_PAIEMENT, type MethodePaiement } from "@/lib/facturationClients";

// Enregistrement manuel d'un paiement contre une facture client
// (Facturation clients V3, 18/09/2026) — jamais de "modifier le montant"
// en libre-service, uniquement l'ajout d'un paiement. Le recalcul de
// factures.montant_paye/statut est fait par trigger DB
// (recalculer_montant_paye_facture, migration 20260918000001), jamais ici
// en applicatif — source unique de vérité.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "facturation.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const modeUrgence = membre.role === "admin";
  if (modeUrgence && !(await accesUrgenceAdminDebloque(membre.institutionId))) {
    return NextResponse.json({ error: "Domaine réservé au comptable. Suspendez d'abord son compte (onglet Équipe) pour intervenir vous-même.", code: "COMPTABLE_ACTIF" }, { status: 403 });
  }

  const { data: facture } = await sb.from("factures").select("id,statut").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  if (facture.statut === "annulee" || facture.statut === "remboursee") {
    return NextResponse.json({ error: "Cette facture est annulée ou remboursée — aucun paiement ne peut y être ajouté" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const montant = body?.montant;
  const methode = body?.methode;
  if (typeof montant !== "number" || montant <= 0) return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  if (!METHODES_PAIEMENT.includes(methode)) return NextResponse.json({ error: "Méthode de paiement invalide" }, { status: 400 });
  const reference = typeof body?.reference === "string" ? body.reference.trim() || null : null;
  const note = typeof body?.note === "string" ? body.note.trim() || null : null;
  const datePaiement = typeof body?.date_paiement === "string" ? body.date_paiement : new Date().toISOString();

  const { data: paiement, error } = await sb.from("facture_paiements").insert({
    facture_id: id, montant, methode: methode as MethodePaiement, date_paiement: datePaiement,
    reference, note, enregistre_par_membre_id: membre.membreId,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("facture_evenements").insert({
    facture_id: id, type_evenement: "paiement_recu", membre_id: membre.membreId,
    details: { montant, methode },
  });

  return NextResponse.json({ ok: true, id: paiement.id });
}
