import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { extraireContexteRequete } from "@/lib/journalActivite";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";
import { evaluerAppareil, enregistrerConnexion, type EvaluationAppareil } from "@/lib/auth/trustedDevice";

const TRUSTED_DEVICE_CONFIG = {
  table: "citoyen_remember_tokens",
  idColumn: "citoyen_id",
  cookieName: "yelen224_citoyen_remember",
  maxAgeS: 60 * 24 * 60 * 60, // 60 jours, comme institution_remember_tokens
} as const;

/**
 * Révoque le token "se souvenir de moi" du device courant (si présent) —
 * extrait de remember/forget/route.ts pour être réutilisé tel quel par
 * la nouvelle route logout/route.ts, sans dupliquer la logique de hash.
 * N'efface pas le cookie lui-même : ça reste la responsabilité de l'appelant
 * (chaque route a sa propre réponse à construire).
 */
export async function revokerRememberTokenCitoyen(
  supabaseAdmin: SupabaseClient,
  request: NextRequest
): Promise<void> {
  const rawToken = request.cookies.get("yelen224_citoyen_remember")?.value;
  if (!rawToken) return;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await supabaseAdmin.from("citoyen_remember_tokens").delete().eq("token_hash", tokenHash);
}

/**
 * Mint un token de session Supabase Auth réel pour un citoyen déjà vérifié
 * par notre propre OTP custom (voir CLAUDE.md /auth). Le compte auth.users
 * "coquille" existe déjà (créé à l'inscription, cf. register/route.ts) —
 * on récupère son email réel via getUserById plutôt que de reconstruire
 * `${userId}@citoyen.yelen224.local` à la main : le rename post-création
 * peut avoir échoué (non bloquant), l'email réel peut donc différer.
 *
 * Le hashed_token retourné est à usage unique et ne doit jamais être loggé —
 * il doit être redeemé côté client via supabase.auth.verifyOtp() immédiatement.
 */
export async function mintCitoyenSessionTokenHash(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ tokenHash: string } | { error: string }> {
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.email) {
    return { error: "Impossible de récupérer le compte pour la session" };
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });

  if (error || !data?.properties?.hashed_token) {
    return { error: "Impossible de générer la session" };
  }

  return { tokenHash: data.properties.hashed_token };
}

export const CITOYEN_REMEMBER_MAX_AGE_S = TRUSTED_DEVICE_CONFIG.maxAgeS;

async function notifierNouvelAppareilSiBesoin(
  supabaseAdmin: SupabaseClient,
  citoyenId: string,
  req: NextRequest | undefined,
  evaluation: EvaluationAppareil
): Promise<void> {
  // Notifie uniquement le cas "nouvel appareil réel, pending" — ni un
  // appareil déjà connu (evaluation.connu), ni le tout premier appareil
  // du compte (statutPourNouvelleLigne === 'trusted' malgré connu=false).
  if (evaluation.connu || evaluation.statutPourNouvelleLigne !== "pending") return;

  const { data: citoyen } = await supabaseAdmin.from("users").select("prenom").eq("id", citoyenId).maybeSingle();
  const { navigateur, os } = extraireContexteRequete(req);
  const appareil = navigateur && os ? `${navigateur} sur ${os}` : navigateur || os || "un appareil";

  await envoyerNotification({
    destinataireId: citoyenId,
    destinataireType: "citoyen",
    rdvId: null,
    type: "nouvel_appareil",
    titre: salutation(citoyen?.prenom || "cher client"),
    message: `Une nouvelle connexion à votre compte a eu lieu depuis ${appareil}. Si ce n'est pas vous, changez votre code PIN et vérifiez vos appareils mémorisés depuis Sécurité.`,
  });
}

/**
 * Finalise réellement une connexion citoyen (chantier 2FA TOTP,
 * 25/07/2026) — extrait de verify/route.ts et webauthn/auth-verify/
 * route.ts pour n'avoir qu'une seule implémentation, appelée soit
 * directement (citoyen sans 2FA), soit depuis auth/totp/login-verify
 * une fois le code TOTP validé. Ne doit JAMAIS être appelée avant que
 * tous les facteurs requis (OTP ou WebAuthn, puis TOTP si activé)
 * n'aient réussi — c'est le seul endroit qui mint une vraie session et
 * pose le cookie "se souvenir de moi".
 */
export async function completerConnexionCitoyen(
  supabaseAdmin: SupabaseClient,
  citoyenId: string,
  req?: NextRequest
): Promise<{ tokenHash: string | null; remember: { rawToken: string } | null }> {
  const sessionResult = await mintCitoyenSessionTokenHash(supabaseAdmin, citoyenId);
  const tokenHash = "tokenHash" in sessionResult ? sessionResult.tokenHash : null;
  if ("error" in sessionResult) {
    console.error("[CITOYEN COMPLETER CONNEXION] Erreur mint session:", sessionResult.error);
  }
  // Une seule évaluation de l'appareil (Trusted Device, 30/08/2026),
  // partagée par la notification et l'enregistrement — avant, ces deux
  // fonctions refaisaient chacune la même requête, avec un ordre
  // sensible (notifier avant d'insérer, pour ne pas fausser la détection).
  // Logique générique dans lib/auth/trustedDevice.ts (revue critique
  // 30/08/2026, même jour — extraite pour ne plus dupliquer la même
  // implémentation entre citoyen et institution).
  const evaluation = await evaluerAppareil(supabaseAdmin, TRUSTED_DEVICE_CONFIG, citoyenId, req);
  await notifierNouvelAppareilSiBesoin(supabaseAdmin, citoyenId, req, evaluation);
  const remember = await enregistrerConnexion(supabaseAdmin, TRUSTED_DEVICE_CONFIG, citoyenId, req, evaluation);
  return { tokenHash, remember };
}

const TOTP_CHALLENGE_SECRET = new TextEncoder().encode(process.env.CITOYEN_TOTP_CHALLENGE_JWT_SECRET!);

/**
 * Jeton de défi 2FA (5 min) — émis quand le facteur principal (OTP ou
 * WebAuthn) réussit mais que totp_enabled est vrai. Secret dédié, jamais
 * partagé avec CITOYEN_WEBAUTHN_JWT_SECRET ni les secrets admin/institution.
 */
export async function mintTotpChallengeToken(citoyenId: string): Promise<string> {
  return new SignJWT({ citoyenId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setIssuer("yelen224-citoyen-totp")
    .sign(TOTP_CHALLENGE_SECRET);
}

export async function verifyTotpChallengeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, TOTP_CHALLENGE_SECRET, { issuer: "yelen224-citoyen-totp" });
    return typeof payload.citoyenId === "string" ? payload.citoyenId : null;
  } catch {
    return null;
  }
}
