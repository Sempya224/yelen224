import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedInstitutionId } from "@/lib/institutionAuth";

// Contourne RLS via service role — feedback n'a volontairement aucune policy
// publique (voir migration 20260712000004), accès exclusivement via cette
// route (POST institution) et /api/admin/feedback (GET/PATCH admin).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPES = ["bug", "suggestion", "ux", "fonctionnalite"] as const;

export async function POST(req: NextRequest) {
  const authInstId = await getAuthenticatedInstitutionId(req);
  if (!authInstId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type;
  const message = body?.message;
  if (typeof type !== "string" || !TYPES.includes(type as (typeof TYPES)[number])) {
    return NextResponse.json({ error: "Type de feedback invalide" }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message requis" }, { status: 400 });
  }

  const { error } = await sb.from("feedback").insert({
    institution_id: authInstId,
    type,
    message: message.trim(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
