import { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import type { MembreRole } from "@/lib/institutionPermissions";

// Session dédiée à YELEN Accueil (check-in mobile, voir
// docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md) — cookie, secret,
// issuer/audience distincts de yelen224_institution_session
// (lib/institutionAuth.ts). Un JWT institution valide ne peut
// structurellement pas être accepté ici, et inversement : cette session
// ne doit JAMAIS donner accès à une route du dashboard.
const JWT_SECRET = new TextEncoder().encode(process.env.CHECKIN_JWT_SECRET!);
const ISSUER = "yelen224-checkin";
const AUDIENCE = "yelen224-checkin-mobile";

export const CHECKIN_COOKIE_NAME = "yelen224_checkin_session";
// 8h maximum, non glissant (arbitrage Bryan 13/09/2026) — indépendant de
// l'activité, contrairement au verrou d'inactivité ci-dessous.
export const CHECKIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const CHECKIN_SESSION_TTL_JWT = "8h";
// Verrouillage d'écran après 2 min d'inactivité (arbitrage Bryan) —
// déverrouillable par PIN seul tant que la session (8h) n'a pas expiré.
export const CHECKIN_INACTIVITY_LOCK_MS = 2 * 60 * 1000;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function creerSessionCheckin(params: {
  membreId: string; institutionId: string; userAgent: string | null; ip: string | null;
}): Promise<string | null> {
  const expiresAt = new Date(Date.now() + CHECKIN_SESSION_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("checkin_sessions")
    .insert({
      membre_id: params.membreId,
      institution_id: params.institutionId,
      user_agent: params.userAgent,
      ip: params.ip,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[CHECKIN SESSIONS] Erreur création session:", error?.message);
    return null;
  }
  return data.id;
}

export async function signerJetonCheckin(params: { institutionId: string; membreId: string; sid: string }): Promise<string> {
  return await new SignJWT({ institutionId: params.institutionId, membreId: params.membreId, sid: params.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.institutionId)
    .setIssuedAt()
    .setExpirationTime(CHECKIN_SESSION_TTL_JWT)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(JWT_SECRET);
}

// ─── Badge QR Agent (revirement produit 13/09/2026) ─────────────────────
// Identification (scan du badge) ≠ authentification (PIN) — le badge seul
// ne donne jamais accès à une session, il ne fait que produire un
// challengeToken de très courte durée que app/api/checkin/auth échange
// ensuite contre un PIN valide. Voir docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md.

// Issuer/audience distincts de la session réelle (ISSUER/AUDIENCE
// ci-dessus) — un challengeToken ne doit structurellement jamais pouvoir
// être accepté par getEtatSessionCheckin, et inversement.
const DEFI_ISSUER = "yelen224-checkin-defi";
const DEFI_AUDIENCE = "yelen224-checkin-defi-pin";
const DEFI_TTL = "2m";

export function hashAgentQrToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function genererTokenAgentQr(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashAgentQrToken(token) };
}

export async function signerDefiCheckin(params: { membreId: string; institutionId: string }): Promise<string> {
  return await new SignJWT({ membreId: params.membreId, institutionId: params.institutionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(DEFI_TTL)
    .setIssuer(DEFI_ISSUER)
    .setAudience(DEFI_AUDIENCE)
    .sign(JWT_SECRET);
}

export async function verifierDefiCheckin(token: string): Promise<{ membreId: string; institutionId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: DEFI_ISSUER, audience: DEFI_AUDIENCE });
    const membreId = payload.membreId;
    const institutionId = payload.institutionId;
    if (typeof membreId !== "string" || typeof institutionId !== "string") return null;
    return { membreId, institutionId };
  } catch {
    return null;
  }
}

export type EtatSessionCheckin =
  | { etat: "absente" }
  | { etat: "invalide" }
  | { etat: "verrouillee"; ctx: ContexteCheckin }
  | { etat: "ok"; ctx: ContexteCheckin };

export type ContexteCheckin = { institutionId: string; membreId: string; sid: string };

async function decoderJetonCheckin(request: NextRequest): Promise<ContexteCheckin | null> {
  const token = request.cookies.get(CHECKIN_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: ISSUER, audience: AUDIENCE });
    const institutionId = payload.institutionId;
    const membreId = payload.membreId;
    const sid = payload.sid;
    if (typeof institutionId !== "string" || typeof membreId !== "string" || typeof sid !== "string") return null;
    return { institutionId, membreId, sid };
  } catch {
    return null;
  }
}

// Lecture seule — n'authentifie PAS le rôle/permission (voir
// chargerMembreCheckinActif ci-dessous, à revérifier fraîchement en base
// à chaque appel critique : un rôle/statut modifié après l'émission du JWT
// ne doit jamais rester valide jusqu'à expiration de la session de 8h).
export async function getEtatSessionCheckin(request: NextRequest): Promise<EtatSessionCheckin> {
  const ctx = await decoderJetonCheckin(request);
  if (!ctx) return { etat: "absente" };

  const { data } = await supabaseAdmin
    .from("checkin_sessions")
    .select("revoked_at, expires_at, last_activity_at")
    .eq("id", ctx.sid)
    .maybeSingle();
  if (!data || data.revoked_at || !data.expires_at) return { etat: "invalide" };
  if (new Date(data.expires_at).getTime() < Date.now()) return { etat: "invalide" };

  const inactifDepuisMs = Date.now() - new Date(data.last_activity_at).getTime();
  return inactifDepuisMs > CHECKIN_INACTIVITY_LOCK_MS ? { etat: "verrouillee", ctx } : { etat: "ok", ctx };
}

export async function toucherActiviteCheckin(sid: string): Promise<void> {
  await supabaseAdmin.from("checkin_sessions").update({ last_activity_at: new Date().toISOString() }).eq("id", sid);
}

export async function revoquerSessionCheckin(sid: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from("checkin_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", sid);
}

// Source de vérité fraîche pour l'autorisation (jamais le rôle embarqué
// dans le JWT, qui peut dater de plusieurs heures) — utilisée par chaque
// route /api/checkin/* qui exécute une action réelle (scan, confirmation,
// unlock). `can()` est appelé par l'appelant, pas ici, pour garder cette
// fonction indépendante de la clé ActionKey précise vérifiée.
export async function chargerMembreCheckinActif(params: { membreId: string; institutionId: string }): Promise<{ role: MembreRole } | null> {
  const { data } = await supabaseAdmin
    .from("institution_membres")
    .select("role, actif, institution_id")
    .eq("id", params.membreId)
    .maybeSingle();
  if (!data || !data.actif || data.institution_id !== params.institutionId) return null;
  return { role: data.role as MembreRole };
}

export { supabaseAdmin as checkinSupabaseAdmin };
