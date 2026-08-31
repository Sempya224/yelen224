import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerEvolution } from "@/lib/analyseAggregation";

// Alimente le graphique "Évolution des performances" (3 courbes) du Centre
// d'Analyse — fenêtre 365 jours, le sélecteur 7j/30j/90j/1an retranche
// côté client sur ce seul fetch.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "analyse") === "none") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

  const jours = await calculerEvolution(membre.institutionId);
  return NextResponse.json({ jours });
}
