import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────
// OTP citoyen — durcissement 25/07/2026 (faille prioritaire : la plateforme
// vise des ministres/administrations, "quelqu'un ne doit jamais pouvoir se
// connecter juste en connaissant le numéro").
//
// Avant : comparaison à une constante fixe "123456", visible dans le code
// source ET affichée en clair à l'écran sur /inscription. Maintenant : un
// code réellement généré par tentative, haché (bcrypt), à usage unique
// (consommé qu'il soit juste ou faux — une seule tentative possible par
// code, il faut en redemander un nouveau sinon), expirant après 5 minutes.
//
// Aucun fournisseur SMS n'est encore branché (voir CLAUDE.md — action
// requise de Bryan). Tant que SMS_PROVIDER n'est pas défini, envoyerOtp()
// n'envoie rien de réel : le code réellement stocké/vérifié est
// CITOYEN_OTP_FALLBACK, une variable d'environnement serveur — jamais une
// valeur en dur dans le code, jamais envoyée au client, jamais affichée à
// l'écran. Si cette variable n'est pas définie, la connexion échoue
// explicitement plutôt que de retomber silencieusement sur une valeur
// devinable : Bryan doit la définir (localement ET sur Netlify) pour
// continuer à se connecter pendant que Nimba SMS n'est pas branché.
// ─────────────────────────────────────────────────────────────────────────

const OTP_TTL_MS = 5 * 60 * 1000;

// crypto.randomInt (CSPRNG), pas Math.random() — audit sécurité 14/09/2026,
// même correctif déjà appliqué côté institution (send-otp/route.ts) lors du
// durcissement du 13/08/2026, manqué ici côté citoyen.
function genererCode6Chiffres(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Génère un OTP pour ce citoyen, le hache et le stocke, puis "l'envoie"
 * (adaptateur SMS — no-op réel tant qu'aucun SMS_PROVIDER n'est configuré).
 * Lève une erreur explicite si ni un fournisseur SMS ni CITOYEN_OTP_FALLBACK
 * ne sont configurés : jamais de repli silencieux sur une valeur en dur.
 */
export async function genererEtEnvoyerOtp(
  sb: SupabaseClient,
  userId: string,
  phone: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = process.env.SMS_PROVIDER; // ex. "nimba" — pas encore branché

  let code: string;
  if (provider) {
    // TODO(Bryan) : brancher l'envoi réel ici (Nimba SMS ou autre) une fois
    // le compte/la clé API créés. Le code doit être généré ici (aléatoire),
    // jamais réutilisé d'un fournisseur à l'autre.
    code = genererCode6Chiffres();
    // await envoyerSmsNimba(phone, code); // à implémenter avec Bryan
    console.warn("[otp] SMS_PROVIDER défini mais aucun adaptateur d'envoi réel implémenté — code non délivré au citoyen.");
  } else {
    const fallback = process.env.CITOYEN_OTP_FALLBACK;
    if (!fallback) {
      return { ok: false, error: "OTP non configuré côté serveur (CITOYEN_OTP_FALLBACK manquant)." };
    }
    code = fallback;
  }

  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error } = await sb.from("users").update({ otp_code_hash: codeHash, otp_expires_at: expiresAt }).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  void phone; // conservé dans la signature pour l'envoi SMS réel à venir
  return { ok: true };
}

/**
 * Vérifie le code fourni contre le hash stocké pour ce citoyen. Consomme
 * TOUJOURS le code (le remet à null) après cette tentative, qu'elle soit
 * juste ou fausse — une seule tentative possible par code envoyé, c'est le
 * comportement demandé par Bryan (pas de 2e essai contre le même code).
 */
export async function verifierOtp(
  sb: SupabaseClient,
  userId: string,
  code: string
): Promise<{ ok: true } | { ok: false; reason: "aucun_code" | "expire" | "incorrect" }> {
  const { data: row } = await sb.from("users").select("otp_code_hash, otp_expires_at").eq("id", userId).maybeSingle();
  const hash = row?.otp_code_hash as string | null | undefined;
  const expiresAt = row?.otp_expires_at as string | null | undefined;

  // Un seul essai par code, correct ou non : on le consomme immédiatement.
  await sb.from("users").update({ otp_code_hash: null, otp_expires_at: null }).eq("id", userId);

  if (!hash || !expiresAt) return { ok: false, reason: "aucun_code" };
  if (new Date(expiresAt).getTime() < Date.now()) return { ok: false, reason: "expire" };

  const valide = await bcrypt.compare(code, hash);
  if (!valide) return { ok: false, reason: "incorrect" };
  return { ok: true };
}
