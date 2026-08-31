import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TERME_MIN = 2;
const TERME_MAX = 60;
const TOP_N = 8;

function normaliser(terme: string): string {
  return terme.trim().toLowerCase().replace(/\s+/g, " ");
}

// Section "Recherches populaires" de l'overlay Search — aucune session
// requise (la recherche fonctionne pour un citoyen non connecté), lecture
// des N termes les plus recherchés depuis le lancement du suivi (table
// recherches_populaires, vide tant qu'aucune recherche réelle n'a été
// effectuée — jamais de terme fabriqué en fallback).
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("recherches_populaires")
      .select("terme_affichage, nb_recherches")
      .order("nb_recherches", { ascending: false })
      .limit(TOP_N);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, termes: data ?? [] });
  } catch (error) {
    console.error("[RECHERCHE POPULAIRE GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

// Incrémenté côté client uniquement sur une recherche "committée" (validée
// par l'utilisateur, jamais à chaque frappe) — voir RechercheOverlay.
export async function POST(request: NextRequest) {
  try {
    const { terme } = await request.json();
    if (typeof terme !== "string") return NextResponse.json({ error: "terme requis" }, { status: 400 });
    const propre = terme.trim();
    if (propre.length < TERME_MIN || propre.length > TERME_MAX) {
      return NextResponse.json({ success: true, ignore: true });
    }
    const termeNormalise = normaliser(propre);

    const { data: existant } = await supabaseAdmin
      .from("recherches_populaires")
      .select("id, nb_recherches")
      .eq("terme_normalise", termeNormalise)
      .maybeSingle();

    if (existant) {
      const { error } = await supabaseAdmin
        .from("recherches_populaires")
        .update({ nb_recherches: existant.nb_recherches + 1, derniere_recherche_le: new Date().toISOString() })
        .eq("id", existant.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabaseAdmin
        .from("recherches_populaires")
        .insert({ terme_normalise: termeNormalise, terme_affichage: propre });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RECHERCHE POPULAIRE POST ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
