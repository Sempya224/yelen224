import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// "Déconnecter tous les autres appareils" — exclut volontairement l'appareil
// courant (identifié par le cookie yelen224_citoyen_remember du navigateur
// qui fait l'appel), sinon l'action se couperait elle-même de son propre
// accès rapide immédiatement après. Mirroring
// institution/auth/remember/revoke-all, adapté à l'auth citoyen
// (accessToken Supabase plutôt que cookie de session JWT).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const currentRememberToken = request.cookies.get("yelen224_citoyen_remember")?.value;
    const currentTokenHash = currentRememberToken
      ? crypto.createHash("sha256").update(currentRememberToken).digest("hex")
      : null;

    // Trusted Device (30/08/2026) — status='revoked' plutôt qu'un DELETE,
    // même raisonnement que securite/remember/revoke/route.ts (historique
    // conservé, limite de révocation par session documentée là-bas).
    let query = supabaseAdmin
      .from("citoyen_remember_tokens")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("citoyen_id", user.id)
      .neq("status", "revoked");

    if (currentTokenHash) {
      query = query.neq("token_hash", currentTokenHash);
    }

    const { error: updateError } = await query;

    if (updateError) {
      console.error("[CITOYEN REMEMBER REVOKE ALL ERROR]", updateError.code, updateError.message);
      return NextResponse.json({ error: "Erreur lors de la révocation", code: "DELETE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN REMEMBER REVOKE ALL ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
