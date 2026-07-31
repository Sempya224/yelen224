import { SignJWT, jwtVerify } from "jose";

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
