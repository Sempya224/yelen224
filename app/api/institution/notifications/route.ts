import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Centre de notifications institution — n'existait pas avant ce chantier
// (chantier "Yelen Assistant", 20/07/2026). Les institutions n'ont jamais de
// session Supabase Auth (JWT custom), donc aucune policy RLS ne peut jamais
// les autoriser à lire `notifications` directement depuis le navigateur —
// toujours via service_role, comme le reste des routes institution.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await sb
    .from("notifications")
    .select("id,type,titre,message,lu,rdv_id,created_at")
    .eq("destinataire_id", membre.institutionId)
    .eq("destinataire_type", "institution")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const notifId = typeof body?.notif_id === "string" ? body.notif_id : null;

  let query = sb.from("notifications").update({ lu: true })
    .eq("destinataire_id", membre.institutionId)
    .eq("destinataire_type", "institution");
  if (notifId) query = query.eq("id", notifId);
  else query = query.eq("lu", false);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
