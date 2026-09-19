import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, WebAuthnCredential } from "@simplewebauthn/server";
import { completerConnexionCitoyen, mintTotpChallengeToken, CITOYEN_REMEMBER_MAX_AGE_S } from "@/lib/auth/citoyenSession";
import { extraireIpClient } from "@/lib/edgeSecurity";
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from "@/lib/security/authSecurity";

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

// Contrairement au PIN citoyen (verrou local secondaire uniquement), le
// WebAuthn est traité ici comme un véritable facteur d'authentification
// alternatif — au succès, on mint une vraie session Supabase Auth (même
// mécanisme que la vérification OTP, voir
// lib/auth/citoyenSession.ts::mintCitoyenSessionTokenHash) plutôt que de
// se contenter d'un flag local. Le client redeem le hashed_token via
// supabase.auth.verifyOtp(), exactement comme après un OTP réussi.
export async function POST(request: NextRequest) {
  // Auth Security (Lot 3, 30/08/2026) — remplace la Map locale
  // failedAttempts (non persistante, non partagée entre instances
  // serverless), dernière survivante de ce pattern côté citoyen — voir
  // lib/security/authSecurity.ts.
  const { deviceId, estNouveau } = resoudreDeviceId(request);
  const ip = extraireIpClient(request);
  const userAgent = request.headers.get("user-agent");

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status });
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau);
    return response;
  };

  try {
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip });
    if (porte.state === "blocked" || porte.state === "support_only") {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === "blocked" ? "AUTH_SECURITY_BLOCKED" : "AUTH_SECURITY_SUPPORT_ONLY", security: porte },
        423
      );
    }

    const body = await request.json();
    const { citoyenId, credential, challengeToken } = body as {
      citoyenId: string;
      credential: AuthenticationResponseJSON;
      challengeToken: string;
    };

    if (!citoyenId || typeof citoyenId !== "string" || !credential || !challengeToken) {
      return finaliser({ error: "Requête incomplète", code: "MISSING_FIELDS" }, 400);
    }

    let expectedChallenge: string;
    try {
      const { payload } = await jwtVerify(challengeToken, JWT_SECRET, { issuer: "yelen224-citoyen-webauthn" });
      if (payload.citoyenId !== citoyenId || typeof payload.challenge !== "string") {
        throw new Error("mismatch");
      }
      expectedChallenge = payload.challenge;
    } catch {
      return finaliser({ error: "Challenge invalide ou expiré. Réessayez.", code: "INVALID_CHALLENGE" }, 401);
    }

    const { data: credRow } = await supabaseAdmin
      .from("citoyen_webauthn_credentials")
      .select("id, credential_id, public_key, counter")
      .eq("citoyen_id", citoyenId)
      .eq("credential_id", credential.id)
      .maybeSingle();

    if (!credRow) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "citoyen_login", deviceId, ip, identifiant: citoyenId, outcome: "credential_not_found", userAgent,
      });
      return finaliser({ error: "Appareil non reconnu", code: "CREDENTIAL_NOT_FOUND", security: etat }, 401);
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
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "citoyen_login", deviceId, ip, identifiant: citoyenId, outcome: "verification_failed", userAgent,
      });
      return finaliser({ error: "Échec de la vérification de l'empreinte/Face ID", code: "VERIFICATION_FAILED", security: etat }, 401);
    }

    // Le compteur doit progresser à chaque authentification — une valeur
    // qui n'avance pas (les deux valeurs étant non nulles) peut signaler
    // un authenticator cloné. Beaucoup de passkeys rapportent toujours 0 :
    // dans ce cas précis on ne peut pas s'appuyer dessus (même logique
    // que côté institution).
    const { newCounter } = verification.authenticationInfo;
    if (credRow.counter !== 0 && newCounter !== 0 && newCounter <= credRow.counter) {
      console.error("[CITOYEN WEBAUTHN AUTH VERIFY] Régression de compteur suspecte", citoyenId, credRow.credential_id);
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "citoyen_login", deviceId, ip, identifiant: citoyenId, outcome: "counter_regression", userAgent,
      });
      return finaliser({ error: "Anomalie de sécurité détectée. Réessayez ou reconnectez-vous par SMS.", code: "COUNTER_REGRESSION", security: etat }, 401);
    }

    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: "citoyen_login", deviceId, ip, identifiant: citoyenId, outcome: "verification_ok", userAgent,
    });

    await supabaseAdmin
      .from("citoyen_webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("id", credRow.id);

    // 2FA TOTP (chantier sécurité citoyen 25/07/2026) — le WebAuthn est un
    // chemin de connexion complet au même titre que l'OTP téléphone, donc
    // soumis à la même règle : pas de session tant que le TOTP (si activé)
    // n'est pas validé via /api/citoyen/auth/totp/login-verify.
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("totp_enabled")
      .eq("id", citoyenId)
      .maybeSingle();

    if (userRow?.totp_enabled) {
      const totpToken = await mintTotpChallengeToken(citoyenId);
      return finaliser({ requiresTotp: true, totpToken, security: etatVerifie }, 200);
    }

    const { tokenHash, remember } = await completerConnexionCitoyen(supabaseAdmin, citoyenId, request);
    if (!tokenHash) {
      return finaliser({ error: "Impossible d'établir la session", code: "SESSION_ERROR" }, 500);
    }

    const response = finaliser({ success: true, tokenHash, security: etatVerifie }, 200);

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
    return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
