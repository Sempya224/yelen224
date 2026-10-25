import type { SupabaseClient } from "@supabase/supabase-js";
import { preparerOtp, comparerOtp } from "@/lib/auth/otp";

// ─────────────────────────────────────────────────────────────────────────
// OTP de la réservation invité (ADR-001 E0.1, design A). Le code est lié au
// seul numéro, dans invite_phone_verifications : aucune ligne users /
// auth.users n'existe tant que la vérification n'a pas réussi. Mêmes
// garanties que lib/auth/otp.ts (hash bcrypt, CSPRNG, TTL 5 min, usage
// unique) — la génération et la comparaison sont partagées, seul le
// stockage diffère.
// ─────────────────────────────────────────────────────────────────────────

const TABLE = "invite_phone_verifications";

/**
 * Émet un code pour ce numéro. Un seul code actif par numéro (PK = phone) :
 * un nouvel envoi remplace le précédent.
 */
export async function envoyerOtpInvite(
  sb: SupabaseClient,
  phone: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const otp = await preparerOtp(phone);
  if (!otp.ok) return otp;

  const { error } = await sb.from(TABLE).upsert(
    { phone, otp_code_hash: otp.codeHash, otp_expires_at: otp.expiresAt, created_at: new Date().toISOString() },
    { onConflict: "phone" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Vérifie le code et le consomme. La ligne est supprimée par un DELETE ...
 * RETURNING unique : deux requêtes concurrentes avec le même code ne
 * peuvent pas toutes les deux le lire (rejeu impossible, test 5 de l'ADR).
 * Consommé qu'il soit juste ou faux, comme verifierOtp().
 */
export async function verifierOtpInvite(
  sb: SupabaseClient,
  phone: string,
  code: string
): Promise<{ ok: true } | { ok: false; reason: "aucun_code" | "expire" | "incorrect" }> {
  const { data } = await sb
    .from(TABLE)
    .delete()
    .eq("phone", phone)
    .select("otp_code_hash, otp_expires_at")
    .maybeSingle();

  return comparerOtp(
    data?.otp_code_hash as string | null | undefined,
    data?.otp_expires_at as string | null | undefined,
    code
  );
}
