import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { genererEtEnvoyerOtp } from "@/lib/auth/otp";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Envoie un code de vérification au numéro déjà enregistré du citoyen —
// étape de vérification d'identité avant la suppression de compte (retour
// Bryan 12/09/2026). Réutilise le même mécanisme que la connexion
// (lib/auth/otp.ts) : hors SMS_PROVIDER branché, le code réel est
// CITOYEN_OTP_FALLBACK (voir CLAUDE.md /actions-manuelles-en-attente).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = body?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("phone").eq("id", user.id).maybeSingle();
    if (!citoyen?.phone) {
      return NextResponse.json({ error: "Aucun numéro associé à ce compte", code: "NO_PHONE" }, { status: 404 });
    }

    const result = await genererEtEnvoyerOtp(supabaseAdmin, user.id, citoyen.phone);
    if (!result.ok) {
      console.error("[CITOYEN SUPPRESSION OTP ENVOYER ERROR]", result.error);
      return NextResponse.json({ error: "Envoi du code impossible pour l'instant. Réessayez.", code: "OTP_SEND_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true, phone: citoyen.phone });
  } catch (error) {
    console.error("[CITOYEN SUPPRESSION OTP ENVOYER ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
