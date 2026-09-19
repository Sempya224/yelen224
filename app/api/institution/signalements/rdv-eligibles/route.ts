import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// RDV éligibles pour rattacher un signalement (chantier RDV obligatoire,
// 15/08/2026) — un signalement doit documenter un fait précis, pas une
// impression générale, donc seuls les RDV déjà passés ou en cours (date/
// heure atteinte) sont proposés. Tous statuts acceptés (terminé, confirmé
// passé, absent, annulé...), seul le critère temporel filtre. Même
// permission que la création elle-même (signalements.write).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "signalements.write")) {
    return NextResponse.json({ error: "Accès réservé aux rôles autorisés à créer un signalement" }, { status: 403 });
  }

  const citoyenId = req.nextUrl.searchParams.get("citoyen_id");
  if (!citoyenId) return NextResponse.json({ error: "citoyen_id requis" }, { status: 400 });

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 5);

  const { data, error } = await sb
    .from("rdv")
    .select("id, objet, date_rdv, heure_rdv, statut")
    .eq("institution_id", membre.institutionId)
    .eq("citoyen_id", citoyenId)
    .lte("date_rdv", todayStr)
    .order("date_rdv", { ascending: false })
    .order("heure_rdv", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rdvs = (data ?? []).filter(r => r.date_rdv < todayStr || r.heure_rdv <= nowTime);

  return NextResponse.json({ rdvs });
}
