import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerAnalyseAcquisition } from "@/lib/analyseAcquisition";
import { FENETRE_JOURS, PERIODES_VALIDES, type PeriodeJours } from "@/lib/analyseAggregation";
import type { AcquisitionSource } from "@/lib/acquisitionSource";

const SOURCES_VALIDES: AcquisitionSource[] = ["yelen_search", "nearby", "qr_code", "community", "announcement", "share", "external", "direct", "unknown"];

// Alimente le sous-onglet "Acquisition" du Centre d'Analyse — comment les
// citoyens découvrent la fiche publique et ce qu'ils font ensuite.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "analyse") === "none") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

  const joursParam = Number(req.nextUrl.searchParams.get("jours"));
  const fenetreJours: PeriodeJours = PERIODES_VALIDES.includes(joursParam as PeriodeJours) ? (joursParam as PeriodeJours) : FENETRE_JOURS;

  const sourceParam = req.nextUrl.searchParams.get("source");
  const source = sourceParam && (SOURCES_VALIDES as string[]).includes(sourceParam) ? (sourceParam as AcquisitionSource) : undefined;

  const acquisition = await calculerAnalyseAcquisition(membre.institutionId, fenetreJours, source);
  return NextResponse.json(acquisition);
}
