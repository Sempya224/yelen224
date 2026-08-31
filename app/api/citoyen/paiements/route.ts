import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthenticatedCitoyenId(request: NextRequest): Promise<string | null> {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) return null;
  return user.id;
}

// Lot D (reçu Yelen, décision CEO 05/08/2026) — "Mes paiements" (stub
// existant, app/compte/paiements/) : historique complet des réservations
// payantes du citoyen, avec accès au reçu quand un paiement est confirmé.
// Source paid_bookings (pas uniquement "recus") pour montrer aussi les
// paiements en attente/déclarés, cohérent avec le reste de l'écran
// "Mon QR" (app/mon-qr) où le citoyen déclare son paiement.
export async function GET(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const { data: raw, error } = await supabaseAdmin
      .from("paid_bookings")
      .select("id,confirmation_code,statut,date_rdv,heure_rdv,montant_paye,montant_declare_citoyen,declare_le,traite_le,created_at,institution_id,paid_services(nom,prix),institutions!paid_bookings_institution_id_fkey(name,logo)")
      .eq("citoyen_id", citoyenId)
      .order("date_rdv", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type BookingRow = {
      id: string; confirmation_code: string; statut: string; date_rdv: string; heure_rdv: string;
      montant_paye: number | null; montant_declare_citoyen: number | null; declare_le: string | null; traite_le: string | null; created_at: string;
      paid_services: { nom: string | null; prix: number | null } | null; institutions: { name: string | null; logo: string | null } | null;
    };
    const rawRows = (raw ?? []) as unknown as BookingRow[];
    const bookingIds = rawRows.map((b) => b.id);
    const recuMap = new Map<string, { id: string; receipt_id: string }>();
    if (bookingIds.length > 0) {
      const { data: recusD } = await supabaseAdmin.from("recus").select("id,receipt_id,paid_booking_id").in("paid_booking_id", bookingIds).eq("statut", "disponible");
      (recusD ?? []).forEach(r => recuMap.set(r.paid_booking_id, { id: r.id, receipt_id: r.receipt_id }));
    }

    const paiements = rawRows.map((b) => ({
      id: b.id,
      reference: b.confirmation_code,
      statut: b.statut,
      date_rdv: b.date_rdv,
      heure_rdv: b.heure_rdv,
      // Repli sur le prix du service (finition "Mes paiements" 24/08/2026) :
      // avant qu'une réservation soit déclarée/confirmée, ni montant_paye
      // ni montant_declare_citoyen n'existent encore — affichait "0 GNF" à
      // tort pour un paiement réellement en attente, alors que le prix du
      // service est une donnée réelle déjà disponible (jamais un montant
      // inventé, juste une meilleure priorité de lecture).
      montant: b.montant_paye ?? b.montant_declare_citoyen ?? b.paid_services?.prix ?? 0,
      montant_declare_citoyen: b.montant_declare_citoyen,
      declare_le: b.declare_le,
      traite_le: b.traite_le,
      created_at: b.created_at,
      service_nom: b.paid_services?.nom ?? "Service",
      institution_nom: b.institutions?.name ?? "Institution",
      institution_logo: b.institutions?.logo ?? null,
      recu: recuMap.get(b.id) ?? null,
    }));

    return NextResponse.json({ success: true, paiements });
  } catch (error) {
    console.error("[CITOYEN PAIEMENTS GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
