import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

// File de modération "Autre activité" (spec §11) — liste des demandes,
// filtrée par statut (a_examiner par défaut, l'écran doit pouvoir aussi
// consulter l'historique traité).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "activites.manage");
    const { searchParams } = new URL(req.url);
    const statut = searchParams.get("statut") || "a_examiner";

    const { data: demandes, error } = await sb
      .from("activite_demandes")
      .select("id,institution_id,categorie_id,libelle_propose,description,statut,cree_le")
      .eq("statut", statut)
      .order("cree_le", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const institutionIds = [...new Set((demandes ?? []).map(d => d.institution_id))];
    const { data: institutions } = institutionIds.length
      ? await sb.from("institutions").select("id,name").in("id", institutionIds)
      : { data: [] as { id: string; name: string }[] };
    const nomParInstitution = new Map((institutions ?? []).map(i => [i.id, i.name]));

    return NextResponse.json((demandes ?? []).map(d => ({ ...d, institution_name: nomParInstitution.get(d.institution_id) ?? null })));
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
