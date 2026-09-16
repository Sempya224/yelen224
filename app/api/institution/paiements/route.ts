import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre, estReauthRecente } from "@/lib/institutionAuth";
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

// Lot 1 (refonte "Payment Operations Center", décision CEO 05/08/2026).
// Toutes les métriques ci-dessous sont réellement calculées, jamais
// inventées — les définitions retenues sont documentées car le brief ne
// les précisait pas au niveau requête SQL :
// - "Aujourd'hui" (bandeau) = opérationnel : ce qui s'est PASSÉ aujourd'hui
//   (traite_le) + ce qui reste À TRAITER aujourd'hui (date_rdv = aujourd'hui,
//   statut en_attente).
// - Les 4 cartes KPI reprennent les mêmes flux "aujourd'hui" que le bandeau,
//   comparés au même jour il y a 7 jours (traite_le), SAUF "Montant en
//   attente" : c'est un solde courant (tous les paiements en_attente, toute
//   date confondue), pas un flux d'une journée — comparer un solde
//   d'aujourd'hui à un solde d'il y a 7 jours nécessiterait un instantané
//   historique qui n'existe pas ; cette carte n'affiche donc jamais de
//   variation plutôt que d'en inventer une.
// - "Anomalie" = paiement confirmé aujourd'hui dont le reçu n'a pas encore
//   de PDF disponible (recus.statut != 'disponible') — un signal
//   opérationnel réel (c'est exactement ce que l'incident iconv-lite aurait
//   fait apparaître), pas un concept de litige (qui n'existe pas en base).
function rangeJour(offsetJours: number): { debut: string; fin: string; dateStr: string } {
  const d = new Date();
  d.setDate(d.getDate() - offsetJours);
  const debut = new Date(d); debut.setHours(0, 0, 0, 0);
  const fin = new Date(d); fin.setHours(23, 59, 59, 999);
  return { debut: debut.toISOString(), fin: fin.toISOString(), dateStr: d.toISOString().slice(0, 10) };
}

// null => aucune comparaison affichable (jamais de "+Infinity%" quand la
// période précédente est à zéro).
function variationPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

function sommeMontant(rows: { montant_paye: number | null }[] | null): number {
  return (rows ?? []).reduce((s, r) => s + (r.montant_paye ?? 0), 0);
}

