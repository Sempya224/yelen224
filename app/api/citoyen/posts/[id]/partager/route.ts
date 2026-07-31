import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Compteur de partage — mirroring de app/api/offres/[id]/clic/route.ts :
// incrémente nb_partages en service_role, aucune identité requise (même
// niveau de confiance que nb_clics, jamais vérifié comme "envoyé
// réellement").
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: post } = await sb.from("posts").select("nb_partages, statut").eq("id", id).maybeSingle();
  if (!post || post.statut !== "publiee") {
    return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
  }

  const { error } = await sb.from("posts").update({ nb_partages: (post.nb_partages ?? 0) + 1 }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
