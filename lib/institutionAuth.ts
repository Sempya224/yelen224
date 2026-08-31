import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMembreRole, type MembreRole } from "@/lib/institutionPermissions";

// Vérifie le cookie de session JWT institution (yelen224_institution_session,
// signé dans verify-otp / pin/verify / webauthn/auth-verify). Auparavant
// dupliqué localement dans pin/set/route.ts uniquement — la plupart des
// routes app/api/institution/*/route.ts (rdv-jour, profile) faisaient
// confiance à un institution_id de query string sans aucune vérification.
const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Durée de vie d'une session institution — miroir exact de l'expiration du
// JWT (.setExpirationTime('8h')) et de institution_sessions.expires_at.
// Constante unique (revue critique 30/08/2026 : upgrade after review — le
// littéral "8h"/28800000ms était dupliqué dans les 6 routes de connexion).
export const INSTITUTION_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const INSTITUTION_SESSION_TTL_JWT = "8h";

// Crée la ligne institution_sessions AVANT la signature du JWT (son id sert
// de claim `sid`) — même geste répété identiquement dans verify-otp,
// pin/verify, webauthn/auth-verify, totp/login-verify, membre/login,
// register avant cette extraction (revue critique 30/08/2026). `phone` est
// nullable (migration 20260830000007) : membre/login ne le connaît pas.
// `is_active` n'est plus écrit — colonne dérivable de revoked_at/expires_at,
// jamais lue, retirée par migration 20260830000008 après déploiement de ce
// code (elle existait encore côté ancien code au moment de cette écriture).
export async function creerSessionInstitution(
  sb: SupabaseClient,
  params: { institutionId: string; phone?: string | null; userAgent: string | null; ip: string | null }
): Promise<string | null> {
  const expiresAt = new Date(Date.now() + INSTITUTION_SESSION_TTL_MS).toISOString();
  const { data, error } = await sb
    .from("institution_sessions")
    .insert({
      institution_id: params.institutionId,
      phone: params.phone ?? null,
      user_agent: params.userAgent,
      ip: params.ip,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[INSTITUTION SESSIONS] Erreur création session:", error?.message);
    return null;
  }
  return data.id;
}

// Révocation par session individuelle (dette technique comblée 30/08/2026 —
// mirroring lib/adminAuth.ts::verifyAdminSession, point 7 de la mission
// Hardening Admin du même jour). Remplace l'ancien mécanisme
// institutions.session_revoked_at (GAP-04-04), qui ne pouvait révoquer qu'à
// l'échelle du compte entier — impossible de déconnecter un seul appareil.
// Le JWT institution porte désormais un claim `sid` référençant une ligne
// institution_sessions (migration 20260830000007, table réutilisée — voir
// cette migration pour le raisonnement). Toute session signée avant ce
// déploiement n'a pas de `sid` → invalide, force une reconnexion (même
// précédent que le déploiement admin_sessions le matin même).
//
// `expires_at` traité comme obligatoire malgré sa nullabilité en base
// (revue critique 30/08/2026) : une ligne sans expires_at est rejetée plutôt
// que considérée valide indéfiniment — fail-closed, pas fail-open, même si
// aujourd'hui tous les points d'écriture (creerSessionInstitution ci-dessus)
// le renseignent systématiquement. Défense en profondeur si un futur point
// d'écriture l'oublie.
async function sessionValide(sid: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("institution_sessions")
    .select("revoked_at, expires_at")
    .eq("id", sid)
    .maybeSingle();
  if (!data || data.revoked_at || !data.expires_at) return false;
  if (new Date(data.expires_at).getTime() < Date.now()) return false;
  return true;
}

// Décode + vérifie le cookie de session JWT institution — point unique
// (revue critique 30/08/2026 : upgrade after review, 3 copies quasi
// identiques du même jwtVerify réunies ici) utilisé par les 3 fonctions
// exportées ci-dessous, qui ne font que projeter des champs différents du
// même payload.
async function decoderJetonInstitution(request: NextRequest): Promise<Record<string, unknown> | null> {
  const token = request.cookies.get("yelen224_institution_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: "yelen224-institution",
      audience: "yelen224-institution-dashboard",
    });
    return payload;
  } catch {
    return null;
  }
}

export async function getAuthenticatedInstitutionId(request: NextRequest): Promise<string | null> {
  const payload = await decoderJetonInstitution(request);
  if (!payload || typeof payload.institutionId !== "string" || typeof payload.sid !== "string") return null;
  if (!(await sessionValide(payload.sid))) return null;
  return payload.institutionId;
}

// Lit uniquement le `sid` du cookie de session, sans valider la ligne
// institution_sessions — réservé aux routes qui doivent AGIR sur la session
// courante (logout, "déconnecter les autres appareils") plutôt que
// l'authentifier : cibler une session déjà expirée/révoquée pour la
// révoquer à nouveau est un no-op, pas une erreur à bloquer.
export async function getInstitutionSessionSid(request: NextRequest): Promise<string | null> {
  const payload = await decoderJetonInstitution(request);
  return payload && typeof payload.sid === "string" ? payload.sid : null;
}

export type { MembreRole };

export type AuthenticatedMembre = {
  institutionId: string;
  membreId: string;
  role: MembreRole;
};

// Lit membreId/role du même cookie/JWT que getAuthenticatedInstitutionId —
// aucun nouveau cookie. Les sessions signées avant l'ajout de ces claims
// (fondation multi-comptes, migration 20260714000001) n'ont pas membreId :
// retourne null dans ce cas, la session expire naturellement sous 8h.
export async function getAuthenticatedMembre(request: NextRequest): Promise<AuthenticatedMembre | null> {
  const payload = await decoderJetonInstitution(request);
  if (!payload) return null;
  const institutionId = payload.institutionId;
  const membreId = payload.membreId;
  const role = payload.role;
  if (typeof institutionId !== "string" || typeof membreId !== "string" || typeof role !== "string") return null;
  if (typeof payload.sid !== "string") return null;
  if (!isMembreRole(role)) return null;
  if (!(await sessionValide(payload.sid))) return null;
  return { institutionId, membreId, role };
}
