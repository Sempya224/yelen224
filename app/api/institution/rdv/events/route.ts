import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// rdv_events (migration 20260709000012) journalise les actions du CITOYEN
// (report, annulation, confirmation...) — alimentée par lib/notifications.ts,
// mais RLS n'a volontairement aucune policy dessus (migration 20260709000013).
// Cette route sert de passerelle service_role, en vérifiant que le RDV
// appartient bien à l'institution du membre authentifié.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rdv") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const rdvId = new URL(req.url).searchParams.get("rdv_id");
  if (!rdvId) return NextResponse.json({ error: "rdv_id requis" }, { status: 400 });

  const { data: rdv } = await sb
    .from("rdv")
    .select("id")
    .eq("id", rdvId)
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (!rdv) return NextResponse.json({ error: "RDV introuvable pour cette institution" }, { status: 404 });

  const { data, error } = await sb
    .from("rdv_events")
    .select("id,auteur_type,action,motif,created_at")
    .eq("rdv_id", rdvId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entrees: data ?? [] });
}
