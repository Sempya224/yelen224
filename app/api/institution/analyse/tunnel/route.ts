import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerAnalyseTunnel } from "@/lib/analyseTunnel";
import { FENETRE_JOURS, PERIODES_VALIDES, type PeriodeJours } from "@/lib/analyseAggregation";

// Alimente le sous-onglet "Tunnel" détaillé du Centre d'Analyse (KPIs,
// panel des pertes, causes d'abandon réelles).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "analyse") === "none") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

  const joursParam = Number(req.nextUrl.searchParams.get("jours"));
  const fenetreJours: PeriodeJours = PERIODES_VALIDES.includes(joursParam as PeriodeJours) ? (joursParam as PeriodeJours) : FENETRE_JOURS;

  const tunnel = await calculerAnalyseTunnel(membre.institutionId, fenetreJours);
  return NextResponse.json(tunnel);
}
