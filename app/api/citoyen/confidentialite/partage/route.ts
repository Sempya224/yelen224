import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAUT_PARTAGE } from "@/lib/citoyenConfidentialite";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, partageHistoriqueRdv, partageHistoriqueServices } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: existant } = await supabaseAdmin
      .from("citoyen_prefs_partage")
      .select("partage_historique_rdv,partage_historique_services")
      .eq("citoyen_id", user.id)
      .maybeSingle();

    const rdv = typeof partageHistoriqueRdv === "boolean" ? partageHistoriqueRdv : existant?.partage_historique_rdv ?? DEFAUT_PARTAGE.partage_historique_rdv;
    const services = typeof partageHistoriqueServices === "boolean" ? partageHistoriqueServices : existant?.partage_historique_services ?? DEFAUT_PARTAGE.partage_historique_services;

    const { error } = await supabaseAdmin.from("citoyen_prefs_partage").upsert(
      { citoyen_id: user.id, partage_historique_rdv: rdv, partage_historique_services: services, updated_at: new Date().toISOString() },
      { onConflict: "citoyen_id" }
    );
    if (error) {
      console.error("[CITOYEN CONFIDENTIALITE PARTAGE ERROR]", error.message);
      return NextResponse.json({ error: "Impossible d'enregistrer vos préférences", code: "UPDATE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN CONFIDENTIALITE PARTAGE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
