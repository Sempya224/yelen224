import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Ledger financier en lecture seule — jamais écrit directement par un
// membre, alimenté par lib/transactionsFinancieres.ts depuis les routes
// paiements/factures.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Lot 1 (refonte "journal financier Enterprise", décision CEO 06/08/2026).
// Définitions retenues (le brief ne les précisait pas au niveau requête) :
// - Entrées = encaissements du jour.
// - Sorties = remboursements + annulations du jour (tout ce qui reverse un
//   encaissement).
// - Remboursements = sous-ensemble des sorties, isolé car c'est la
//   catégorie la plus significative opérationnellement.
// - Volume total = somme absolue de TOUTES les transactions du jour, tous
//   types confondus (niveau d'activité brut).
// Toutes comparées à la même tranche horaire il y a 7 jours, jamais de
// "+Infinity%" si la semaine précédente était à zéro (voir variationPct).
function rangeJour(offsetJours: number): { debut: string; fin: string } {
  const d = new Date();
  d.setDate(d.getDate() - offsetJours);
  const debut = new Date(d); debut.setHours(0, 0, 0, 0);
  const fin = new Date(d); fin.setHours(23, 59, 59, 999);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

function variationPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

function sommeMontant(rows: { montant: number }[] | null): number {
  return (rows ?? []).reduce((s, r) => s + r.montant, 0);
}

async function chargerStats(institutionId: string) {
  const aujourdhui = rangeJour(0);
  const semaineDerniere = rangeJour(7);

  const [{ data: aujData }, { data: semData }] = await Promise.all([
    sb.from("transactions_financieres").select("type_transaction,montant").eq("institution_id", institutionId).gte("created_at", aujourdhui.debut).lte("created_at", aujourdhui.fin),
    sb.from("transactions_financieres").select("type_transaction,montant").eq("institution_id", institutionId).gte("created_at", semaineDerniere.debut).lte("created_at", semaineDerniere.fin),
  ]);

  const entreesAuj = sommeMontant((aujData ?? []).filter(t => t.type_transaction === "encaissement"));
  const entreesSem = sommeMontant((semData ?? []).filter(t => t.type_transaction === "encaissement"));
  const sortiesAuj = sommeMontant((aujData ?? []).filter(t => t.type_transaction === "remboursement" || t.type_transaction === "annulation"));
  const sortiesSem = sommeMontant((semData ?? []).filter(t => t.type_transaction === "remboursement" || t.type_transaction === "annulation"));
  const rembourseAuj = sommeMontant((aujData ?? []).filter(t => t.type_transaction === "remboursement"));
  const rembourseSem = sommeMontant((semData ?? []).filter(t => t.type_transaction === "remboursement"));
  const volumeAuj = sommeMontant(aujData);
  const volumeSem = sommeMontant(semData);

  return {
    aujourdhui: {
      nbOperations: (aujData ?? []).length,
      volume: volumeAuj,
    },
    entrees: { valeur: entreesAuj, variationPct: variationPct(entreesAuj, entreesSem) },
    sorties: { valeur: sortiesAuj, variationPct: variationPct(sortiesAuj, sortiesSem) },
    remboursements: { valeur: rembourseAuj, variationPct: variationPct(rembourseAuj, rembourseSem) },
    volumeTotal: { valeur: volumeAuj, variationPct: variationPct(volumeAuj, volumeSem) },
    derniereSynchronisation: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "transactions") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  let query = sb
    .from("transactions_financieres")
    .select("id,reference,type_transaction,montant,ancienne_valeur,nouvelle_valeur,motif,membre_nom,paid_booking_id,created_at,ip,navigateur,os")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (type) query = query.eq("type_transaction", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Citoyen + service + reçu — jointure par paid_booking_id (même
  // convention que app/api/institution/paiements/route.ts).
  const bookingIds = [...new Set((data ?? []).map(t => t.paid_booking_id).filter((id): id is string => !!id))];
  const bookingMap = new Map<string, { citoyen_nom: string; service_nom: string }>();
  const recuMap = new Map<string, string>();
  if (bookingIds.length > 0) {
    const [{ data: bookingsD }, { data: recusD }] = await Promise.all([
      sb.from("paid_bookings").select("id,citoyen_id,paid_services(nom),users!paid_bookings_citoyen_id_fkey(prenom,nom,phone)").in("id", bookingIds),
      sb.from("recus").select("id,paid_booking_id").in("paid_booking_id", bookingIds).eq("statut", "disponible"),
    ]);
    type BookingRow = { id: string; paid_services: { nom: string | null } | null; users: { prenom: string | null; nom: string | null; phone: string | null } | null };
    ((bookingsD ?? []) as unknown as BookingRow[]).forEach((b) => {
      const u = b.users;
      const nomCitoyen = u ? ([u.prenom, u.nom].filter(Boolean).join(" ") || u.phone || "Citoyen") : "Citoyen";
      bookingMap.set(b.id, { citoyen_nom: nomCitoyen, service_nom: b.paid_services?.nom ?? "Service" });
    });
    (recusD ?? []).forEach(r => recuMap.set(r.paid_booking_id, r.id));
  }

  const transactions = (data ?? []).map(t => ({
    id: t.id,
    reference: t.reference,
    type_transaction: t.type_transaction,
    montant: t.montant,
    motif: t.motif,
    ancienne_valeur: t.ancienne_valeur,
    nouvelle_valeur: t.nouvelle_valeur,
    membre_nom: t.membre_nom,
    paid_booking_id: t.paid_booking_id,
    citoyen_nom: t.paid_booking_id ? (bookingMap.get(t.paid_booking_id)?.citoyen_nom ?? null) : null,
    service_nom: t.paid_booking_id ? (bookingMap.get(t.paid_booking_id)?.service_nom ?? null) : null,
    recu_id: t.paid_booking_id ? (recuMap.get(t.paid_booking_id) ?? null) : null,
    ip: t.ip,
    navigateur: t.navigateur,
    os: t.os,
    created_at: t.created_at,
  }));

  const stats = await chargerStats(membre.institutionId);
  // Anomalies réelles : encaissements du jour sans reçu disponible (même
  // définition que Paiements — un signal opérationnel réel, pas un
  // concept inventé).
  const encaissementsAujIds = transactions
    .filter(t => t.type_transaction === "encaissement" && new Date(t.created_at).toDateString() === new Date().toDateString())
    .map(t => t.paid_booking_id)
    .filter((id): id is string => !!id);
  const anomalies = encaissementsAujIds.filter(id => !recuMap.has(id)).length;

  return NextResponse.json({ transactions, stats: { ...stats, aujourdhui: { ...stats.aujourdhui, anomalies } } });
}
