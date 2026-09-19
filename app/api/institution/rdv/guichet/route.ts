import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Route dédiée (plutôt qu'étendre /api/institution/rdv/statut, basée sur des
// actions de cycle de vie) — met à jour uniquement rdv.guichet, un champ
// texte libre optionnel (migration 20260720000001).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "rdv.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rdvId = body?.rdv_id;
  const guichet = typeof body?.guichet === "string" ? body.guichet.trim().slice(0, 100) : "";

  if (typeof rdvId !== "string") {
    return NextResponse.json({ error: "rdv_id requis" }, { status: 400 });
  }

  const { error } = await sb
    .from("rdv")
    .update({ guichet: guichet || null })
    .eq("id", rdvId)
    .eq("institution_id", membre.institutionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, guichet: guichet || null });
}
