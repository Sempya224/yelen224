import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerTopOffres, FENETRE_JOURS, PERIODES_VALIDES } from "@/lib/analyseAggregation";

// Alimente la carte "Top offres performantes" du Centre d'Analyse.
// ?jours= pilote le sélecteur de période global — même garde-fou que
// vue-ensemble/route.ts.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "analyse") === "none") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

  const joursParam = Number(req.nextUrl.searchParams.get("jours"));
  const fenetreJours = PERIODES_VALIDES.includes(joursParam as typeof PERIODES_VALIDES[number]) ? joursParam : FENETRE_JOURS;

  const offres = await calculerTopOffres(membre.institutionId, fenetreJours);
  return NextResponse.json({ offres });
}
