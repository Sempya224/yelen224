import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Contourne RLS via service role — aucune policy UPDATE n'existe sur
// institutions (confirmé via pg_policies), donc l'ancien .update() client
// direct dans DisponibilitesTab.tsx était bloqué silencieusement (0 ligne
// affectée, error: null côté supabase-js) depuis toujours. L'institution
// cible est dérivée du cookie de session JWT, jamais d'un id fourni par
// le client — écarte tout risque d'écrire sur une autre institution.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function PUT(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "disponibilites.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const disponibilites = body?.disponibilites;
  if (!Array.isArray(disponibilites)) return NextResponse.json({ error: "disponibilites (tableau) requis" }, { status: 400 });

  const { error } = await sb.from("institutions").update({ disponibilites }).eq("id", membre.institutionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