async function chargerStats(institutionId: string) {
  const aujourdhui = rangeJour(0);
  const semaineDerniere = rangeJour(7);

  const [
    { data: confirmesAuj }, { data: confirmesSem },
    { data: rembourseAuj }, { data: rembourseSem },
    { data: recusAuj }, { data: recusSem },
    { data: enAttenteAuj }, { data: enAttenteSolde },
  ] = await Promise.all([
    sb.from("paid_bookings").select("id,montant_paye").eq("institution_id", institutionId).in("statut", ["confirme", "termine"]).gte("traite_le", aujourdhui.debut).lte("traite_le", aujourdhui.fin),
    sb.from("paid_bookings").select("id,montant_paye").eq("institution_id", institutionId).in("statut", ["confirme", "termine"]).gte("traite_le", semaineDerniere.debut).lte("traite_le", semaineDerniere.fin),
    sb.from("paid_bookings").select("id,montant_paye").eq("institution_id", institutionId).eq("statut", "rembourse").gte("traite_le", aujourdhui.debut).lte("traite_le", aujourdhui.fin),
    sb.from("paid_bookings").select("id,montant_paye").eq("institution_id", institutionId).eq("statut", "rembourse").gte("traite_le", semaineDerniere.debut).lte("traite_le", semaineDerniere.fin),
    sb.from("recus").select("id").eq("institution_id", institutionId).eq("statut", "disponible").gte("disponible_le", aujourdhui.debut).lte("disponible_le", aujourdhui.fin),
    sb.from("recus").select("id").eq("institution_id", institutionId).eq("statut", "disponible").gte("disponible_le", semaineDerniere.debut).lte("disponible_le", semaineDerniere.fin),
    sb.from("paid_bookings").select("id").eq("institution_id", institutionId).eq("statut", "en_attente").eq("date_rdv", aujourdhui.dateStr),
    sb.from("paid_bookings").select("id,montant_paye,paid_services(prix)").eq("institution_id", institutionId).eq("statut", "en_attente"),
  ]);

  const montantEncaisseAuj = sommeMontant(confirmesAuj);
  const montantEncaisseSem = sommeMontant(confirmesSem);
  const montantRembourseAuj = sommeMontant(rembourseAuj);
  const montantRembourseSem = sommeMontant(rembourseSem);
  type SoldeRow = { montant_paye: number | null; paid_services: { prix: number | null } | null };
  const montantEnAttenteSolde = ((enAttenteSolde ?? []) as unknown as SoldeRow[]).reduce((s, r) => s + (r.montant_paye ?? r.paid_services?.prix ?? 0), 0);

  const idsConfirmesAuj = ((confirmesAuj ?? []) as { id: string }[]).map((r) => r.id);
  let anomalies = 0;
  if (idsConfirmesAuj.length > 0) {
    const { data: recusLies } = await sb.from("recus").select("paid_booking_id").in("paid_booking_id", idsConfirmesAuj).eq("statut", "disponible");
    const avecRecu = new Set((recusLies ?? []).map((r) => r.paid_booking_id));
    anomalies = idsConfirmesAuj.filter((id: string) => !avecRecu.has(id)).length;
  }

  return {
    aujourdhui: {
      nbPaiements: (confirmesAuj ?? []).length,
      montantEncaisse: montantEncaisseAuj,
      nbEnAttente: (enAttenteAuj ?? []).length,
      anomalies,
    },
    montantEncaisse: { valeur: montantEncaisseAuj, variationPct: variationPct(montantEncaisseAuj, montantEncaisseSem) },
    montantEnAttente: { valeur: montantEnAttenteSolde, variationPct: null },
    montantRembourse: { valeur: montantRembourseAuj, variationPct: variationPct(montantRembourseAuj, montantRembourseSem) },
    recusGeneres: { valeur: (recusAuj ?? []).length, variationPct: variationPct((recusAuj ?? []).length, (recusSem ?? []).length) },
    derniereSynchronisation: new Date().toISOString(),
  };
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
    .select("id,confirmation_code,statut,date_rdv,heure_rdv,montant_paye,montant_declare_citoyen,declare_le,traite_le,methode_paiement,created_at,citoyen_id,service_id,paid_services(nom)")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (statut) query = query.eq("statut", statut);

  const { data: raw, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type BookingRow = {
    id: string; confirmation_code: string; statut: string; date_rdv: string; heure_rdv: string;
    montant_paye: number | null; montant_declare_citoyen: number | null; declare_le: string | null; traite_le: string | null;
    methode_paiement: string | null; created_at: string; citoyen_id: string | null; service_id: string | null;
    paid_services: { nom: string | null } | null;
  };
  const rawRows = (raw ?? []) as unknown as BookingRow[];
  const cids = [...new Set(rawRows.map((b) => b.citoyen_id).filter(Boolean))];
  const uMap = new Map<string, { nom: string; phone: string; photo_url: string | null }>();
  if (cids.length > 0) {
    const { data: usersD } = await sb.from("users").select("id,nom,prenom,phone,photo_url").in("id", cids);
    (usersD ?? []).forEach(u => uMap.set(u.id, { nom: buildNom(u), phone: u.phone ?? "", photo_url: u.photo_url ?? null }));
  }

  // Reçu Yelen (Lot D/3) — jointure par paid_booking_id. recuMap garde
  // l'objet complet (pas seulement l'id "disponible") pour que la Timeline
  // mini et le badge reçu (Lot 3) distinguent généré/en attente/archivé
  // sans requête supplémentaire.
  const bookingIds = rawRows.map((b) => b.id);
  const recuMap = new Map<string, { id: string; statut: string; membre_nom: string; disponible_le: string | null }>();
  if (bookingIds.length > 0) {
    const { data: recusD } = await sb.from("recus").select("id,paid_booking_id,statut,membre_nom,disponible_le").in("paid_booking_id", bookingIds);
    (recusD ?? []).forEach(r => recuMap.set(r.paid_booking_id, { id: r.id, statut: r.statut, membre_nom: r.membre_nom, disponible_le: r.disponible_le }));
  }

  const paiements = rawRows.map((b) => {
    const recu = recuMap.get(b.id) ?? null;
    return {
      id: b.id,
      reference: b.confirmation_code,
      statut: b.statut,
      date_rdv: b.date_rdv,
      heure_rdv: b.heure_rdv,
      montant: b.montant_paye ?? 0,
      montant_declare_citoyen: b.montant_declare_citoyen,
      declare_le: b.declare_le,
      traite_le: b.traite_le,
      methode_paiement: b.methode_paiement,
      created_at: b.created_at,
      service_nom: b.paid_services?.nom ?? "Service",
      citoyen_nom: uMap.get(b.citoyen_id ?? "")?.nom ?? "Citoyen",
      citoyen_phone: uMap.get(b.citoyen_id ?? "")?.phone ?? "",
      citoyen_photo_url: uMap.get(b.citoyen_id ?? "")?.photo_url ?? null,
      recu_id: recu?.statut === "disponible" ? recu.id : null,
      recu_statut: recu?.statut ?? null,
      recu_disponible_le: recu?.disponible_le ?? null,
      agent_nom: recu?.membre_nom ?? null,
    };
  });

  const stats = await chargerStats(membre.institutionId);

  return NextResponse.json({ paiements, stats });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "paiements.rembourser", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  // Moteur de réauthentification (16/09/2026) — opération financière
  // sensible, même palier que la suppression de compte/d'un membre.
  if (!estReauthRecente(membre)) {
    return NextResponse.json({ error: "Pour votre sécurité, confirmez à nouveau votre identité pour continuer.", code: "REAUTH_REQUIRED" }, { status: 403 });
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

  // traite_le renseigné ici aussi (Lot 1, refonte "Payment Operations
  // Center") — cette route ne le faisait pas jusqu'ici, contrairement à
  // confirme/no_show/annule (paid-bookings/valider/route.ts). Sans lui,
  // impossible de savoir HONNÊTEMENT quand un remboursement a eu lieu pour
  // la carte KPI "Montant remboursé aujourd'hui / vs semaine précédente".
  const traiteLe = new Date().toISOString();
  const { error } = await sb.from("paid_bookings").update({ statut: "rembourse", traite_le: traiteLe }).eq("id", id);
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
    req,
  });

  // Le reçu associé n'a plus lieu d'être "confirmé" une fois le paiement
  // remboursé — jamais supprimé (recus_immuable interdit le DELETE),
  // seulement archivé. Même logique que "Annuler la validation"
  // (app/api/institution/paid-bookings/valider/route.ts). Insert/update
  // non-bloquant.
  const { error: recuArchiveErr } = await sb.from("recus")
    .update({ statut: "archive", archive_le: new Date().toISOString() })
    .eq("paid_booking_id", id);
  if (recuArchiveErr) console.error("[paiements PATCH] Erreur archivage reçu:", recuArchiveErr.message);

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
