import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Source unique de vérité pour l'authentification + l'autorisation des
// routes /api/admin/*. Avant ce fichier, chaque route redéfinissait sa
// propre fonction de vérification (verifyToken/verifyAdmin/verifyAdminToken,
// ~50 copies) et sa propre liste de rôles en dur — 5 matrices différentes,
// aucune source commune (audit sécurité 08/08/2026, suite au signalement
// "Rôle admin sur /api/admin/broadcast non restreint"). middleware.ts ne
// vérifie que la signature du JWT (authentification), jamais le rôle
// (autorisation) — c'est le rôle de ce fichier.
//
// Matrice de permissions alignée sur app/admin/layout.tsx (NAV_GROUPS,
// chantier refonte admin 26/07/2026) là où un écran existe déjà pour cette
// donnée — décisions CEO du 08/08/2026 pour le reste (broadcast, export,
// recuperation). Deny-by-default : toute permission absente de cette table
// refuse tout le monde, y compris super_admin — ne jamais utiliser une
// permission qui n'y figure pas.
export const ADMIN_ROLES = ["super_admin", "moderateur", "support", "admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "admins.manage"
  | "broadcast.create"
  | "recuperation.manage"
  | "export.citoyens"
  | "export.institutions"
  | "export.rdv"
  | "export.paiements"
  | "institutions.manage"
  | "institutions.verify"
  | "institutions.suspension_appeals"
  | "activites.manage"
  | "offres.moderate"
  | "partenariats.moderate"
  | "communaute.moderate"
  | "posts.moderate"
  | "rdv.read"
  | "signalements.moderate"
  | "annonces.moderate"
  | "feedback.moderate"
  | "satisfaction.read"
  | "messagerie.access"
  | "support.access"
  | "documents_citoyen.read"
  | "citoyens.read"
  | "citoyens.verify"
  | "citoyens.rdv_restrictions"
  | "kpis.read"
  | "activity.read"
  | "search.read"
  | "notifications.count"
  | "auth_security.read"
  | "auth_security.manage"
  | "admin_entry.manage";

const ADMIN_PERMISSIONS: Record<AdminPermission, readonly AdminRole[]> = {
  "admins.manage":          ["super_admin"],
  "broadcast.create":        ["super_admin"],
  "recuperation.manage":     ["super_admin"],
  "export.citoyens":         ["super_admin"],
  "export.institutions":     ["super_admin"],
  "export.rdv":               ["super_admin", "moderateur", "admin"],
  "export.paiements":         ["super_admin", "moderateur", "admin"],
  "institutions.manage":     ["super_admin", "moderateur", "admin"],
  // Décision distincte de institutions.manage (Lot 0 Trust Model — jamais
  // un raccourci de gestion opérationnelle pour une décision de confiance).
  // Même périmètre de rôles pour l'instant, à restreindre séparément si
  // le CEO le demande — la séparation de la clé de permission est ce qui
  // compte, pas nécessairement une restriction de rôle supplémentaire.
  "institutions.verify":     ["super_admin", "moderateur", "admin"],
  // Décision de confiance distincte de institutions.manage (même principe
  // que institutions.verify ci-dessus) — décider d'une révision de
  // suspension est une décision d'appel, pas une action opérationnelle
  // courante. Chantier "Espace suspendu" v2, 17/08/2026.
  "institutions.suspension_appeals": ["super_admin", "moderateur", "admin"],
  // Chantier Taxonomie des activités (20/08/2026) — clé distincte de
  // institutions.manage/institutions.verify (même principe déjà appliqué
  // ci-dessus) : gérer le référentiel d'activités ou décider d'une
  // demande "Autre activité" n'est ni une action opérationnelle sur une
  // institution, ni une décision de confiance identité/autorité.
  "activites.manage":         ["super_admin", "moderateur", "admin"],
  "offres.moderate":          ["super_admin", "moderateur", "admin"],
  "partenariats.moderate":   ["super_admin", "moderateur", "admin"],
  // Demandes d'adhésion à Yelen Community (institutions, 23/08/2026) —
  // même palier que partenariats.moderate, même nature de décision
  // (accès à une fonctionnalité de publication publique).
  "communaute.moderate":      ["super_admin", "moderateur", "admin"],
  "posts.moderate":           ["super_admin", "moderateur", "admin"],
  "rdv.read":                  ["super_admin", "moderateur", "admin"],
  "signalements.moderate":   ["super_admin", "moderateur", "admin"],
  "annonces.moderate":        ["super_admin", "support", "admin"],
  "feedback.moderate":        ["super_admin", "support", "admin"],
  "satisfaction.read":        ["super_admin", "support", "admin"],
  "messagerie.access":        ["super_admin", "support", "admin"],
  // Chantier "Support Yelen" — ticketing citoyen↔agent humain (04/09/2026).
  // Clé distincte de messagerie.access (même principe déjà appliqué à
  // institutions.verify/activites.manage ci-dessus) : deux systèmes de
  // données séparés (support_tickets vs messages_yelen_*), même palier de
  // rôles pour l'instant.
  "support.access":           ["super_admin", "support", "admin"],
  "documents_citoyen.read":  ["super_admin", "support", "admin"],
  "citoyens.read":             ["super_admin", "admin"],
  // Décision de confiance distincte de citoyens.read (même principe que
  // institutions.verify ci-dessus) — approuver/refuser une pièce d'identité
  // est une décision de vérification, pas une consultation de fiche.
  // Chantier pipeline vérification d'identité citoyen, 28/08/2026.
  "citoyens.verify":            ["super_admin", "moderateur", "admin"],
  // Restriction automatique des rendez-vous (no-show, décision CEO
  // 03/09/2026) — même palier que institutions.suspension_appeals : décider
  // d'un appel sur une clôture de compte est une décision de confiance, pas
  // une consultation de fiche (citoyens.read).
  "citoyens.rdv_restrictions":  ["super_admin", "moderateur", "admin"],
  "kpis.read":                  ["super_admin", "admin"],
  "activity.read":              ["super_admin", "moderateur", "support", "admin"],
  // Restreint à super_admin+admin (audit sécurité 14/09/2026, GAP-05-02) —
  // la recherche globale expose nom/prénom/téléphone de n'importe quel
  // citoyen (app/api/admin/search/route.ts), alors que citoyens.read
  // (fiche citoyen complète) est déjà volontairement restreinte à ce même
  // palier. Élargir de nouveau à moderateur/support nécessiterait une
  // recherche séparée, scopée à support.access, pas la réouverture de
  // celle-ci.
  "search.read":                ["super_admin", "admin"],
  "notifications.count":       ["super_admin", "moderateur", "support", "admin"],
  // Chantier Auth Security (28/08/2026) — visibilité des appareils/IP
  // bloqués et déblocage manuel. Même palier que recuperation.manage/
  // broadcast.create/logs système (super_admin seul) : ces données
  // couvrent l'ensemble des citoyens et institutions, pas un périmètre
  // opérationnel délégable.
  "auth_security.read":         ["super_admin"],
  "auth_security.manage":       ["super_admin"],
  // Admin Entry Security V2, Lot 3 (30/08/2026) — enrôlement/révocation des
  // credentials WebAuthn d'entrée (admin_entry_webauthn_credentials).
  // super_admin seul, même palier que auth_security.manage : ajouter un
  // credential capable d'ouvrir la porte /admin/login est une décision de
  // sécurité du même ordre qu'un déblocage anti-abus manuel.
  "admin_entry.manage":         ["super_admin"],
};

// reauthAt ajouté (revue critique 30/08/2026) — porté par la session
// depuis la même lecture admin_sessions que verifyAdminSession fait déjà,
// pour que verifyRecentReauth n'ait plus besoin de re-requêter la même
// ligne juste après.
export type AdminSession = { adminId: string; email: string; role: AdminRole; nom: string; sid: string; reauthAt: string | null };

export class AdminAuthError extends Error {
  status: 401 | 403;
  code: string;
  constructor(status: 401 | 403, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!);

// Fenêtre d'inactivité (Mission Hardening Admin, point 7, 30/08/2026) —
// distincte de l'expiration absolue de 8h (miroir de l'exp du JWT,
// admin_sessions.expires_at) : une session inactive depuis plus de 60 min
// est traitée comme expirée même si son JWT reste signé et non expiré.
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

// Fenêtre de réauthentification récente (point 5) — voir
// verifyRecentReauth ci-dessous, utilisée par les routes d'actions
// critiques (création/modification/suppression d'admin, export,
// déblocage sécurité).
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

// Authentification seule (pas de contrôle de rôle) — réservé aux routes
// self-scoped où l'action porte uniquement sur le compte de l'admin
// connecté (auth/me, change-password, 2fa/*).
//
// Révocation par session (Mission Hardening Admin, point 7, 30/08/2026 —
// remplace le mécanisme "tout le compte" de GAP-04-04/13/08) : le JWT
// porte un claim `sid` référençant une ligne admin_sessions. Un JWT
// signé et non expiré ne suffit plus — la session doit aussi exister,
// ne pas être révoquée, ne pas avoir dépassé son expiration absolue, et
// ne pas être inactive depuis plus d'une heure. Coût : une lecture +
// une écriture DB (clé primaire indexée) à chaque appel authentifié —
// accepté, c'est le prix d'une révocation/inactivité réelles sur un JWT
// par ailleurs stateless.
export async function verifyAdminSession(request: NextRequest): Promise<AdminSession> {
  const token = request.cookies.get("yelen224_admin_session")?.value;
  if (!token) throw new AdminAuthError(401, "NO_SESSION");
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, JWT_SECRET, {
      issuer: "yelen224-admin",
      audience: "yelen224-admin-dashboard",
    });
    payload = verified.payload;
  } catch {
    throw new AdminAuthError(401, "INVALID_SESSION");
  }

  const session = payload as unknown as AdminSession;
  if (typeof session.sid !== "string") throw new AdminAuthError(401, "INVALID_SESSION");

  const { data: sessionRow } = await supabaseAdmin
    .from("admin_sessions")
    .select("id, revoked_at, expires_at, last_seen_at, reauth_at")
    .eq("id", session.sid)
    .maybeSingle();

  const maintenant = Date.now();
  if (
    !sessionRow ||
    sessionRow.revoked_at ||
    new Date(sessionRow.expires_at).getTime() < maintenant ||
    new Date(sessionRow.last_seen_at).getTime() + INACTIVITY_TIMEOUT_MS < maintenant
  ) {
    throw new AdminAuthError(401, "SESSION_REVOKED");
  }

  // Non bloquant pour la réponse — la fraîcheur de last_seen_at n'a pas
  // besoin de retarder la requête en cours, seulement d'être à jour pour
  // la PROCHAINE vérification.
  void supabaseAdmin.from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.sid);

  return { ...session, reauthAt: sessionRow.reauth_at };
}

