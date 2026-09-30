import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Chantier "Vraie réservation hôtel" (25/09/2026) — calque de
// app/api/rdv-disponibilite/route.ts, mais l'inventaire est par type de
// chambre (paid_services.nombre_unites) sur une plage [date_arrivee,
// date_depart) plutôt qu'une capacité institution par créneau horaire.
// Retour visuel uniquement (comme l'existante) — la garantie réelle est
// l'insertion atomique de reserver_chambre_hotel (migration
// 20260925000001_reservation_chambre_hotel.sql), revérifiée à la
// confirmation.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("service_id");
  const dateArrivee = searchParams.get("date_arrivee");
  const dateDepart = searchParams.get("date_depart");
  if (!serviceId || !dateArrivee || !dateDepart) {
    return NextResponse.json({ error: "service_id, date_arrivee et date_depart requis" }, { status: 400 });
  }

  const { data: service, error: serviceErr } = await sb
    .from("paid_services")
    .select("nombre_unites, is_active, est_chambre")
    .eq("id", serviceId)
    .maybeSingle();
  if (serviceErr) return NextResponse.json({ error: serviceErr.message }, { status: 500 });
  if (!service || !service.is_active || !service.est_chambre) {
    return NextResponse.json({ error: "Chambre introuvable" }, { status: 404 });
  }

  const nombreUnites = service.nombre_unites ?? 1;

  // Chevauchement de plages [date_rdv, date_depart) — même logique que
  // reserver_chambre_hotel côté SQL, dupliquée ici en JS pour le retour
  // visuel (comme rdv-disponibilite/route.ts le fait déjà pour les
  // créneaux horaires classiques).
  const { data: rows, error: bkErr } = await sb
    .from("paid_bookings")
    .select("date_rdv, date_depart")
    .eq("service_id", serviceId)
    .neq("statut", "annule")
    .lt("date_rdv", dateDepart);
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });

  // COALESCE défensif identique à reserver_chambre_hotel : une ligne sans
  // date_depart (ne devrait jamais arriver pour une chambre) est traitée
  // comme une seule nuit plutôt que comme un chevauchement toujours faux.
  const lendemain = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const reservees = (rows ?? []).filter((r) => (r.date_depart ?? lendemain(r.date_rdv)) > dateArrivee).length;

  return NextResponse.json({
    nombreUnites,
    reservees,
    disponible: reservees < nombreUnites,
  });
}
