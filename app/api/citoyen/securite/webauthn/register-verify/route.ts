import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.CITOYEN_WEBAUTHN_JWT_SECRET!);

function getWebAuthnOrigin(request: NextRequest): { rpID: string; expectedOrigin: string } {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    try {
      const u = new URL(envUrl);
      return { rpID: u.hostname, expectedOrigin: u.origin };
    } catch {}
  }
  const u = new URL(request.url);
  return { rpID: u.hostname, expectedOrigin: u.origin };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken, credential, challengeToken, deviceLabel } = body as {
      accessToken: string;
      credential: RegistrationResponseJSON;
      challengeToken: string;
      deviceLabel?: string;
    };

    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (!credential || !challengeToken) {
      return NextResponse.json({ error: "Requête incomplète", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    // Revalidation du challenge — jamais confiance dans une valeur envoyée
    // par le client seule. Le JWT signé prouve qu'il vient bien de nous,
    // qu'il n'a pas expiré (5 min) et qu'il correspond à ce citoyen.
    let expectedChallenge: string;
    try {
      const { payload } = await jwtVerify(challengeToken, JWT_SECRET, { issuer: "yelen224-citoyen-webauthn" });
      if (payload.citoyenId !== user.id || typeof payload.challenge !== "string") {
        throw new Error("mismatch");
      }
      expectedChallenge = payload.challenge;
    } catch {
      return NextResponse.json({ error: "Challenge invalide ou expiré. Réessayez.", code: "INVALID_CHALLENGE" }, { status: 401 });
    }

    const { rpID, expectedOrigin } = getWebAuthnOrigin(request);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Échec de la vérification de l'empreinte/Face ID", code: "VERIFICATION_FAILED" }, { status: 401 });
    }

    const { id, publicKey, counter } = verification.registrationInfo.credential;

    const { error: insertError } = await supabaseAdmin.from("citoyen_webauthn_credentials").insert({
      citoyen_id: user.id,
      credential_id: id,
      public_key: Buffer.from(publicKey).toString("base64url"),
      counter,
      device_label: typeof deviceLabel === "string" && deviceLabel.trim() ? deviceLabel.trim() : null,
    });

    if (insertError) {
      console.error("[CITOYEN WEBAUTHN REGISTER VERIFY INSERT ERROR]", insertError.code, insertError.message);
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
    console.error("[CITOYEN WEBAUTHN REGISTER VERIFY ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
