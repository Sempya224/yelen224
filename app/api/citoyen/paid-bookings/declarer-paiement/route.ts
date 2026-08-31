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

// Lot A (double confirmation paiement, décision CEO 05/08/2026) — le
// citoyen déclare avoir remis le montant à l'institution, AVANT que
// celle-ci ne confirme (Lot B, app/api/institution/paid-bookings/valider/route.ts).
// Écriture passée par une route service_role plutôt qu'une policy RLS
// UPDATE sur paid_bookings — paid_bookings n'a aujourd'hui que des
// policies INSERT/SELECT pour le citoyen (20260720000004), jamais UPDATE ;
// même leçon que le bug annuler/reporter déjà rencontré sur ce projet
// (écriture citoyen déplacée vers service_role plutôt que d'élargir RLS).
//
// Ne touche PAS paid_bookings.statut (voir migration 20260805000020) —
// uniquement declare_le/montant_declare_citoyen. montant_paye est figé ICI
// (pas à la confirmation institution comme c'était le cas jusqu'ici) pour
// que citoyen et institution valident exactement la même somme, sans
// fenêtre où le tarif du service pourrait changer entre la déclaration et
// la confirmation. Montant jamais saisi librement par le client : toujours
// dérivé du prix du service, jamais reçu du corps de la requête.
export async function POST(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const paidBookingId = body?.paid_booking_id;
    if (typeof paidBookingId !== "string") return NextResponse.json({ error: "paid_booking_id requis" }, { status: 400 });

    const { data: booking, error: bkErr } = await supabaseAdmin
      .from("paid_bookings")
      .select("id,statut,montant_paye,declare_le,paid_services(prix)")
      .eq("id", paidBookingId)
      .eq("citoyen_id", citoyenId)
      .maybeSingle();
    if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 });
    if (booking.statut !== "en_attente") {
      return NextResponse.json({ error: "Ce paiement a déjà été traité par l'institution.", code: "STATUT_INVALIDE" }, { status: 409 });
    }
    if (booking.declare_le) {
      return NextResponse.json({ error: "Vous avez déjà déclaré ce paiement.", code: "DEJA_DECLARE" }, { status: 409 });
    }

    const prixService = (booking.paid_services as unknown as { prix: number } | null)?.prix ?? null;
    const montant = booking.montant_paye ?? prixService;
    if (montant == null) return NextResponse.json({ error: "Montant du service introuvable — impossible de déclarer ce paiement." }, { status: 400 });

    const declareLe = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("paid_bookings")
      .update({
        montant_declare_citoyen: montant,
        montant_paye: montant,
        declare_le: declareLe,
      })
      .eq("id", paidBookingId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ success: true, montant, declare_le: declareLe });
  } catch (error) {
    console.error("[CITOYEN DECLARER PAIEMENT ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
