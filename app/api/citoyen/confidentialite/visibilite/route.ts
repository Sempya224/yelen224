import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAUT_CHAMPS_VISIBLES, DEFAUT_PROFIL_PUBLIC } from "@/lib/citoyenConfidentialite";
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

    const { accessToken, champsVisibles, profilPublic } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    // Lit la ligne existante pour ne remplacer que le champ modifié (le
    // client n'envoie que ce qui a changé), sans écraser l'autre avec le
    // défaut si absent du body.
    const { data: existant } = await supabaseAdmin
      .from("citoyen_prefs_visibilite")
      .select("champs_visibles,profil_public")
      .eq("citoyen_id", user.id)
      .maybeSingle();

    const nouveauxChamps = champsVisibles ?? existant?.champs_visibles ?? DEFAUT_CHAMPS_VISIBLES;
    const nouveauProfilPublic = typeof profilPublic === "boolean" ? profilPublic : existant?.profil_public ?? DEFAUT_PROFIL_PUBLIC;

    const { error } = await supabaseAdmin.from("citoyen_prefs_visibilite").upsert(
      { citoyen_id: user.id, champs_visibles: nouveauxChamps, profil_public: nouveauProfilPublic, updated_at: new Date().toISOString() },
      { onConflict: "citoyen_id" }
    );
    if (error) {
      console.error("[CITOYEN CONFIDENTIALITE VISIBILITE ERROR]", error.message);
      return NextResponse.json({ error: "Impossible d'enregistrer vos préférences", code: "UPDATE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN CONFIDENTIALITE VISIBILITE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
