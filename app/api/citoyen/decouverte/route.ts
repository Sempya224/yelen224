// Guidance / Découverte — v2 (27/08/2026, cycle de vie/cooldown). Point de
// lecture unique des recommandations de découverte — même motif
// d'authentification que app/api/citoyen/attention/route.ts (service_role
// après vérification du token, jamais de citoyen_id fourni par le client).
// Le calcul lui-même (lib/discoveryEngine.ts) reste pur — cette route
// assemble l'état réel, puis journalise les expositions du jour
// (fire-and-forget, comme mettreAJourMemoire côté attention).
//
// Décision actée avec Bryan : cette route tourne en parallèle des
// mécanismes existants (SuggestionsIntelligentes, bloc découverte de
// MonAssistant) — elle ne les remplace pas tant que le nouveau moteur n'a
// pas été validé en conditions réelles.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { construireDiscoveryState } from "@/lib/discoveryStateBuilder";
import { calculerDecouverte, FEATURE_CATALOGUE, type DiscoverySourceType } from "@/lib/discoveryEngine";
import { enregistrerEvenementDecouverte, enregistrerImpressions } from "@/lib/discoveryMemory";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function authentifier(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await authentifier(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const state = await construireDiscoveryState(supabaseAdmin, user.id);
    const candidats = calculerDecouverte(state);
    void enregistrerImpressions(supabaseAdmin, user.id, candidats).catch((e) => console.error("[CITOYEN DECOUVERTE] impressions:", e));
    return NextResponse.json({ candidats });
  } catch (error) {
    console.error("[CITOYEN DECOUVERTE ERROR]", error);
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
    if (typeof source_type !== "string" || !(source_type in FEATURE_CATALOGUE) || typeof categorie !== "string" || !ACTIONS_VALIDES.has(action)) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    await enregistrerEvenementDecouverte(supabaseAdmin, user.id, source_type as DiscoverySourceType, categorie, action, source_id ?? null, typeof signature === "string" ? signature : null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN DECOUVERTE EVENT ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
