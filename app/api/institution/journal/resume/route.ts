import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { scoreRisque } from "@/lib/journalTaxonomie";

// "Résumé IA Yelen" (Lot F, 24/07/2026) — décision CEO : règles
// déterministes (comptages/seuils), aucun appel LLM. Ne prend aucune
// décision, résume simplement. Même garde d'accès que /api/institution/journal.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Fenêtre "horaires habituels" pour signaler une connexion hors horaires —
// règle statique simple (6h-22h), pas un profil de référence par membre
// (demanderait un historique individuel, hors scope — cf. limite déjà
// signalée au Lot E dans CLAUDE.md). Guinée = UTC+0, aucun décalage à
// appliquer sur created_at.
const DEBUT_HORAIRES = 6;
const FIN_HORAIRES = 22;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "journal.read")) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });

  const debutAujourdhui = new Date();
  debutAujourdhui.setUTCHours(0, 0, 0, 0);

  const { data, error } = await sb
    .from("journal_activite")
    .select("action,niveau,details,created_at")
    .eq("institution_id", membre.institutionId)
    .gte("created_at", debutAujourdhui.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entrees = data ?? [];
  let critiques = 0, aSurveiller = 0, horsHoraires = 0;
  for (const e of entrees) {
    const risque = scoreRisque(e.action, e.niveau, (e.details as Record<string, unknown>) || {});
    if (risque === "rouge") critiques++;
    else if (risque === "orange") aSurveiller++;
    if (e.action === "connexion") {
      const h = new Date(e.created_at).getUTCHours();
      if (h < DEBUT_HORAIRES || h >= FIN_HORAIRES) horsHoraires++;
    }
  }

  const phrases: string[] = [];
  phrases.push(
    entrees.length === 0
      ? "Aucune activité enregistrée aujourd'hui."
      : `${entrees.length} action${entrees.length > 1 ? "s" : ""} enregistrée${entrees.length > 1 ? "s" : ""} aujourd'hui.`
  );
  if (critiques === 0 && aSurveiller === 0 && horsHoraires === 0) {
    phrases.push("Aucun comportement suspect détecté.");
  } else {
    if (critiques > 0) phrases.push(`${critiques} action${critiques > 1 ? "s" : ""} critique${critiques > 1 ? "s" : ""} à vérifier.`);
    if (aSurveiller > 0) phrases.push(`${aSurveiller} action${aSurveiller > 1 ? "s" : ""} à surveiller.`);
    if (horsHoraires > 0) phrases.push(`${horsHoraires} connexion${horsHoraires > 1 ? "s" : ""} hors horaires habituels (avant ${DEBUT_HORAIRES}h ou après ${FIN_HORAIRES}h).`);
  }

  return NextResponse.json({ phrases, total: entrees.length, critiques, a_surveiller: aSurveiller, hors_horaires: horsHoraires });
}
