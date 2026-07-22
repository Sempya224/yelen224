import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAUT_COMMUNICATION } from "@/lib/citoyenConfidentialite";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, communicationsYelen, communicationsEtablissements, personnalisation } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: existant } = await supabaseAdmin
      .from("citoyen_communication_prefs")
      .select("communications_yelen,communications_etablissements,personnalisation")
      .eq("citoyen_id", user.id)
      .maybeSingle();

    const yelen = typeof communicationsYelen === "boolean" ? communicationsYelen : existant?.communications_yelen ?? DEFAUT_COMMUNICATION.communications_yelen;
    const etablissements = typeof communicationsEtablissements === "boolean" ? communicationsEtablissements : existant?.communications_etablissements ?? DEFAUT_COMMUNICATION.communications_etablissements;
    const perso = typeof personnalisation === "boolean" ? personnalisation : existant?.personnalisation ?? DEFAUT_COMMUNICATION.personnalisation;

    const { error } = await supabaseAdmin.from("citoyen_communication_prefs").upsert(
      { citoyen_id: user.id, communications_yelen: yelen, communications_etablissements: etablissements, personnalisation: perso, updated_at: new Date().toISOString() },
      { onConflict: "citoyen_id" }
    );
    if (error) {
      console.error("[CITOYEN CONFIDENTIALITE COMMUNICATION ERROR]", error.message);
      return NextResponse.json({ error: "Impossible d'enregistrer vos préférences", code: "UPDATE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN CONFIDENTIALITE COMMUNICATION ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
