import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { extraireContexteRequete } from "@/lib/journalActivite";

// ─────────────────────────────────────────────────────────────────────────
// Trusted Device (Mission 30/08/2026, brief CEO) — logique générique
// partagée entre citoyen et institution, extraite (revue critique du même
// jour) : lib/auth/citoyenSession.ts et lib/auth/institutionSession.ts
// portaient chacun une copie quasi identique (même état trusted/pending,
// même promotion automatique, même limite assumée sur le cookie perdu),
// ne différant que par le nom de table/colonne id/cookie. Même pattern de
// paramétrage que lib/security/authSecurity.ts::tableEtColonne (device
// vs ip) — dynamique par config plutôt que dupliqué par domaine.
//
// - Cookie valide pointant vers une ligne non révoquée de CETTE entité →
//   appareil déjà connu. S'il était 'pending', une reconnexion réussie
//   depuis le même appareil est un signal suffisant pour le promouvoir
//   'trusted' (pas de notification, pas de nouvelle ligne).
// - Pas de cookie valide, mais au moins une ligne 'trusted' existe déjà
//   pour cette entité → nouvel appareil réel. Statut 'pending'.
// - Aucune ligne 'trusted' existante (tout premier appareil, ou tous les
//   précédents ont été révoqués) → 'trusted' direct, silence (pas de
//   bruit à la création de compte ni après une purge volontaire).
//
// Limite assumée (inchangée) : un cookie perdu (vidage navigateur,
// navigation privée) sur un appareil pourtant déjà utilisé sera reclassé
// "nouvel appareil" — comportement standard de ce type de détection par
// cookie.
// ─────────────────────────────────────────────────────────────────────────

export type TrustedDeviceConfig = {
  table: "citoyen_remember_tokens" | "institution_remember_tokens";
  idColumn: "citoyen_id" | "institution_id";
  cookieName: string;
  maxAgeS: number;
};

export type EvaluationAppareil = { connu: boolean; statutPourNouvelleLigne: "trusted" | "pending" };

export async function evaluerAppareil(
  sb: SupabaseClient,
  config: TrustedDeviceConfig,
  entiteId: string,
  req?: NextRequest
): Promise<EvaluationAppareil> {
  const rawToken = req?.cookies.get(config.cookieName)?.value;
  if (rawToken) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const { data: existing } = await sb
      .from(config.table)
      .select(`id, ${config.idColumn}, status, expires_at`)
      .eq("token_hash", tokenHash)
      .maybeSingle<{ id: string; status: string; expires_at: string; [key: string]: unknown }>();
    if (
      existing && existing[config.idColumn] === entiteId &&
      existing.status !== "revoked" && new Date(existing.expires_at) > new Date()
    ) {
      if (existing.status === "pending") {
        await sb.from(config.table).update({ status: "trusted" }).eq("id", existing.id);
      }
      return { connu: true, statutPourNouvelleLigne: "trusted" };
    }
  }
  const { count } = await sb
    .from(config.table)
    .select("id", { count: "exact", head: true })
    .eq(config.idColumn, entiteId)
    .eq("status", "trusted");
  const aDejaUnAppareilTrusted = (count ?? 0) > 0;
  return { connu: false, statutPourNouvelleLigne: aDejaUnAppareilTrusted ? "pending" : "trusted" };
}

export async function enregistrerConnexion(
  sb: SupabaseClient,
  config: TrustedDeviceConfig,
  entiteId: string,
  req: NextRequest | undefined,
  evaluation: EvaluationAppareil
): Promise<{ rawToken: string } | null> {
  if (evaluation.connu) return null; // appareil déjà mémorisé — pas de nouvelle ligne, cookie existant réutilisé côté client

  const { ip, userAgent, navigateur, os, plateforme } = extraireContexteRequete(req);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const deviceLabel = navigateur && os ? `${navigateur} sur ${os}` : navigateur || os || null;
  const expiresAt = new Date(Date.now() + config.maxAgeS * 1000).toISOString();

  const { error } = await sb.from(config.table).insert({
    [config.idColumn]: entiteId,
    token_hash: tokenHash,
    user_agent: userAgent,
    ip,
    device_label: deviceLabel,
    device_type: plateforme,
    status: evaluation.statutPourNouvelleLigne,
    expires_at: expiresAt,
  });
  if (error) {
    console.error(`[TRUSTED DEVICE ${config.table}] Erreur insertion:`, error.message);
    return null;
  }
  return { rawToken };
}
