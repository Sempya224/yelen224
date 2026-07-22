import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedInstitutionId } from "@/lib/institutionAuth";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const institution_id = searchParams.get("institution_id");
  const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
  if (!institution_id) return NextResponse.json({ error: "institution_id requis" }, { status: 400 });

  const authInstId = await getAuthenticatedInstitutionId(req);
  if (!authInstId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (authInstId !== institution_id) return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  const { data } = await sb.from("rdv")
    .select("id,heure_rdv,statut,objet,citoyen_id,presence_status")
    .eq("institution_id", institution_id)
    .eq("date_rdv", date)
    .order("heure_rdv", { ascending: true });
  const rdvs = data || [];
  const ids = [...new Set(rdvs.map((r: any) => r.citoyen_id).filter(Boolean))];
  let noms: Record<string, string> = {};
  if (ids.length) {
    const { data: users } = await sb.from("users").select("id,prenom,nom,phone").in("id", ids);
    (users || []).forEach((u: any) => { noms[u.id] = `${u.prenom || ""} ${u.nom || ""}`.trim() || u.phone || "Citoyen"; });
  }
  return NextResponse.json({ rdvs: rdvs.map((r: any) => ({ ...r, citoyen_nom: noms[r.citoyen_id] || "Citoyen" })) });
}
