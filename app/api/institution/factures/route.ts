import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { accesUrgenceAdminDebloque } from "@/lib/comptableProtection";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Facturation clients V3 (18/09/2026) — Établissement → Client. Deux
// flux de création cohabitent : historique (depuis un paid_booking déjà
// payé, statut "emise") et nouveau (manuel, sans paiement préalable,
// "brouillon"/"envoyee" — lignes ajoutées via facture_lignes). Recherche/
// filtres faits côté client sur la liste bornée retournée ici, même
// convention que le reste du dashboard (ex. MesClientsTab.tsx).
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
  if (canAccessTab(membre.role, "facturation", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("factures")
    .select("id,numero,statut,cree_depuis,citoyen_id,created_at,date_echeance,montant_ht,taux_taxe,montant_ttc,montant_paye,users(nom,prenom,phone,email)")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type UserEmbed = { nom: string | null; prenom: string | null; phone: string | null; email: string | null };
  type Row = {
    id: string; numero: string; statut: string; cree_depuis: string; citoyen_id: string; created_at: string;
    date_echeance: string | null; montant_ht: number; taux_taxe: number; montant_ttc: number; montant_paye: number;
    users: UserEmbed | UserEmbed[] | null;
  };
  const factures = ((data ?? []) as Row[]).map(f => {
    const u = Array.isArray(f.users) ? f.users[0] ?? null : f.users;
    return {
    id: f.id, numero: f.numero, statut: f.statut, creeDepuis: f.cree_depuis, citoyenId: f.citoyen_id,
    citoyenNom: [u?.prenom, u?.nom].filter(Boolean).join(" ").trim() || u?.phone || "Client",
    citoyenPhone: u?.phone ?? null, citoyenEmail: u?.email ?? null,
    dateEmission: f.created_at, dateEcheance: f.date_echeance, montantHt: f.montant_ht, tauxTaxe: f.taux_taxe,
    montantTtc: f.montant_ttc, montantPaye: f.montant_paye, createdAt: f.created_at,
    };
  });
  return NextResponse.json({ factures });
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
  const membreNom = await getMembreNomPourJournal(membre.membreId);

  // ── Flux historique : générer un reçu depuis un paid_booking déjà payé ──
  if (typeof body?.paid_booking_id === "string") {
    const paidBookingId = body.paid_booking_id as string;
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
        institution_id: membre.institutionId, numero, paid_booking_id: paidBookingId, citoyen_id: booking.citoyen_id,
        montant_ht: montantHt, taux_taxe: tauxTaxe, montant_ttc: montantTtc, montant_paye: montantTtc,
        statut: "emise", cree_depuis: "paid_booking", cree_par_membre_id: membre.membreId,
      }).select("id,numero").single());
      if (!error) break;
      if ((error as { code?: string }).code === "23505") { numero = await prochainNumero(membre.institutionId); continue; }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error || !data) return NextResponse.json({ error: "Impossible de générer un numéro de facture unique" }, { status: 500 });

    if (modeUrgence) {
      await enregistrerAction({ institutionId: membre.institutionId, membreId: membre.membreId, membreNom, action: "acces_urgence_comptable", cibleTable: "factures", cibleId: data.id, details: { action: "emission_facture" }, req });
    }
    await sb.from("facture_evenements").insert({ facture_id: data.id, type_evenement: "creee", membre_id: membre.membreId, details: { source: "paid_booking" } });
    return NextResponse.json({ ok: true, id: data.id, numero: data.numero });
  }

  // ── Nouveau flux manuel : facturer un client avant tout paiement ──
  const citoyenId = body?.citoyen_id;
  const lignes = body?.lignes;
  const dateEcheance = body?.date_echeance ?? null;
  const envoyer = body?.envoyer === true; // false = enregistrer comme brouillon
  if (typeof citoyenId !== "string" || !Array.isArray(lignes) || lignes.length === 0) {
    return NextResponse.json({ error: "citoyen_id et au moins une ligne sont requis" }, { status: 400 });
  }
  type LigneEntree = { description?: unknown; quantite?: unknown; prix_unitaire?: unknown; remise?: unknown };
  const lignesValidees = (lignes as LigneEntree[]).map(l => {
    const description = typeof l.description === "string" ? l.description.trim() : "";
    const quantite = typeof l.quantite === "number" && l.quantite > 0 ? l.quantite : 1;
    const prixUnitaire = typeof l.prix_unitaire === "number" && l.prix_unitaire >= 0 ? l.prix_unitaire : null;
    const remise = typeof l.remise === "number" && l.remise >= 0 ? l.remise : 0;
    return { description, quantite, prixUnitaire, remise };
  });
  if (lignesValidees.some(l => !l.description || l.prixUnitaire === null)) {
    return NextResponse.json({ error: "Chaque ligne doit avoir une description et un prix valides" }, { status: 400 });
  }
  const { data: citoyen } = await sb.from("users").select("id").eq("id", citoyenId).maybeSingle();
  if (!citoyen) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const montantTtc = lignesValidees.reduce((s, l) => s + (l.quantite * (l.prixUnitaire as number) - l.remise), 0);
  let numero = await prochainNumero(membre.institutionId);
  let factureData, factureError;
  for (let tentative = 0; tentative < 3; tentative++) {
    ({ data: factureData, error: factureError } = await sb.from("factures").insert({
      institution_id: membre.institutionId, numero, citoyen_id: citoyenId,
      montant_ht: montantTtc, taux_taxe: 0, montant_ttc: montantTtc, montant_paye: 0,
      statut: envoyer ? "envoyee" : "brouillon", cree_depuis: "manuelle", date_echeance: dateEcheance,
      cree_par_membre_id: membre.membreId,
    }).select("id,numero").single());
    if (!factureError) break;
    if ((factureError as { code?: string }).code === "23505") { numero = await prochainNumero(membre.institutionId); continue; }
    return NextResponse.json({ error: factureError.message }, { status: 500 });
  }
  if (factureError || !factureData) return NextResponse.json({ error: "Impossible de générer un numéro de facture unique" }, { status: 500 });

  const { error: lignesError } = await sb.from("facture_lignes").insert(
    lignesValidees.map((l, i) => ({
      facture_id: factureData!.id, description: l.description, quantite: l.quantite, prix_unitaire: l.prixUnitaire,
      remise: l.remise, montant_total: l.quantite * (l.prixUnitaire as number) - l.remise, ordre: i,
    }))
  );
  if (lignesError) return NextResponse.json({ error: lignesError.message }, { status: 500 });

  await sb.from("facture_evenements").insert([
    { facture_id: factureData.id, type_evenement: "creee", membre_id: membre.membreId },
    ...(envoyer ? [{ facture_id: factureData.id, type_evenement: "envoyee", membre_id: membre.membreId }] : []),
  ]);

  return NextResponse.json({ ok: true, id: factureData.id, numero: factureData.numero });
}
