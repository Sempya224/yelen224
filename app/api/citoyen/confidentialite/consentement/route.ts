import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Accepte les CGU ou la Politique de confidentialité — colonnes
// nullable posées une fois (migration 20260724000002), ne redeviennent
// jamais null. Un citoyen déjà accepté ne peut pas re-déclencher (le
// timestamp existant fait foi), cohérent avec le mirroring de
// institutions.conditions_prestataire_acceptees_le.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, type } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (type !== "cgu" && type !== "confidentialite") {
      return NextResponse.json({ error: "Type de consentement invalide", code: "INVALID_TYPE" }, { status: 400 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const colonne = type === "cgu" ? "cgu_acceptee_le" : "confidentialite_acceptee_le";

    const { data: current } = await supabaseAdmin.from("users").select(colonne).eq("id", user.id).single();
    if (current && (current as Record<string, string | null>)[colonne]) {
      return NextResponse.json({ success: true, deja_accepte: true });
    }

    const { error } = await supabaseAdmin.from("users").update({ [colonne]: new Date().toISOString() }).eq("id", user.id);
    if (error) {
      console.error("[CITOYEN CONSENTEMENT ERROR]", error.message);
      return NextResponse.json({ error: "Impossible d'enregistrer votre consentement", code: "UPDATE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN CONSENTEMENT ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
