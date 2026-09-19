import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";

// Table dédiée institution_responsables (migration 20260711000002) — séparée
// de institutions, pas de policy RLS anon/authenticated (accès exclusivement
// via cette route, service role + session JWT, même pattern que profile/
// disponibilites). Relation 1:1 pour l'instant.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EDITABLE_FIELDS = ["prenom", "nom", "role", "phone", "email", "photo_url"] as const;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "profil-responsable") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data, error } = await sb
    .from("institution_responsables")
    .select("prenom,nom,role,phone,email,photo_url")
    .eq("institution_id", authInstId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ responsable: data });
}

export async function PUT(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "profil_responsable.write", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  if (!body.prenom || !body.nom) return NextResponse.json({ error: "Prénom et nom requis" }, { status: 400 });

  const payload: Record<string, unknown> = { institution_id: authInstId, updated_at: new Date().toISOString() };
  for (const field of EDITABLE_FIELDS) {
    if (field in body) payload[field] = body[field];
  }

  const { error } = await sb.from("institution_responsables").upsert(payload, { onConflict: "institution_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
