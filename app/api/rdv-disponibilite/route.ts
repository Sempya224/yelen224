import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lot B (refonte wizard RDV citoyen, 16/07/2026) — route publique (aucune
// authentification requise, comme la fiche institution elle-même) qui
// renvoie uniquement des COMPTAGES agrégés par créneau, jamais l'identité
// des citoyens : les policies rdv_citoyen_own / paid_bookings_citoyen_own
// ne permettent de voir que ses propres RDV, donc un comptage tous citoyens
// confondus doit passer par service_role. Utilisée par le wizard pour
// griser les jours/créneaux complets face à institutions.capacite_par_creneau.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const institutionId = searchParams.get("institution_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  if (!institutionId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: "institution_id, date_from et date_to requis" }, { status: 400 });
  }

  const { data: inst, error: instErr } = await sb
    .from("institutions").select("capacite_par_creneau").eq("id", institutionId).maybeSingle();
  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });
  if (!inst) return NextResponse.json({ error: "Institution introuvable" }, { status: 404 });

  const counts: Record<string, number> = {};
  const tally = (rows: { date_rdv: string; heure_rdv: string }[]) => {
    for (const r of rows) {
      const key = `${r.date_rdv}|${(r.heure_rdv || "").slice(0, 5)}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  };

  const { data: rdvRows, error: rdvErr } = await sb
    .from("rdv").select("date_rdv,heure_rdv")
    .eq("institution_id", institutionId)
    .gte("date_rdv", dateFrom).lte("date_rdv", dateTo)
    .neq("statut", "annule");
  if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });
  tally(rdvRows ?? []);

  const { data: bookingRows, error: bkErr } = await sb
    .from("paid_bookings").select("date_rdv,heure_rdv")
    .eq("institution_id", institutionId)
    .gte("date_rdv", dateFrom).lte("date_rdv", dateTo)
    .neq("statut", "annule");
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });
  tally(bookingRows ?? []);

  return NextResponse.json({ capacite: inst.capacite_par_creneau, counts });
}
