import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Abonnement push institution — service_role obligatoire (RLS ne peut
// jamais couvrir une institution, aucune session Supabase Auth).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { endpoint, p256dh, auth: authKey, userAgent } = body ?? {};
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof authKey !== "string") {
    return NextResponse.json({ error: "Abonnement invalide" }, { status: 400 });
  }

  const { error } = await sb.from("push_subscriptions").upsert({
    destinataire_id: membre.institutionId,
    destinataire_type: "institution",
    endpoint, p256dh, auth: authKey,
    user_agent: typeof userAgent === "string" ? userAgent : null,
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) return NextResponse.json({ error: "endpoint requis" }, { status: 400 });

  await sb.from("push_subscriptions").delete()
    .eq("endpoint", endpoint)
    .eq("destinataire_id", membre.institutionId)
    .eq("destinataire_type", "institution");

  return NextResponse.json({ ok: true });
}
