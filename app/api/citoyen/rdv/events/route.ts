import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

// rdv_events (migration 20260709000012) n'a aucune policy RLS — accès
// service_role exclusivement (voir app/api/institution/rdv/events/route.ts,
// même passerelle côté institution). Cette route est le pendant citoyen,
// pour la timeline réelle de "Détail du rendez-vous" (chantier 03/09/2026).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const rdvId = new URL(request.url).searchParams.get("rdv_id");
  if (!rdvId) return NextResponse.json({ error: "rdv_id requis" }, { status: 400 });

  const { data: rdv } = await sb.from("rdv").select("id").eq("id", rdvId).eq("citoyen_id", user.id).maybeSingle();
  if (!rdv) return NextResponse.json({ error: "RDV introuvable" }, { status: 404 });

  const { data, error } = await sb
    .from("rdv_events")
    .select("id,auteur_type,action,motif,created_at")
    .eq("rdv_id", rdvId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entrees: data ?? [] });
}
