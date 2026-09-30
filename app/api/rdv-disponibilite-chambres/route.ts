import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Chantier "Séjour d'abord" (Phase B1, 25/09/2026) — calque de
// app/api/rdv-disponibilite-chambre/route.ts (singulier), mais renvoie la
// disponibilité de TOUTES les chambres actives d'une institution pour une
// plage de dates, en un seul appel — nécessaire pour l'étape "sejour"
// (dates choisies avant la chambre) plutôt qu'après avoir déjà sélectionné
// une chambre précise. Retour visuel uniquement (comme l'existante) — la
// garantie réelle reste l'insertion atomique de reserver_chambre_hotel.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const institutionId = searchParams.get("institution_id");
  const dateArrivee = searchParams.get("date_arrivee");
  const dateDepart = searchParams.get("date_depart");
  if (!institutionId || !dateArrivee || !dateDepart) {
    return NextResponse.json({ error: "institution_id, date_arrivee et date_depart requis" }, { status: 400 });
  }

  const { data: chambres, error: chambresErr } = await sb
    .from("paid_services")
    .select("id, nombre_unites")
    .eq("institution_id", institutionId)
    .eq("est_chambre", true)
    .eq("is_active", true);
  if (chambresErr) return NextResponse.json({ error: chambresErr.message }, { status: 500 });
  if (!chambres || chambres.length === 0) return NextResponse.json({ chambres: [] });

  const chambreIds = chambres.map((c) => c.id);

  // Chevauchement de plages [date_rdv, date_depart) — même logique que
  // reserver_chambre_hotel et rdv-disponibilite-chambre (singulier), une
  // seule requête groupée sur toutes les chambres plutôt qu'une par chambre.
  const { data: rows, error: bkErr } = await sb
    .from("paid_bookings")
    .select("service_id, date_rdv, date_depart")
    .in("service_id", chambreIds)
    .neq("statut", "annule")
    .lt("date_rdv", dateDepart);
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });

  const lendemain = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const reserveesParChambre = new Map<string, number>();
  for (const r of rows ?? []) {
    const chevauche = (r.date_depart ?? lendemain(r.date_rdv)) > dateArrivee;
    if (!chevauche) continue;
    reserveesParChambre.set(r.service_id, (reserveesParChambre.get(r.service_id) ?? 0) + 1);
  }

  return NextResponse.json({
    chambres: chambres.map((c) => {
      const nombreUnites = c.nombre_unites ?? 1;
      const reservees = reserveesParChambre.get(c.id) ?? 0;
      return { serviceId: c.id, nombreUnites, reservees, disponible: reservees < nombreUnites };
    }),
  });
}
