import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { enregistrerTransaction } from "@/lib/transactionsFinancieres";
import { creneauEstOuvert, RDV_HORS_CRENEAU_MESSAGE } from "@/lib/rdvGating";

// Lot B (refonte cycle de vie RDV, décision CEO 16/07/2026) — remplace les
// writes directs cassés de ValiderRdvTab.tsx (paid_bookings/rdv n'ont que des
// policies citoyen, auth.uid()=citoyen_id ; une session institution n'a pas
// de session Supabase Auth, ces .update() échouaient silencieusement ou en
// erreur RLS). Corrige aussi un bug trouvé au passage : l'ancien code écrivait
// rdv.statut = "no_show", valeur absente de l'enum statut_rdv — "absent" est
// un constat de présence (presence_status), jamais un statut de cycle de vie
// (même règle déjà appliquée au scan QR gratuit, voir rdv/statut/route.ts).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function chargerBooking(filtre: { id: string } | { code: string }, institutionId: string) {
  let query = sb
    .from("paid_bookings")
    .select(`
      id, confirmation_code, statut, date_rdv, heure_rdv, institution_id,
      paid_services(nom, prix, duree_minutes),
      users!paid_bookings_citoyen_id_fkey(prenom, nom, phone)
    `)
    .eq("institution_id", institutionId);
  query = "id" in filtre ? query.eq("id", filtre.id) : query.eq("confirmation_code", filtre.code);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  // Le bénéficiaire "pour un tiers" vit sur la ligne rdv jumelle (créée en
  // même temps que la réservation payante), pas sur paid_bookings — jointe
  // par créneau, même convention que le badge "Payant" côté écran RDV.
  const { data: rdvJumeau } = await sb
    .from("rdv")
    .select("pour_autre,nom_autre,phone_autre")
    .eq("institution_id", institutionId)
    .eq("date_rdv", data.date_rdv)
    .eq("heure_rdv", data.heure_rdv)
    .maybeSingle();

  const svc = data.paid_services as any;
  const u = data.users as any;
  return {
    id: data.id,
    confirmation_code: data.confirmation_code,
    statut: data.statut,
    date_rdv: data.date_rdv,
    heure_rdv: data.heure_rdv,
    pour_autre: !!rdvJumeau?.pour_autre,
    nom_autre: rdvJumeau?.nom_autre ?? null,
    phone_autre: rdvJumeau?.phone_autre ?? null,
    service_nom: svc?.nom ?? "Service",
    service_prix: svc?.prix ?? 0,
    service_duree: svc?.duree_minutes ?? 0,
    citoyen_prenom: u?.prenom ?? null,
    citoyen_nom: u?.nom ?? null,
    citoyen_phone: u?.phone ?? null,
  };
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "valider-rdv") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  if (searchParams.get("history") === "1") {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb
      .from("paid_bookings")
      .select(`id, confirmation_code, statut, date_rdv, heure_rdv, paid_services(nom, prix), users!paid_bookings_citoyen_id_fkey(prenom, nom)`)
      .eq("institution_id", membre.institutionId)
      .eq("date_rdv", today)
      .neq("statut", "en_attente")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const history = (data ?? []).map((row: any) => ({
      id: row.id, confirmation_code: row.confirmation_code, statut: row.statut,
      date_rdv: row.date_rdv, heure_rdv: row.heure_rdv,
      service_nom: row.paid_services?.nom ?? "Service", service_prix: row.paid_services?.prix ?? 0,
      citoyen_nom: row.users ? `${row.users.prenom ?? ""} ${row.users.nom ?? ""}`.trim() || null : null,
    }));
    return NextResponse.json({ history });
  }

  const id = searchParams.get("id");
  const code = searchParams.get("code");
  if (!id && !code) return NextResponse.json({ error: "id ou code requis" }, { status: 400 });

  const booking = await chargerBooking(id ? { id } : { code: code! }, membre.institutionId);
  if (!booking) return NextResponse.json({ error: "Aucune réservation trouvée pour cette institution." }, { status: 404 });
  return NextResponse.json({ booking });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "rdv.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const action = body?.action;
  if (typeof id !== "string" || !["confirme", "no_show", "annule"].includes(action)) {
    return NextResponse.json({ error: "id et action valides requis" }, { status: 400 });
  }

  const { data: booking } = await sb
    .from("paid_bookings").select("id,institution_id,date_rdv,heure_rdv,statut,montant_paye,service_id,paid_services(prix)")
    .eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Réservation introuvable pour cette institution" }, { status: 404 });

  // "Confirmé" = preuve de présence (paiement encaissé + présence validée en
  // une seule action ici, pas de scan séparé pour le payant) — jamais
  // atteignable hors du créneau autorisé, même via une recherche manuelle par
  // code plutôt que "Prendre en charge".
  if (action === "confirme" && !creneauEstOuvert(booking.date_rdv, booking.heure_rdv)) {
    return NextResponse.json({ error: RDV_HORS_CRENEAU_MESSAGE.message, hors_creneau: true, titre: RDV_HORS_CRENEAU_MESSAGE.titre }, { status: 403 });
  }

  // montant_paye figé à la confirmation si pas déjà fait (module financier,
  // migration 20260722000001) — c'est le seul moment où on sait avec
  // certitude que le paiement a réellement eu lieu.
  const montantAFiger = booking.montant_paye ?? (booking.paid_services as unknown as { prix: number } | null)?.prix ?? null;
  const bookingUpdate: Record<string, unknown> = { statut: action };
  if (action === "confirme" && booking.montant_paye == null && montantAFiger != null) bookingUpdate.montant_paye = montantAFiger;

  const { error: bkErr } = await sb.from("paid_bookings").update(bookingUpdate).eq("id", id);
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });

  const rdvUpdates: Record<string, unknown> =
    action === "confirme" ? { statut: "confirme", presence_status: "present", presence_confirmed_at: new Date().toISOString() }
    : action === "no_show" ? { presence_status: "absent", presence_confirmed_at: new Date().toISOString() }
    : { statut: "annule" };

  const { data: rdvJumeau } = await sb.from("rdv").update(rdvUpdates)
    .eq("institution_id", membre.institutionId).eq("date_rdv", booking.date_rdv).eq("heure_rdv", booking.heure_rdv)
    .select("id").maybeSingle();

  if (action === "confirme") {
    const membreNom = await getMembreNomPourJournal(membre.membreId);
    // cible_table: "rdv" (pas "paid_bookings") pour que cette action
    // apparaisse dans la traçabilité de l'écran Rendez-vous passés, qui ne
    // regarde que les entrées journalisées sur "rdv" (Lots A-D).
    await enregistrerAction({
      institutionId: membre.institutionId,
      membreId: membre.membreId,
      membreNom,
      action: "rdv_confirme",
      cibleTable: "rdv",
      cibleId: rdvJumeau?.id ?? id,
      req,
    });
    if (montantAFiger != null) {
      await enregistrerTransaction({
        institutionId: membre.institutionId,
        paidBookingId: id,
        typeTransaction: "encaissement",
        montant: montantAFiger,
        nouvelleValeur: { statut: "confirme" },
        membreId: membre.membreId,
        membreNom,
      });
    }
  }

  return NextResponse.json({ ok: true, statut: action });
}
