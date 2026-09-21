import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Yelen Community — suppression/annulation d'une publication institution
// (16/09/2026, brief CEO). Une seule route de suppression pour "Annuler la
// soumission" (en_attente_validation), "Annuler la programmation"
// (planifiee) et "Supprimer" (publiee/refusee) — aucun état "brouillon"
// n'existe pour absorber une annulation, donc les 3 cas se résolvent au
// même geste réel (suppression), seul le libellé change côté frontend
// selon le statut. Suppression physique — post_likes/post_comments/
// post_impressions/post_vues sont en ON DELETE CASCADE (voir migration
// 20260727000001_yelen_community.sql / 20260823000004), déjà pensé pour
// supporter cette suppression proprement.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communaute_pro.publish")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const { id } = await params;

  const { data: post } = await sb.from("posts").select("id").eq("id", id).eq("institution_auteur_id", membre.institutionId).eq("auteur_type", "institution").maybeSingle();
  if (!post) return NextResponse.json({ error: "Publication introuvable pour cette institution" }, { status: 404 });

  const { error } = await sb.from("posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
