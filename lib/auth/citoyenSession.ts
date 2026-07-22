import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { extraireContexteRequete } from "@/lib/journalActivite";

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

export const CITOYEN_REMEMBER_MAX_AGE_S = 60 * 24 * 60 * 60; // 60 jours, comme institution_remember_tokens

/**
 * Lot D (chantier sécurité citoyen) — émet un vrai "se souvenir de moi"
 * avec bypass, mirroring institution_remember_tokens/verify-otp. Réutilise
 * `extraireContexteRequete` de lib/journalActivite.ts (Lot A du Journal
 * d'activité) plutôt que reparser le user-agent.
 *
 * Contrairement à la première version de ce lot (qui n'émettait aucun
 * cookie, en s'appuyant sur la persistance native de la session Supabase
 * Auth) : Bryan a tranché que ce token doit être un vrai mécanisme de
 * bypass, comme côté institution — le token brut est donc renvoyé à
 * l'appelant pour être posé en cookie httpOnly. Il ne redonne PAS de
 * session à lui seul (voir remember/check/route.ts : il ne fait
 * qu'identifier le compte pour proposer un déverrouillage rapide
 * PIN/biométrie), exactement comme le cookie institution ne fait
 * qu'indiquer quel écran de déverrouillage rapide afficher.
 *
 * Insert non-bloquant : une erreur ici ne doit jamais faire échouer la
 * connexion (même esprit que enregistrerAction dans lib/journalActivite.ts).
 */
export async function enregistrerConnexionCitoyen(
  supabaseAdmin: SupabaseClient,
  citoyenId: string,
  req?: NextRequest
): Promise<{ rawToken: string } | null> {
  const { ip, userAgent, navigateur, os } = extraireContexteRequete(req);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const deviceLabel = navigateur && os ? `${navigateur} sur ${os}` : navigateur || os || null;
  const expiresAt = new Date(Date.now() + CITOYEN_REMEMBER_MAX_AGE_S * 1000).toISOString();

  const { error } = await supabaseAdmin.from("citoyen_remember_tokens").insert({
    citoyen_id: citoyenId,
    token_hash: tokenHash,
    user_agent: userAgent,
    ip,
    device_label: deviceLabel,
    expires_at: expiresAt,
  });
  if (error) {
    console.error("[CITOYEN REMEMBER TOKEN] Erreur insertion:", error.message);
    return null;
  }
  return { rawToken };
}
