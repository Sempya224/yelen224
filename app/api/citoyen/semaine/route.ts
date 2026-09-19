// Cette semaine — v1 (27/08/2026). Point de lecture unique des cartes de
// synthèse hebdomadaire — même motif d'authentification que
// app/api/citoyen/attention/route.ts et app/api/citoyen/decouverte/route.ts
// (service_role après vérification du token, jamais de citoyen_id fourni
// par le client). Le calcul lui-même (lib/semaineEngine.ts) reste pur —
// cette route assemble l'état réel, puis journalise les expositions du
// jour (fire-and-forget).
//
// citoyen_recommendation_events est partagé avec /api/citoyen/decouverte :
// tous les événements de cette route utilisent le préfixe "semaine_" sur
// source_type pour ne jamais mélanger les deux historiques de fraîcheur
// (voir lib/semaineStateBuilder.ts).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { construireSemaineState } from "@/lib/semaineStateBuilder";
import { calculerSemaine, type SemaineSourceType } from "@/lib/semaineEngine";
import { enregistrerEvenementDecouverte, enregistrerImpressions } from "@/lib/discoveryMemory";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const SOURCES_VALIDES = new Set<SemaineSourceType>(["depense", "demarche", "rdv", "reward", "avis"]);

async function authentifier(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  return await verifierCitoyenToken(accessToken);
}

export async function GET(request: NextRequest) {
  try {
    const user = await authentifier(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const state = await construireSemaineState(supabaseAdmin, user.id);
    const candidats = calculerSemaine(state);
    const candidatsPourJournal = candidats.map((c) => ({ ...c, source_type: `semaine_${c.source_type}` }));
    void enregistrerImpressions(supabaseAdmin, user.id, candidatsPourJournal).catch((e) => console.error("[CITOYEN SEMAINE] impressions:", e));
    return NextResponse.json({ candidats });
  } catch (error) {
    console.error("[CITOYEN SEMAINE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const ACTIONS_VALIDES = new Set(["vue", "ouverte", "utilisee"]);

export async function POST(request: NextRequest) {
  try {
    const user = await authentifier(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json();
    const { source_type, categorie, action, source_id, signature } = body ?? {};
    if (typeof source_type !== "string" || !SOURCES_VALIDES.has(source_type as SemaineSourceType) || typeof categorie !== "string" || !ACTIONS_VALIDES.has(action)) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    await enregistrerEvenementDecouverte(supabaseAdmin, user.id, `semaine_${source_type}`, categorie, action, source_id ?? null, typeof signature === "string" ? signature : null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN SEMAINE EVENT ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
