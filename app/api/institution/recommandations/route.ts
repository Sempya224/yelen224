import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { listerRecommandations } from "@/lib/recommandationsLifecycle";

// Système de recommandation institutionnel (Phase 3, architecture validée
// CEO 13/10/2026) — lecture seule des recommandations déjà persistées (la
// recomputation/synchronisation vit dans POST .../actualiser, jamais
// dupliquée ici). institutionId dérivé exclusivement du JWT signé, même
// convention que app/api/institution/analyse/vue-ensemble/route.ts.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "recommandations") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const recommandations = await listerRecommandations(membre.institutionId);
  return NextResponse.json({ recommandations });
}
