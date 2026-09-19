import { SignJWT, jwtVerify } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { evaluerAppareil, enregistrerConnexion, type EvaluationAppareil } from "@/lib/auth/trustedDevice";

const TRUSTED_DEVICE_CONFIG = {
  table: "institution_remember_tokens",
  idColumn: "institution_id",
  cookieName: "yelen224_institution_remember",
  maxAgeS: 60 * 24 * 60 * 60, // 60 jours, comme citoyen_remember_tokens
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Verrouillage par compte institution (revue critique 30/08/2026, même
// jour) — partagé entre les 3 facteurs de connexion (PIN/OTP/WebAuthn) sur
// institutions.login_failed_attempts/login_locked_until (migration
// 20260830000006). Complète, sans le remplacer, le throttle device+IP de
// lib/security/authSecurity.ts — celui-ci est contournable par rotation du
// cookie device (contrôlé côté client), ce verrou par compte ne l'est pas.
// Seuil : 5 échecs / 15 min, le plus strict des 3 anciens mécanismes
// (celui du PIN) qu'il remplace tous les trois à la fois.
// ─────────────────────────────────────────────────────────────────────────

const SEUIL_VERROUILLAGE_INSTITUTION = 5;
const DUREE_VERROUILLAGE_INSTITUTION_MIN = 15;

export async function verifierVerrouInstitution(
  sb: SupabaseClient,
  institutionId: string
): Promise<{ verrouille: boolean; minutesRestantes: number }> {
  const { data } = await sb.from("institutions").select("login_locked_until").eq("id", institutionId).maybeSingle();
  if (!data?.login_locked_until) return { verrouille: false, minutesRestantes: 0 };
  const restantMs = new Date(data.login_locked_until).getTime() - Date.now();
  if (restantMs <= 0) return { verrouille: false, minutesRestantes: 0 };
  return { verrouille: true, minutesRestantes: Math.ceil(restantMs / 60000) };
}

export async function enregistrerEchecConnexionInstitution(sb: SupabaseClient, institutionId: string): Promise<void> {
  const { data } = await sb.from("institutions").select("login_failed_attempts").eq("id", institutionId).maybeSingle();
  const attempts = (data?.login_failed_attempts ?? 0) + 1;
  const updates: Record<string, unknown> = { login_failed_attempts: attempts };
  if (attempts >= SEUIL_VERROUILLAGE_INSTITUTION) {
    updates.login_locked_until = new Date(Date.now() + DUREE_VERROUILLAGE_INSTITUTION_MIN * 60 * 1000).toISOString();
  }
  await sb.from("institutions").update(updates).eq("id", institutionId);
}

export async function reinitialiserEchecsConnexionInstitution(sb: SupabaseClient, institutionId: string): Promise<void> {
  await sb.from("institutions").update({ login_failed_attempts: 0, login_locked_until: null }).eq("id", institutionId);
}

/**
 * Jeton de défi 2FA TOTP institution (chantier 25/07/2026) — mirroring
 * lib/auth/citoyenSession.ts côté citoyen. Émis par verify-otp, pin/verify,
 * webauthn/auth-verify ou membre/login quand le membre authentifié a
 * totp_enabled=true, au lieu de finaliser directement la session. Consommé
 * par /api/institution/auth/totp/login-verify. Secret dédié, jamais partagé
 * avec INSTITUTION_JWT_SECRET (session réelle) ni les secrets admin/citoyen.
 */
const TOTP_CHALLENGE_SECRET = new TextEncoder().encode(process.env.INSTITUTION_TOTP_CHALLENGE_JWT_SECRET!);

export type TotpChallengePayload = {
  institutionId: string;
  membreId: string;
  role: string;
  rememberMe: boolean;
  // Renseigné uniquement par membre/login/route.ts — signale à
  // totp/login-verify qu'il doit journaliser l'action "connexion" une fois
  // la 2FA validée (comme le faisait membre/login avant l'ajout de la 2FA),
  // ce que les 3 autres flux (OTP/PIN/WebAuthn) ne font pas.
  membreNom?: string;
};

export async function mintInstitutionTotpChallengeToken(payload: TotpChallengePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setIssuer("yelen224-institution-totp")
    .sign(TOTP_CHALLENGE_SECRET);
}

export async function verifyInstitutionTotpChallengeToken(token: string): Promise<TotpChallengePayload | null> {
  try {
    const { payload } = await jwtVerify(token, TOTP_CHALLENGE_SECRET, { issuer: "yelen224-institution-totp" });
    const { institutionId, membreId, role, rememberMe, membreNom } = payload;
    if (typeof institutionId !== "string" || typeof membreId !== "string" || typeof role !== "string") return null;
    return { institutionId, membreId, role, rememberMe: rememberMe === true, membreNom: typeof membreNom === "string" ? membreNom : undefined };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Trusted Device (Mission 30/08/2026, brief CEO) — logique générique dans
// lib/auth/trustedDevice.ts (revue critique du même jour, extraite pour
// ne plus dupliquer la même implémentation que citoyenSession.ts). Seul
// point d'écriture de institution_remember_tokens à ce jour : verify-otp
// (pin/verify, webauthn/auth-verify et membre/login ne proposent pas de
// "rememberMe", hors périmètre de cette mission).
//
// Pas d'équivalent institution à notifierNouvelAppareilSiBesoin (citoyen)
// — aucun canal de notification institution pour un événement de sécurité
// n'existe aujourd'hui (le citoyen a envoyerNotification, l'institution
// n'a que journal_activite, une trace passive, pas un canal actif). Gap
// documenté, pas construit ici (ajouter un canal de notification serait
// une nouvelle brique, hors "ne pas ajouter d'infrastructure inutile").
// ─────────────────────────────────────────────────────────────────────────

export function evaluerAppareilInstitution(
  supabaseAdmin: SupabaseClient,
  institutionId: string,
  req?: NextRequest
): Promise<EvaluationAppareil> {
  return evaluerAppareil(supabaseAdmin, TRUSTED_DEVICE_CONFIG, institutionId, req);
}

export function enregistrerConnexionInstitution(
  supabaseAdmin: SupabaseClient,
  institutionId: string,
  req: NextRequest | undefined,
  evaluation: EvaluationAppareil
): Promise<{ rawToken: string } | null> {
  return enregistrerConnexion(supabaseAdmin, TRUSTED_DEVICE_CONFIG, institutionId, req, evaluation);
}
