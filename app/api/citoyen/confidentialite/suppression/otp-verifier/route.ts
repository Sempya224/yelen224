import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierOtp } from "@/lib/auth/otp";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const MESSAGES: Record<"aucun_code" | "expire" | "incorrect", string> = {
  aucun_code: "Aucun code en attente. Renvoyez un code.",
  expire: "Ce code a expiré. Renvoyez un code.",
  incorrect: "Code incorrect. Renvoyez un code.",
};

// Vérifie le code SMS envoyé par /suppression/otp-envoyer — étape de
// vérification d'identité avant la suppression de compte, aucun effet de
// bord de session (contrairement à /auth/verify utilisé à la connexion).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = body?.accessToken;
    const code = body?.code;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Code requis", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const result = await verifierOtp(supabaseAdmin, user.id, code.trim());
    if (!result.ok) {
      return NextResponse.json({ error: MESSAGES[result.reason], code: "INVALID_CODE", reason: result.reason }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN SUPPRESSION OTP VERIFIER ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
