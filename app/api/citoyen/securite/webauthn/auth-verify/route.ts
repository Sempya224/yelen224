import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, WebAuthnCredential } from "@simplewebauthn/server";
import { mintCitoyenSessionTokenHash, enregistrerConnexionCitoyen, CITOYEN_REMEMBER_MAX_AGE_S } from "@/lib/auth/citoyenSession";

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

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function lockedMsRemaining(citoyenId: string): number {
  const entry = failedAttempts.get(citoyenId);
  if (!entry) return 0;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

function registerFailure(citoyenId: string) {
  const now = Date.now();
  const entry = failedAttempts.get(citoyenId);
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1;
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0;
  failedAttempts.set(citoyenId, { count, lockedUntil });
}

function clearFailures(citoyenId: string) {
  failedAttempts.delete(citoyenId);
}

// Contrairement au PIN citoyen (verrou local secondaire uniquement), le
// WebAuthn est traité ici comme un véritable facteur d'authentification
// alternatif — au succès, on mint une vraie session Supabase Auth (même
// mécanisme que la vérification OTP, voir
// lib/auth/citoyenSession.ts::mintCitoyenSessionTokenHash) plutôt que de
// se contenter d'un flag local. Le client redeem le hashed_token via
// supabase.auth.verifyOtp(), exactement comme après un OTP réussi.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { citoyenId, credential, challengeToken } = body as {
      citoyenId: string;
      credential: AuthenticationResponseJSON;
      challengeToken: string;
    };

    if (!citoyenId || typeof citoyenId !== "string" || !credential || !challengeToken) {
      return NextResponse.json({ error: "Requête incomplète", code: "MISSING_FIELDS" }, { status: 400 });
    }

    if (lockedMsRemaining(citoyenId) > 0) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "LOCKED" }, { status: 429 });
    }

    let expectedChallenge: string;
    try {
      const { payload } = await jwtVerify(challengeToken, JWT_SECRET, { issuer: "yelen224-citoyen-webauthn" });
      if (payload.citoyenId !== citoyenId || typeof payload.challenge !== "string") {
        throw new Error("mismatch");
      }
      expectedChallenge = payload.challenge;
    } catch {
      return NextResponse.json({ error: "Challenge invalide ou expiré. Réessayez.", code: "INVALID_CHALLENGE" }, { status: 401 });
    }

    const { data: credRow } = await supabaseAdmin
      .from("citoyen_webauthn_credentials")
      .select("id, credential_id, public_key, counter")
      .eq("citoyen_id", citoyenId)
      .eq("credential_id", credential.id)
      .maybeSingle();

    if (!credRow) {
      registerFailure(citoyenId);
      return NextResponse.json({ error: "Appareil non reconnu", code: "CREDENTIAL_NOT_FOUND" }, { status: 401 });
    }

    const { rpID, expectedOrigin } = getWebAuthnOrigin(request);

    const webAuthnCredential: WebAuthnCredential = {
      id: credRow.credential_id,
      publicKey: new Uint8Array(Buffer.from(credRow.public_key, "base64url")),
      counter: credRow.counter,
    };

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: webAuthnCredential,
      requireUserVerification: true,
    });

    if (!verification.verified) {
      registerFailure(citoyenId);
      return NextResponse.json({ error: "Échec de la vérification de l'empreinte/Face ID", code: "VERIFICATION_FAILED" }, { status: 401 });
    }

    // Le compteur doit progresser à chaque authentification — une valeur
    // qui n'avance pas (les deux valeurs étant non nulles) peut signaler
    // un authenticator cloné. Beaucoup de passkeys rapportent toujours 0 :
    // dans ce cas précis on ne peut pas s'appuyer dessus (même logique
    // que côté institution).
    const { newCounter } = verification.authenticationInfo;
    if (credRow.counter !== 0 && newCounter !== 0 && newCounter <= credRow.counter) {
      console.error("[CITOYEN WEBAUTHN AUTH VERIFY] Régression de compteur suspecte", citoyenId, credRow.credential_id);
      registerFailure(citoyenId);
      return NextResponse.json({ error: "Anomalie de sécurité détectée. Réessayez ou reconnectez-vous par SMS.", code: "COUNTER_REGRESSION" }, { status: 401 });
    }

    clearFailures(citoyenId);

    await supabaseAdmin
      .from("citoyen_webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("id", credRow.id);

    const sessionResult = await mintCitoyenSessionTokenHash(supabaseAdmin, citoyenId);
    if ("error" in sessionResult) {
      console.error("[CITOYEN WEBAUTHN AUTH VERIFY SESSION MINT ERROR]", sessionResult.error);
      return NextResponse.json({ error: "Impossible d'établir la session", code: "SESSION_ERROR" }, { status: 500 });
    }

    const remember = await enregistrerConnexionCitoyen(supabaseAdmin, citoyenId, request);

    const response = NextResponse.json({ success: true, tokenHash: sessionResult.tokenHash });

    if (remember) {
      response.cookies.set("yelen224_citoyen_remember", remember.rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: CITOYEN_REMEMBER_MAX_AGE_S,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("[CITOYEN WEBAUTHN AUTH VERIFY ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
