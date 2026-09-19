import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

// Case management institution <-> citoyen (Lot 1, 08/08/2026) — distinct
// des signalements Communauté (app/api/admin/signalements/route.ts, qui
// filtre désormais type_signaleur IS NULL). Chantier arbitrage Yelen
// (15/08/2026) : Yelen devient seul juge de ces dossiers, cette route en
// est la boîte de réception admin.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "signalements.moderate");

    const { data, error } = await sb.from("signalements")
      .select("id, numero_public, motif, description, statut, priorite, escalade_niveau, type_signaleur, citoyen_id, institution_id, rdv_id, resolution_action, resolution_explication, created_at")
      .in("type_signaleur", ["institution", "citoyen"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const citoyenIds = [...new Set((data ?? []).map(s => s.citoyen_id).filter(Boolean))];
    const institutionIds = [...new Set((data ?? []).map(s => s.institution_id).filter(Boolean))];
    const [{ data: citoyens }, { data: institutions }] = await Promise.all([
      citoyenIds.length ? sb.from("users").select("id, nom, prenom, phone").in("id", citoyenIds) : Promise.resolve({ data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] }),
      institutionIds.length ? sb.from("institutions").select("id, name").in("id", institutionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const citoyenMap = new Map((citoyens ?? []).map(c => [c.id, [c.prenom, c.nom].filter(Boolean).join(" ") || c.phone || "Citoyen"]));
    const institutionMap = new Map((institutions ?? []).map(i => [i.id, i.name]));

    const signalements = (data ?? []).map(s => ({
      ...s,
      citoyen_name: citoyenMap.get(s.citoyen_id) || "Citoyen",
      institution_name: institutionMap.get(s.institution_id) || "Institution",
    }));

    return NextResponse.json(signalements);
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
