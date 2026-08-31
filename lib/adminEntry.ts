import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";

// Admin Entry Security V2 (Lot 3, 30/08/2026) — lib/adminAuth.ts reste la
// source unique de l'authentification/session admin, JAMAIS touchée ici.
// Ce fichier ne gère que le droit temporaire d'atteindre /admin/login
// (docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md, section 4) : aucune
// fonction ci-dessous ne peut produire une session admin, un claim `sid`,
// ni rien d'accepté par verifyAdminSession()/authorizeAdmin().

export const ADMIN_ENTRY_GRANT_COOKIE = "yelen224_admin_entry_grant";
// 20 minutes — assez pour terminer la connexion normale (mot de passe +
// MFA) juste après, jamais destiné à persister comme une session.
export const ADMIN_ENTRY_GRANT_TTL_S = 20 * 60;

// Secret dédié (Lot 2, 30/08/2026) — jamais ADMIN_JWT_SECRET ni aucun autre
// secret existant (voir .env.local, jamais lu ni affiché ici au-delà de
// son usage de signature).
const CHALLENGE_SECRET = new TextEncoder().encode(process.env.ADMIN_ENTRY_WEBAUTHN_JWT_SECRET!);

export async function mintAdminEntryChallengeToken(challenge: string): Promise<string> {
  return new SignJWT({ challenge })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setIssuer("yelen224-admin-entry-webauthn")
    .sign(CHALLENGE_SECRET);
}

export async function verifyAdminEntryChallengeToken(token: string): Promise<{ challenge: string } | null> {
  try {
    const { payload } = await jwtVerify(token, CHALLENGE_SECRET, { issuer: "yelen224-admin-entry-webauthn" });
    return typeof payload.challenge === "string" ? { challenge: payload.challenge } : null;
  } catch {
    return null;
  }
}

// Émission du grant — appelée UNIQUEMENT après succès WebAuthn confirmé
// (verifyAuthenticationResponse). Même schéma de hachage que
// citoyen_remember_tokens/institution_remember_tokens (sha256 hex, seule
// la valeur brute part au navigateur, jamais stockée côté serveur) — Lot 3
// exigence explicite : "cookie aléatoire, court, sans identité de session".
export async function creerGrantEntreeAdmin(
  sb: SupabaseClient,
  params: { ip: string | null; userAgent: string | null }
): Promise<{ rawToken: string } | null> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const cookieHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + ADMIN_ENTRY_GRANT_TTL_S * 1000).toISOString();

  const { error } = await sb.from("admin_entry_grants").insert({
    cookie_hash: cookieHash,
    factor_used: "webauthn",
    expires_at: expiresAt,
    ip: params.ip,
    user_agent: params.userAgent,
  });
  if (error) {
    console.error("[ADMIN ENTRY GRANT] Erreur création:", error.message);
    return null;
  }
  return { rawToken };
}
