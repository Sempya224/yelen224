import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Contourne RLS via service role — journal_activite n'a aucune policy
// publique (migration 20260715000001). Contrairement à /api/institution/journal
// (réservée à l'admin, décision de sécurité déjà prise, non touchée), cette
// route est ouverte à tout membre authentifié pour alimenter la carte
// "Activité récente" du panneau latéral Agenda — champs minimaux
// (membre_nom, action, created_at), pas de details/cible_id pour ne rien
// exposer de sensible à un rôle non-admin.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LIMIT = 5;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await sb
    .from("journal_activite")
    .select("membre_nom,action,created_at")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entrees: data ?? [] });
}
