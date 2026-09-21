import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// "Publier maintenant" sur une publication planifiée (16/09/2026, décision
// Bryan) — ne rend JAMAIS la publication visible immédiatement : la
// validation Yelen reste obligatoire. Cette action fait uniquement entrer
// la publication dans la file de modération tout de suite, au lieu
// d'attendre `scheduled_at` (même transition que le job cron
// yelen-publications-planifiees, déclenchée manuellement ici).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communaute_pro.publish")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const { id } = await params;

  const { data: post } = await sb.from("posts").select("id, statut").eq("id", id).eq("institution_auteur_id", membre.institutionId).eq("auteur_type", "institution").maybeSingle();
  if (!post) return NextResponse.json({ error: "Publication introuvable pour cette institution" }, { status: 404 });
  if (post.statut !== "planifiee") return NextResponse.json({ error: "Seule une publication planifiée peut être soumise immédiatement" }, { status: 400 });

  const { error } = await sb.from("posts").update({ statut: "en_attente_validation", soumis_le: new Date().toISOString(), scheduled_at: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
