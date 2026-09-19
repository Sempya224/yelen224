import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerAnalyseClients } from "@/lib/analyseClients";
import { FENETRE_JOURS, PERIODES_VALIDES, type PeriodeJours } from "@/lib/analyseAggregation";

// Alimente le sous-onglet "Mes clients" du Centre d'Analyse (Customer
// Analytics — distinct de l'écran CRM "Mes clients" du dashboard).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "analyse") === "none") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

  const joursParam = Number(req.nextUrl.searchParams.get("jours"));
  const fenetreJours: PeriodeJours = PERIODES_VALIDES.includes(joursParam as PeriodeJours) ? (joursParam as PeriodeJours) : FENETRE_JOURS;

  const clients = await calculerAnalyseClients(membre.institutionId, fenetreJours);
  return NextResponse.json(clients);
}
