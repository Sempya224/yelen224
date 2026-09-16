import { NextRequest, NextResponse } from "next/server";
import { getEtatSessionCheckin, chargerMembreCheckinActif, checkinSupabaseAdmin } from "@/lib/checkinAuth";
import { can } from "@/lib/institutionPermissions";

// GET → état de la session Check-in courante, consommé au chargement de
// /check-in/{slug} pour décider quel écran afficher (connexion / PIN de
// déverrouillage / scanner) sans jamais monter le dashboard.
export async function GET(req: NextRequest) {
  const etat = await getEtatSessionCheckin(req);

  if (etat.etat === "absente" || etat.etat === "invalide") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const membre = await chargerMembreCheckinActif({ membreId: etat.ctx.membreId, institutionId: etat.ctx.institutionId });
  if (!membre || !can(membre.role, "appointment.check_in")) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const { data } = await checkinSupabaseAdmin.from("institution_membres").select("prenom").eq("id", etat.ctx.membreId).maybeSingle();

  if (etat.etat === "verrouillee") {
    return NextResponse.json({ authenticated: true, locked: true, prenom: data?.prenom ?? "" }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, locked: false, prenom: data?.prenom ?? "" }, { status: 200 });
}
