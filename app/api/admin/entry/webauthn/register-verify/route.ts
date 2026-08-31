import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { getWebAuthnOrigin } from "@/lib/webauthnOrigin";
import { verifyAdminEntryChallengeToken } from "@/lib/adminEntry";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Admin Entry Security V2 — Lot 3 (30/08/2026). Route PROTÉGÉE (même garde
// que register-options). N'écrit jamais ailleurs que
// admin_entry_webauthn_credentials — aucune clé privée n'est jamais
// transmise ni stockée (WebAuthn ne fait circuler que la clé publique,
// contrainte absolue du Lot 3 déjà garantie par le protocole lui-même).
export async function POST(request: NextRequest) {
  try {
    await authorizeAdmin(request, "admin_entry.manage");
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  try {
    const body = await request.json();
    const { credential, challengeToken, deviceLabel } = body as {
      credential: RegistrationResponseJSON;
      challengeToken: string;
      deviceLabel?: string;
    };

    if (!credential || !challengeToken) {
      return NextResponse.json({ error: "Requête incomplète", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const challenge = await verifyAdminEntryChallengeToken(challengeToken);
    if (!challenge) {
      return NextResponse.json({ error: "Challenge invalide ou expiré. Réessayez.", code: "INVALID_CHALLENGE" }, { status: 401 });
    }

    const { rpID, expectedOrigin } = getWebAuthnOrigin(request);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Échec de la vérification de l'empreinte/Face ID", code: "VERIFICATION_FAILED" }, { status: 401 });
    }

    const { id, publicKey, counter } = verification.registrationInfo.credential;

    const { error: insertError } = await supabaseAdmin
      .from("admin_entry_webauthn_credentials")
      .insert({
        credential_id: id,
        public_key: Buffer.from(publicKey).toString("base64url"),
        counter,
        device_label: typeof deviceLabel === "string" && deviceLabel.trim() ? deviceLabel.trim() : null,
      });

    if (insertError) {
      console.error("[ADMIN ENTRY WEBAUTHN REGISTER VERIFY INSERT ERROR]", insertError.code, insertError.message);
      return NextResponse.json(
        {
          error: insertError.code === "23505" ? "Cet appareil est déjà enregistré." : "Erreur lors de l'enregistrement",
          code: insertError.code === "23505" ? "ALREADY_REGISTERED" : "INSERT_ERROR",
        },
        { status: insertError.code === "23505" ? 409 : 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN ENTRY WEBAUTHN REGISTER VERIFY ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
