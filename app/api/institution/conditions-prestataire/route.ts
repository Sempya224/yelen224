import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Pose l'acceptation des conditions prestataire — distinct des CGU/
// Confidentialité génériques (app/cgu, app/confidentialite). Contourne
// RLS via service role, même pattern que le reste de app/api/institution/*.
// institution_id vient toujours du JWT vérifié, jamais du client. Ouvert à
// tout membre authentifié (pas de gate de rôle) : ce modal bloque tout le
// dashboard tant qu'il n'est pas accepté (page.tsx, etapeValidation ===
// "conditions") — si un non-admin est le premier à se connecter après
// validation, il doit pouvoir le débloquer, sinon le dashboard reste
// inutilisable pour toute l'équipe en attendant l'admin.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { error } = await sb
    .from("institutions")
    .update({ conditions_prestataire_acceptees_le: new Date().toISOString() })
    .eq("id", membre.institutionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
