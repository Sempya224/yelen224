import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, WebAuthnCredential } from "@simplewebauthn/server";
import { extraireIpClient } from "@/lib/edgeSecurity";
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentativeAdminEntry,
  enregistrerTentativeAdminEntry, messageSecurite,
} from "@/lib/security/authSecurity";
import { getWebAuthnOrigin } from "@/lib/webauthnOrigin";
import { verifyAdminEntryChallengeToken, creerGrantEntreeAdmin, ADMIN_ENTRY_GRANT_COOKIE, ADMIN_ENTRY_GRANT_TTL_S } from "@/lib/adminEntry";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Admin Entry Security V2 — Lot 3 (30/08/2026). Route PUBLIQUE. Séparation
// fondamentale (décision CEO, section 1) : succès ici == droit temporaire
// d'atteindre /admin/login, JAMAIS une session admin. Aucun claim `sid`,
// aucune ligne admin_sessions, aucune identité admin manipulée dans cette
// route — verifyAdminSession()/authorizeAdmin() (lib/adminAuth.ts) restent
// strictement inchangés et ignorent tout ce qui se passe ici.
export async function POST(request: NextRequest) {
  const { deviceId, estNouveau } = resoudreDeviceId(request);
  const ip = extraireIpClient(request);
  const userAgent = request.headers.get("user-agent");

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status });
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau);
    return response;
  };

  try {
    const porte = await evaluerTentativeAdminEntry(supabaseAdmin, { deviceId, ip });
    if (porte.state === "blocked" || porte.state === "support_only") {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === "blocked" ? "AUTH_SECURITY_BLOCKED" : "AUTH_SECURITY_SUPPORT_ONLY", security: porte },
        423
      );
    }

    const body = await request.json();
    const { credential, challengeToken } = body as {
      credential: AuthenticationResponseJSON;
      challengeToken: string;
    };

    if (!credential || !challengeToken) {
      return finaliser({ error: "Requête incomplète", code: "MISSING_FIELDS" }, 400);
    }

    const challenge = await verifyAdminEntryChallengeToken(challengeToken);
    if (!challenge) {
      return finaliser({ error: "Challenge invalide ou expiré. Réessayez.", code: "INVALID_CHALLENGE" }, 401);
    }

    // Option A (décision CEO, section 2) — recherche par credential_id
    // SEUL, jamais par couple (entité, credential_id) : il n'y a pas
    // d'entité à filtrer par conception. `revoked_at IS NULL` obligatoire
    // (contrainte absolue #4 du Lot 3 : "vérification exclusivement avec
    // les credentials actifs").
    const { data: credRow } = await supabaseAdmin
      .from("admin_entry_webauthn_credentials")
      .select("id, credential_id, public_key, counter")
      .eq("credential_id", credential.id)
      .is("revoked_at", null)
      .maybeSingle();

    // Lot 3, écart 1 (31/08/2026) : réponse strictement identique au cas
    // "assertion invalide" ci-dessous — credential inconnu et credential
    // révoqué tombent déjà dans cette même branche (`.is("revoked_at",
    // null)` ci-dessus les rend indiscernables en base), il ne fallait
    // plus qu'uniformiser la réponse HTTP elle-même (401+code distinct
    // avant correction). `security`/`code` volontairement omis ici — un
    // client légitime n'en a jamais besoin sur un échec de vérification.
    if (!credRow) {
      await enregistrerTentativeAdminEntry(supabaseAdmin, { deviceId, ip, outcome: "credential_not_found", userAgent });
      return finaliser({ error: "Vérification impossible." }, 404);
    }

    const { rpID, expectedOrigin } = getWebAuthnOrigin(request);

    const webAuthnCredential: WebAuthnCredential = {
      id: credRow.credential_id,
      publicKey: new Uint8Array(Buffer.from(credRow.public_key, "base64url")),
      counter: credRow.counter,
    };

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: webAuthnCredential,
      requireUserVerification: true,
    });

    if (!verification.verified) {
      await enregistrerTentativeAdminEntry(supabaseAdmin, { deviceId, ip, outcome: "verification_failed", userAgent });
      return finaliser({ error: "Vérification impossible." }, 404);
    }

    // Anti-clonage/anti-rejeu — même contrôle que citoyen/institution : un
    // compteur qui n'avance pas (les deux valeurs étant non nulles) rejette
    // l'assertion. Couvre directement le test "replay d'une assertion".
    const { newCounter } = verification.authenticationInfo;
    if (credRow.counter !== 0 && newCounter !== 0 && newCounter <= credRow.counter) {
      console.error("[ADMIN ENTRY WEBAUTHN AUTH VERIFY] Régression de compteur suspecte", credRow.credential_id);
      const etat = await enregistrerTentativeAdminEntry(supabaseAdmin, { deviceId, ip, outcome: "counter_regression", userAgent });
      return finaliser({ error: "Anomalie de sécurité détectée. Réessayez.", code: "COUNTER_REGRESSION", security: etat }, 401);
    }

    const etatVerifie = await enregistrerTentativeAdminEntry(supabaseAdmin, { deviceId, ip, outcome: "verification_ok", userAgent });

    await supabaseAdmin
      .from("admin_entry_webauthn_credentials")
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq("id", credRow.id);

    const grant = await creerGrantEntreeAdmin(supabaseAdmin, { ip, userAgent });
    if (!grant) {
      return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
    }

    const response = finaliser({ success: true, security: etatVerifie }, 200);
    response.cookies.set(ADMIN_ENTRY_GRANT_COOKIE, grant.rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ADMIN_ENTRY_GRANT_TTL_S,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("[ADMIN ENTRY WEBAUTHN AUTH VERIFY ERROR]", error);
    return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
