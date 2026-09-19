import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerRapportExecutif } from "@/lib/rapportsAggregation";

// Executive Report Center (refonte niveau US, brief CEO 06/08/2026,
// instruction #10) — données de l'écran Rapports, distinctes de
// /api/institution/finance/accueil (consommée par FinanceAccueilTab, non
// touchée par ce chantier).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rapports") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const rapport = await calculerRapportExecutif(membre.institutionId);
  return NextResponse.json(rapport);
}
