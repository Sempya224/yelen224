import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerCheckInAvailableAt, calculerCheckInStatus, combinerDateHeureRdv } from "@/lib/rdvGating";

// Modernisation du modal "confirmation de présence indisponible" (décision
// CEO 06/09/2026) — jusqu'ici le compte à rebours n'existait pas et le
// front se contentait d'un message statique, jamais recalculé depuis
// l'horloge serveur. Cette route ne change AUCUNE règle métier (le vrai
// verrou reste creneauEstOuvert, appliqué côté serveur dans
// app/api/qr/validate et app/api/institution/paid-bookings/valider) : elle
// ne fait que donner au front de quoi afficher un compte à rebours fiable,
// jamais basé sur l'horloge de l'appareil.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rdv") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const rdvId = req.nextUrl.searchParams.get("rdv_id");
  if (!rdvId) return NextResponse.json({ error: "rdv_id requis" }, { status: 400 });

  const { data: rdv } = await sb
    .from("rdv")
    .select("date_rdv,heure_rdv")
    .eq("id", rdvId)
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (!rdv) return NextResponse.json({ error: "RDV introuvable pour cette institution" }, { status: 404 });

  const serverTime = new Date();
  const checkInAvailableAt = calculerCheckInAvailableAt(rdv.date_rdv, rdv.heure_rdv);
  if (!checkInAvailableAt) return NextResponse.json({ error: "Date de rendez-vous invalide" }, { status: 500 });

  return NextResponse.json({
    appointmentStartTime: combinerDateHeureRdv(rdv.date_rdv, rdv.heure_rdv).toISOString(),
    checkInAvailableAt: checkInAvailableAt.toISOString(),
    serverTime: serverTime.toISOString(),
    checkInStatus: calculerCheckInStatus(rdv.date_rdv, rdv.heure_rdv, serverTime),
  });
}
