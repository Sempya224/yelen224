import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab, can } from "@/lib/institutionPermissions";
import { changerStatutRecommandation, isStatutRecommandation } from "@/lib/recommandationsLifecycle";

// Changement d'état manuel (consultée/traitée) — "nouvelle"/"expirée" ne
// sont jamais des cibles manuelles (produites uniquement par
// POST .../actualiser via lib/recommandationsCycleVie.ts::decisionCycleVie).
// IDOR : changerStatutRecommandation() revérifie elle-même institution_id
// en base, jamais une confiance aveugle dans ce que cette route a filtré.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "recommandations") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const statutCible = body?.statut;
  if (!isStatutRecommandation(statutCible) || (statutCible !== "consultee" && statutCible !== "traitee")) {
    return NextResponse.json({ error: "Statut cible invalide" }, { status: 400 });
  }

  // Marquer "traitée" est une action opérationnelle, pas une simple lecture
  // — réservée admin+superviseur (voir lib/institutionPermissions.ts,
  // ActionKey "recommandations.marquer_traitee"), le dirigeant lit sans piloter.
  if (statutCible === "traitee" && !can(membre.role, "recommandations.marquer_traitee")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const resultat = await changerStatutRecommandation(membre.institutionId, id, statutCible, membre.membreId);
  if (!resultat.ok && resultat.raison === "introuvable") {
    return NextResponse.json({ error: "Recommandation introuvable pour cette institution" }, { status: 404 });
  }
  if (!resultat.ok && resultat.raison === "transition_invalide") {
    return NextResponse.json({ error: "Transition de statut invalide" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
