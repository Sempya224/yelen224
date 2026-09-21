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
// `membreId` (16/09/2026, revue finale) — optionnel : renseigné dès que
// l'identité du membre est connue à la création (tous les flux sauf les 3
// connexions institution-wide sans membre_principal), pour permettre une
// révocation ciblée (voir revoquerSessionsMembre) plutôt que "toute
// l'institution" ou "rien".
export async function creerSessionInstitution(
  sb: SupabaseClient,
  params: { institutionId: string; phone?: string | null; userAgent: string | null; ip: string | null; membreId?: string | null }
): Promise<string | null> {
  const expiresAt = new Date(Date.now() + INSTITUTION_SESSION_TTL_MS).toISOString();
  const { data, error } = await sb
    .from("institution_sessions")
    .insert({
      institution_id: params.institutionId,
      membre_id: params.membreId ?? null,
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

// Révocation ciblée d'UN membre précis (16/09/2026, revue finale) —
// distincte de revoquerAutresSessionsInstitution (qui révoque TOUTE
// l'institution sauf la session appelante, pour un changement de PIN/2FA
// personnel). Ici l'inverse : révoquer PRÉCISÉMENT les sessions d'un
// membre, sans toucher aux autres membres de l'équipe — appelée quand un
// admin change le rôle, désactive, supprime, ou réinitialise le PIN d'un
// AUTRE membre, pour que la promesse déjà affichée dans l'UI Équipe ("perd
// l'accès immédiatement") soit réellement vraie plutôt qu'un délai de 8h.
export async function revoquerSessionsMembre(
  sb: SupabaseClient,
  membreId: string,
  reason: string
): Promise<void> {
  const { error } = await sb
    .from("institution_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("membre_id", membreId)
    .is("revoked_at", null);
  if (error) console.error(`[INSTITUTION SESSIONS] Erreur révocation membre (${reason}):`, error.message);
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
type SessionRow = { revoked_at: string | null; expires_at: string | null; reauth_at: string | null };

async function chargerSession(sid: string): Promise<SessionRow | null> {
  const { data } = await supabaseAdmin
    .from("institution_sessions")
    .select("revoked_at, expires_at, reauth_at")
    .eq("id", sid)
    .maybeSingle();
  return data ?? null;
}

function sessionEstValide(row: SessionRow | null): boolean {
  if (!row || row.revoked_at || !row.expires_at) return false;
  return new Date(row.expires_at).getTime() >= Date.now();
}

// Fenêtre de réauthentification récente (moteur de réauth pour actions
// sensibles, 16/09/2026) — mirroring lib/adminAuth.ts::REAUTH_WINDOW_MS.
// Une action sensible exige que reauth_at date de moins de 10 minutes ;
// au-delà, la route appelante doit renvoyer REAUTH_REQUIRED plutôt que
// d'exécuter l'action.
export const INSTITUTION_REAUTH_WINDOW_MS = 10 * 60 * 1000;

// Typé structurellement sur { reauthAt } plutôt que sur AuthenticatedMembre
// précisément — accepte aussi bien un AuthenticatedMembre qu'une session
// institution-wide sans membreId (voir getAuthenticatedInstitutionSession
// ci-dessous), qui a elle aussi un reauth_at propre sur institution_sessions.
export function estReauthRecente(session: { reauthAt: string | null }): boolean {
  return !!session.reauthAt && Date.now() - new Date(session.reauthAt).getTime() <= INSTITUTION_REAUTH_WINDOW_MS;
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

export type AuthenticatedInstitutionSession = { institutionId: string; sid: string; reauthAt: string | null };

// Session institution SANS identité de membre précise — nécessaire pour les
// routes "compte principal" (register-options/verify WebAuthn, PIN
// institution-wide) qui doivent rester utilisables même quand
// institution_membres n'a PAS ENCORE de ligne compte_principal=true : les 3
// flux qui émettent un institutionId sans membreId (verify-otp, pin/verify,
// webauthn/auth-verify) n'incluent ce claim QUE si un membre_principal
// existe déjà en base au moment du login (voir ces 3 routes) — une session
// avec institutionId mais SANS membreId ne peut donc, par construction,
// avoir été émise que par un de ces 3 flux, jamais par membre/login (qui
// inclut toujours membreId puisqu'il authentifie une ligne
// institution_membres précise). Traiter cette session comme appartenant au
// propriétaire réel de l'institution est donc sûr, pas un contournement.
export async function getAuthenticatedInstitutionSession(request: NextRequest): Promise<AuthenticatedInstitutionSession | null> {
  const payload = await decoderJetonInstitution(request);
  if (!payload || typeof payload.institutionId !== "string" || typeof payload.sid !== "string") return null;
  const sessionRow = await chargerSession(payload.sid);
  if (!sessionEstValide(sessionRow)) return null;
  return { institutionId: payload.institutionId, sid: payload.sid, reauthAt: sessionRow!.reauth_at };
}

export async function getAuthenticatedInstitutionId(request: NextRequest): Promise<string | null> {
  const session = await getAuthenticatedInstitutionSession(request);
  return session?.institutionId ?? null;
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

// Révoque toutes les sessions institution_sessions actives d'un compte, à
// l'EXCEPTION de currentSid — point unique (revue sécurité 08/09/2026,
// bug réel trouvé en prod) remplaçant 2 copies dupliquées dans pin/set et
// totp/disable qui révoquaient AUSSI la session appelante. Conséquence
// concrète du bug : "Configurer l'accès rapide" (juste après un premier
// login) enchaîne pin/set puis redirige vers le dashboard avec ce même
// cookie — pin/set le révoquait au passage, provoquant un faux "session
// expirée" immédiat, avant même d'avoir affiché la moindre donnée.
//
// Exclure la session courante d'une révocation "changement d'identifiant
// de sécurité" est le comportement standard (Google, GitHub...) et ne
// dégrade jamais la sécurité réelle : la session qui appelle cette route
// vient de PROUVER sa légitimité (ancien PIN correct, code TOTP valide...).
// Dans le seul scénario où ce serait un attaquant, c'est lui qui tient la
// session courante — l'exclure ne change rien à son accès (il reste
// connecté dans les deux cas), alors que l'inclure ne pénalise que
// l'utilisateur légitime. `remember/revoke-all` avait déjà ce
// raisonnement correctement implémenté ; c'est désormais la même fonction
// partagée pour les 3 endpoints (pin/set, totp/disable, remember/revoke-all).
export async function revoquerAutresSessionsInstitution(
  sb: SupabaseClient,
  institutionId: string,
  currentSid: string | null,
  reason: string
): Promise<void> {
  let query = sb
    .from("institution_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("institution_id", institutionId)
    .is("revoked_at", null);
  if (currentSid) query = query.neq("id", currentSid);
  const { error } = await query;
  if (error) console.error(`[INSTITUTION SESSIONS] Erreur révocation (${reason}):`, error.message);
}

export type { MembreRole };

export type AuthenticatedMembre = {
  institutionId: string;
  membreId: string;
  role: MembreRole;
  sid: string;
  reauthAt: string | null;
  // Rôles personnalisés (16/09/2026) — domaines retirés au rôle de base,
  // transportés dans le JWT (comme `role`) plutôt que relus en base à
  // chaque requête : rafraîchi au prochain login, forcé immédiatement par
  // revoquerSessionsMembre quand un admin modifie la liste (voir
  // app/api/institution/membres/route.ts). Absent sur les JWT signés avant
  // ce claim → toujours null, jamais bloquant.
  accesRestreints: string[] | null;
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
  const sessionRow = await chargerSession(payload.sid);
  if (!sessionEstValide(sessionRow)) return null;
  const accesRestreints = Array.isArray(payload.accesRestreints)
    ? payload.accesRestreints.filter((v): v is string => typeof v === "string")
    : null;
  return { institutionId, membreId, role, sid: payload.sid, reauthAt: sessionRow!.reauth_at, accesRestreints };
}

// Yelen Security Activation (16/09/2026) — décision Bryan : après le sas de
// confiance de première connexion, l'utilisateur découvre d'abord son
// dashboard ; une activation MFA (TOTP OU Passkey, au choix) devient
// obligatoire 24h après cette première connexion, sous peine de blocage du
// dashboard (jamais une suspension du compte — réversible dès activation).
// Volontairement DÉRIVÉ, aucune nouvelle colonne : relation_confirmee_le
// (posée par /api/institution/auth/premiere-connexion) sert d'ancre à
// l'échéance, totp_enabled/institution_webauthn_credentials existent déjà.
// `relation_confirmee_le` null (compte_principal, ou tout membre créé avant
// ce chantier) = jamais concerné, fail-open par construction — jamais un
// compte existant bloqué rétroactivement par une fonctionnalité qu'il n'a
// jamais vue.
export const SECURITY_ACTIVATION_DELAI_MS = 24 * 60 * 60 * 1000;

export type ActivationSecurite = {
  requise: boolean;
  bloque: boolean;
  deadline: string | null;
  totpActif: boolean;
  passkeyActive: boolean;
};

export async function evaluerActivationSecurite(sb: SupabaseClient, membreId: string): Promise<ActivationSecurite> {
  const [{ data: moi }, { count: nbPasskeys }] = await Promise.all([
    sb.from("institution_membres").select("relation_confirmee_le,totp_enabled").eq("id", membreId).maybeSingle(),
    sb.from("institution_webauthn_credentials").select("id", { count: "exact", head: true }).eq("membre_id", membreId),
  ]);

  const totpActif = !!moi?.totp_enabled;
  const passkeyActive = (nbPasskeys ?? 0) > 0;
  if (!moi?.relation_confirmee_le || totpActif || passkeyActive) {
    return { requise: false, bloque: false, deadline: null, totpActif, passkeyActive };
  }

  const deadline = new Date(new Date(moi.relation_confirmee_le).getTime() + SECURITY_ACTIVATION_DELAI_MS).toISOString();
  return { requise: true, bloque: Date.now() > new Date(deadline).getTime(), deadline, totpActif, passkeyActive };
}