// Authentification + autorisation. Deny-by-default : un rôle absent de la
// liste de la permission (y compris un rôle valide mais non listé) est
// refusé.
//
// Journalisation des refus (Mission Hardening Admin, point 9, 30/08/2026)
// — centralisée ici plutôt que dans les ~90 routes appelantes : "tentative
// d'accès admin refusée" est exactement ce que ADMIN_PERMISSIONS rejette.
// Non bloquant (void) — un échec de journalisation ne doit jamais
// empêcher le 403 de partir.
export async function authorizeAdmin(request: NextRequest, permission: AdminPermission): Promise<AdminSession> {
  const session = await verifyAdminSession(request);
  const allowedRoles = ADMIN_PERMISSIONS[permission];
  if (!allowedRoles.includes(session.role)) {
    void supabaseAdmin.from("admin_logs").insert({
      admin_id: session.adminId,
      action: "ACCES_REFUSE",
      details: { permission, role: session.role },
    });
    throw new AdminAuthError(403, "FORBIDDEN");
  }
  return session;
}

// Réauthentification récente (Mission Hardening Admin, point 5,
// 30/08/2026) — pour les actions critiques (création/modification/
// suppression d'un compte admin, export de données sensibles, déblocage
// d'une protection sécurité). Une session valide ne suffit plus : le
// compte doit avoir reconfirmé son mot de passe (+ TOTP si actif) via
// /api/admin/auth/reauth dans les REAUTH_WINDOW_MS dernières minutes.
//
// Lit `session.reauthAt` (revue critique 30/08/2026 — avant, cette
// fonction refaisait une lecture admin_sessions séparée juste après celle
// de verifyAdminSession sur la même ligne ; reauthAt est maintenant porté
// par la session depuis cette même lecture, requête redondante éliminée).
// reauth/route.ts fait tourner le sid (nouvelle ligne admin_sessions +
// ancienne révoquée + cookie réémis) : cette fonction n'est jamais
// appelée avec un objet AdminSession mis en cache entre deux requêtes —
// chaque requête relit son propre `session` via
// verifyAdminSession()/authorizeAdmin() juste avant, qui décode le cookie
// courant (donc le sid et le reauthAt à jour après une rotation).
export function verifyRecentReauth(session: AdminSession): void {
  if (!session.reauthAt || Date.now() - new Date(session.reauthAt).getTime() > REAUTH_WINDOW_MS) {
    throw new AdminAuthError(403, "REAUTH_REQUIRED");
  }
}

export function adminAuthErrorResponse(err: unknown): NextResponse {
  if (err instanceof AdminAuthError) {
    // `code` ajouté (30/08/2026, Mission Hardening Admin) — sans lui, le
    // frontend ne pouvait pas distinguer REAUTH_REQUIRED (redemander le
    // mot de passe) d'un FORBIDDEN classique (aucune action utile côté
    // client), les deux rendant le même message générique "Accès refusé".
    return NextResponse.json(
      { error: err.status === 401 ? "Non autorisé" : "Accès refusé", code: err.code },
      { status: err.status }
    );
  }
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}
