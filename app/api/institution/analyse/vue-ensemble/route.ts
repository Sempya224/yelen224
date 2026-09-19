import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerVueEnsemble, FENETRE_JOURS, PERIODES_VALIDES } from "@/lib/analyseAggregation";

// Alimente les 6 cartes KPI "Vue d'ensemble" du Centre d'Analyse
// (CentreAnalyseTab.tsx). institutionId dérivé exclusivement du cookie de
// session JWT — jamais d'un id fourni par le client (même convention que
// app/api/institution/rdv/route.ts). ?jours= pilote le sélecteur de
// période global de l'en-tête — restreint aux presets valides, jamais une
// valeur arbitraire du client (évite une requête coûteuse sur une fenêtre
// non prévue).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "analyse") === "none") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });

  const joursParam = Number(req.nextUrl.searchParams.get("jours"));
  const fenetreJours = PERIODES_VALIDES.includes(joursParam as typeof PERIODES_VALIDES[number]) ? joursParam : FENETRE_JOURS;

  const vueEnsemble = await calculerVueEnsemble(membre.institutionId, fenetreJours);
  return NextResponse.json(vueEnsemble);
}
