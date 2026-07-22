import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Conversation institution ↔ support Yelen (table messages_yelen_institution,
// RLS activé sans policy — accès exclusivement service_role ici, auth JWT
// custom vérifiée via getAuthenticatedMembre). Une seule conversation par
// institution, jamais fermée — mirroring messages_yelen_citoyen côté
// citoyen (lib/messagerie.ts).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  if (searchParams.get("compte") === "1") {
    const { count } = await sb
      .from("messages_yelen_institution")
      .select("*", { count: "exact", head: true })
      .eq("institution_id", authInstId)
      .eq("expediteur", "yelen")
      .eq("lu", false);
    return NextResponse.json({ non_lus: count ?? 0 });
  }

  const { data, error } = await sb
    .from("messages_yelen_institution")
    .select("id,expediteur,contenu,image_url,type,lu,cree_le")
    .eq("institution_id", authInstId)
    .order("cree_le", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb
    .from("messages_yelen_institution")
    .update({ lu: true })
    .eq("institution_id", authInstId)
    .eq("expediteur", "yelen")
    .eq("lu", false);

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
  if (!contenu) return NextResponse.json({ error: "Contenu requis" }, { status: 400 });

  const { error } = await sb.from("messages_yelen_institution").insert({
    institution_id: authInstId,
    membre_id: membre.membreId,
    expediteur: "institution",
    contenu,
    type: "texte",
    lu: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
