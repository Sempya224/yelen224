import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { FENETRE_JOURS, PERIODES_VALIDES, type PeriodeJours } from "@/lib/analyseAggregation";
import { actualiserRecommandations, listerRecommandations } from "@/lib/recommandationsLifecycle";

// Recalcule les 3 signaux déterministes (lib/recommandationsInstitution.ts)
// et synchronise l'état persistant (lib/recommandationsLifecycle.ts) —
// explicitement séparé de GET (lecture seule), jamais le même moteur
// dupliqué dans les deux routes. ?jours= restreint aux presets du Centre
// d'Analyse, même convention que les routes analyse/*.
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "recommandations") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const joursParam = Number(req.nextUrl.searchParams.get("jours"));
  const fenetreJours: PeriodeJours = PERIODES_VALIDES.includes(joursParam as PeriodeJours) ? (joursParam as PeriodeJours) : FENETRE_JOURS;

  const { volumeSuffisant } = await actualiserRecommandations(membre.institutionId, fenetreJours);
  const recommandations = await listerRecommandations(membre.institutionId);
  return NextResponse.json({ recommandations, volumeSuffisant });
}
