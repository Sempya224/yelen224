import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extraireIpClient, logSecurite } from "@/lib/edgeSecurity";

// ─────────────────────────────────────────────────────────────────────────
// Auth Security — module central anti-abus (brief CEO 28/08/2026, niveau
// OWASP Authentication/Credential Stuffing/NIST rate limiting).
//
// Remplace les `Map` en mémoire dupliquées sur ~20 routes
// app/api/{citoyen,institution}/auth/** (non persistantes, non partagées
// entre instances serverless Netlify — voir supabase/migrations/
// 20260828000004_auth_security.sql pour le détail du schéma).
//
// Usage attendu dans chaque route (voir Lots 1-5 du chantier) :
//   1. const { deviceId, estNouveau } = resoudreDeviceId(request);
//   2. const ip = extraireIpClient(request);
//   3. const porte = await evaluerTentative(sb, { endpointCategory, deviceId, ip });
//      -> si porte.state est 'blocked'/'support_only', répondre 423
//         IMMÉDIATEMENT, sans toucher users/institutions (contrôle avant
//         l'opération coûteuse, exigence explicite du brief).
//   4. ... logique métier réelle (lookup/verify/register) ...
//   5. const etat = await enregistrerTentative(sb, { endpointCategory, deviceId, ip, identifiant, outcome, userAgent });
//   6. poserCookieDeviceSiNecessaire(response, deviceId, estNouveau);
// ─────────────────────────────────────────────────────────────────────────

export type AuthEndpointCategory =
  | "citoyen_login"
  | "citoyen_register"
  | "institution_login"
  | "institution_register"
  | "recuperation"
  | "admin_login"
  | "admin_entry"
  | "employee_login"
  | "checkin_login"
  | "checkin_code_manuel";

export type AuthSecurityState = "normal" | "warning" | "blocked" | "support_only";

export type EvaluationSecurite = {
  state: AuthSecurityState;
  retryAfterS?: number;
};

// ─── Seuils (échelle exacte du brief : 1re et 2e tentative autorisées, 3e
// déclenche warning, toute tentative suivante déclenche/prolonge un
// blocage) — nommés, jamais de magic numbers dans la logique ci-dessous.
// Valeurs par défaut, ajustables par Bryan sans toucher à la logique.
export const SEUIL_WARNING = 3;
export const SEUIL_BLOCAGE = SEUIL_WARNING + 1;
const FENETRE_TENTATIVES_MS = 15 * 60 * 1000;
const FENETRE_CYCLES_MS = 24 * 60 * 60 * 1000;
export const SEUIL_SUPPORT_ONLY_CYCLES = 5;

/** Durée de blocage — escalade par cycle répété dans la fenêtre 24h
 * (1er cycle 30 min, 2e 2h, 3e+ 24h) avant bascule en support_only. */
export function dureeBlocageMs(cycles: number): number {
  if (cycles <= 1) return 30 * 60 * 1000;
  if (cycles === 2) return 2 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

const DEVICE_COOKIE_NAME = "yelen224_device_id";
const DEVICE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/** Lit le cookie device existant, ou en prépare un nouveau (non encore
 * posé — voir poserCookieDeviceSiNecessaire). Jamais utilisé seul comme
 * identité (brief : "un fingerprint peut être modifié ou partagé") —
 * toujours combiné à l'IP dans evaluerTentative/enregistrerTentative. */
export function resoudreDeviceId(request: NextRequest): { deviceId: string; estNouveau: boolean } {
  const existant = request.cookies.get(DEVICE_COOKIE_NAME)?.value;
  if (existant) return { deviceId: existant, estNouveau: false };
  return { deviceId: crypto.randomUUID(), estNouveau: true };
}

export function poserCookieDeviceSiNecessaire(response: NextResponse, deviceId: string, estNouveau: boolean) {
  if (!estNouveau) return;
  response.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEVICE_COOKIE_MAX_AGE_S,
    path: "/",
  });
}

const RANG: Record<AuthSecurityState, number> = { normal: 0, warning: 1, blocked: 2, support_only: 3 };
function pireEtat(a: EvaluationSecurite, b: EvaluationSecurite): EvaluationSecurite {
  return RANG[a.state] >= RANG[b.state] ? a : b;
}

type Scope = "device" | "ip";
type LigneEtat = {
  state: AuthSecurityState;
  window_started_at: string;
  attempts_in_window: number;
  blocked_until: string | null;
  block_cycles_24h: number;
  cycles_window_started_at: string | null;
};

// Isolation Admin (correctif ciblé 30/08/2026) — preuve du bug : les tables
// ci-dessous étaient auparavant codées en dur, partagées par TOUTES les
// catégories (citoyen_login, institution_login, admin_login...), alors que
// evaluerTentative()/enregistrerTentative() ne reçoivent endpointCategory
// que pour le LOG (auth_security_events), jamais pour choisir la table
// d'état — un blocage déclenché par institution_login bloquait donc aussi
// admin_login sur le même device/ip (constaté en test réel). TABLES_ADMIN
// isole entièrement les compteurs admin dans 2 tables dédiées (migration
// 20260830000009) sans toucher au comportement des autres catégories :
// `tables` est un paramètre optionnel à valeur par défaut TABLES_DEFAUT
// identique à l'ancien comportement codé en dur — tous les appels
// existants (citoyen/institution/employé/récupération) ne passent pas ce
// paramètre et restent donc strictement inchangés.
type TableSet = {
  device: "auth_device_security" | "auth_admin_device_security" | "auth_admin_entry_device_security";
  ip: "auth_ip_security" | "auth_admin_ip_security" | "auth_admin_entry_ip_security";
};
const TABLES_DEFAUT: TableSet = { device: "auth_device_security", ip: "auth_ip_security" };
const TABLES_ADMIN: TableSet = { device: "auth_admin_device_security", ip: "auth_admin_ip_security" };
// Admin Entry Security V2 (Lot 3, 30/08/2026) — troisième scope isolé,
// même raisonnement que TABLES_ADMIN : un abus sur /entree-admin (ou
// inversement, un abus sur admin_login/institution_login/citoyen_login)
// ne doit jamais affecter ce scope ni être affecté par lui. Table dédiée
// (migration 20260830000010), zéro logique d'escalade dupliquée.
const TABLES_ADMIN_ENTRY: TableSet = { device: "auth_admin_entry_device_security", ip: "auth_admin_entry_ip_security" };

function tableEtColonne(scope: Scope, tables: TableSet = TABLES_DEFAUT): { table: string; colonne: "device_id" | "ip" } {
  return scope === "device"
    ? { table: tables.device, colonne: "device_id" }
    : { table: tables.ip, colonne: "ip" };
}

/** Lecture seule — utilisée à la porte (evaluerTentative), n'incrémente
 * rien. 'warning' n'est jamais bloquant à l'entrée (le brief autorise
 * encore la tentative pendant le throttling) — seuls 'blocked' (tant que
 * blocked_until n'est pas dépassé) et 'support_only' le sont. */
async function lireEtat(sb: SupabaseClient, scope: Scope, valeur: string, tables: TableSet = TABLES_DEFAUT): Promise<EvaluationSecurite> {
  const { table, colonne } = tableEtColonne(scope, tables);
  const { data, error } = await sb.from(table).select("state, blocked_until").eq(colonne, valeur).maybeSingle();
  // Piège CLAUDE.md (/pieges-techniques-connus) : toujours destructurer
  // `error` avant de tester `!data`, sinon une vraie erreur serveur se
  // fait passer pour "aucun état enregistré". Ici le choix reste
  // fail-open (revue critique 30/08/2026, même jour) — bloquer toute
  // authentification à la moindre erreur transitoire de
  // auth_device_security/auth_ip_security serait pire que le risque de
  // sécurité résiduel — mais l'erreur devient désormais visible/tracée
  // plutôt que silencieusement avalée.
  if (error) {
    logSecurite("auth_security_lecture_echouee", { scope, table, message: error.message });
    return { state: "normal" };
  }
  if (!data) return { state: "normal" };
  if (data.state === "support_only") return { state: "support_only" };
  const maintenant = Date.now();
  if (data.state === "blocked" && data.blocked_until && new Date(data.blocked_until).getTime() > maintenant) {
    return { state: "blocked", retryAfterS: Math.ceil((new Date(data.blocked_until).getTime() - maintenant) / 1000) };
  }
  return { state: "normal" };
}

/** Contrôle à faire AVANT toute opération coûteuse (lookup DB, envoi OTP,
 * création de compte) — exigence explicite du brief : "une action refusée
 * par le système ne doit plus continuer à interroger la base". */
export async function evaluerTentative(
  sb: SupabaseClient,
  params: { deviceId: string; ip: string },
  tables: TableSet = TABLES_DEFAUT
): Promise<EvaluationSecurite> {
  const [device, ip] = await Promise.all([
    lireEtat(sb, "device", params.deviceId, tables),
    lireEtat(sb, "ip", params.ip, tables),
  ]);
  return pireEtat(device, ip);
}

// Variante isolée Admin — voir le commentaire au-dessus de TableSet.
// Utilisée exclusivement par app/api/admin/auth/login/route.ts.
export function evaluerTentativeAdmin(
  sb: SupabaseClient,
  params: { deviceId: string; ip: string }
): Promise<EvaluationSecurite> {
  return evaluerTentative(sb, params, TABLES_ADMIN);
}

// Variante isolée Admin Entry (Lot 3, 30/08/2026) — utilisée exclusivement
// par app/api/admin/entry/webauthn/auth-verify/route.ts. Jamais confondue
// avec evaluerTentativeAdmin ci-dessus (tables différentes).
export function evaluerTentativeAdminEntry(
  sb: SupabaseClient,
  params: { deviceId: string; ip: string }
): Promise<EvaluationSecurite> {
  return evaluerTentative(sb, params, TABLES_ADMIN_ENTRY);
}

/** Incrémente le compteur de fenêtre pour un scope et recalcule son état.
 * Appelée pour device ET ip à chaque tentative — jamais seulement l'un ou
 * l'autre, pour ne pas être contournable par simple rotation du cookie
 * device (scénario explicitement demandé par le brief : "changement de
 * session"). */
async function incrementerEtEvaluer(
  sb: SupabaseClient,
  scope: Scope,
  valeur: string,
  endpointCategory: AuthEndpointCategory,
  ip: string,
  tables: TableSet = TABLES_DEFAUT
): Promise<EvaluationSecurite> {
  const { table, colonne } = tableEtColonne(scope, tables);
  const maintenant = Date.now();
  const nowIso = new Date(maintenant).toISOString();

  const { data: existant, error: lectureError } = await sb.from(table).select("*").eq(colonne, valeur).maybeSingle<LigneEtat>();
  // Même piège que lireEtat ci-dessus — court-circuite AVANT toute tentative
  // d'insert/update : traiter une erreur de lecture comme "!existant"
  // risquerait un conflit de clé primaire si la ligne existe réellement
  // mais que la lecture a échoué de façon transitoire.
  if (lectureError) {
    logSecurite("auth_security_lecture_echouee", { scope, table, message: lectureError.message });
    return { state: "normal" };
  }

  if (!existant) {
    await sb.from(table).insert({
      [colonne]: valeur,
      ...(scope === "device" ? { ip_last: ip } : {}),
      window_started_at: nowIso,
      attempts_in_window: 1,
      state: "normal",
      state_changed_at: nowIso,
      last_seen_at: nowIso,
    });
    return { state: "normal" };
  }

  // Déjà bloqué/support_only et pas encore expiré : ne se produit qu'en
  // cas de requêtes concurrentes ayant franchi la porte avant l'écriture
  // de ce blocage (evaluerTentative aurait sinon déjà rejeté la requête
  // en amont) — on ne fait qu'observer l'état existant, sans le
  // recalculer ni ré-incrémenter le compteur.
  if (existant.state === "support_only") return { state: "support_only" };
  if (existant.state === "blocked" && existant.blocked_until && new Date(existant.blocked_until).getTime() > maintenant) {
    return { state: "blocked", retryAfterS: Math.ceil((new Date(existant.blocked_until).getTime() - maintenant) / 1000) };
  }

  const blocageExpire = existant.state === "blocked" && existant.blocked_until && new Date(existant.blocked_until).getTime() <= maintenant;
  const fenetreExpiree = new Date(existant.window_started_at).getTime() + FENETRE_TENTATIVES_MS < maintenant;
  const nouvelleFenetre = blocageExpire || fenetreExpiree;
  const tentatives = nouvelleFenetre ? 1 : existant.attempts_in_window + 1;

  let nouvelEtat: AuthSecurityState;
  let blockedUntil: string | null = null;
  let cycles = existant.block_cycles_24h;
  let cyclesWindowStart = existant.cycles_window_started_at;

  if (tentatives >= SEUIL_BLOCAGE) {
    const cyclesFenetreExpiree = !cyclesWindowStart || new Date(cyclesWindowStart).getTime() + FENETRE_CYCLES_MS < maintenant;
    cycles = cyclesFenetreExpiree ? 1 : cycles + 1;
    cyclesWindowStart = cyclesFenetreExpiree ? nowIso : cyclesWindowStart;

    if (cycles >= SEUIL_SUPPORT_ONLY_CYCLES) {
      nouvelEtat = "support_only";
    } else {
      nouvelEtat = "blocked";
      blockedUntil = new Date(maintenant + dureeBlocageMs(cycles)).toISOString();
    }
  } else if (tentatives === SEUIL_WARNING) {
    nouvelEtat = "warning";
  } else {
    nouvelEtat = "normal";
  }

  await sb
    .from(table)
    .update({
      ...(scope === "device" ? { ip_last: ip } : {}),
      window_started_at: nouvelleFenetre ? nowIso : existant.window_started_at,
      attempts_in_window: tentatives,
      state: nouvelEtat,
      state_changed_at: nouvelEtat !== existant.state ? nowIso : undefined,
      blocked_until: blockedUntil,
      block_cycles_24h: cycles,
      cycles_window_started_at: cyclesWindowStart,
      last_seen_at: nowIso,
      blocked_reason:
        nouvelEtat === "blocked" || nouvelEtat === "support_only"
          ? `Seuil de tentatives dépassé (${endpointCategory})`
          // existant.state ne peut plus valoir 'support_only' ici (retour
          // anticipé plus haut) — seul 'blocked' reste à nettoyer au
          // retour à la normale.
          : existant.state === "blocked"
          ? null
          : undefined,
    })
    .eq(colonne, valeur);

  return { state: nouvelEtat, retryAfterS: blockedUntil ? Math.ceil((new Date(blockedUntil).getTime() - maintenant) / 1000) : undefined };
}

// Correctif "blocage même avec infos correctes" (03/09/2026) — avant ce
// correctif, TOUTE tentative (y compris un succès) incrémentait
// attempts_in_window. Le flow citoyen normal fait 2 appels par connexion
// réussie (lookup 'trouve' + verify 'code_correct') : 2 connexions
// légitimes en 15 min suffisaient à atteindre SEUIL_BLOCAGE et à bloquer
// le citoyen à la porte dès sa 3e tentative, pourtant elle aussi correcte.
// Pratique standard (NIST 800-63B / façon Google-GitHub) : seuls les
// ÉCHECS comptent vers l'escalade, un succès authentifié remet la fenêtre
// courte à zéro (sans effacer block_cycles_24h — l'historique d'abus sur
// 24h reste, un succès isolé au milieu d'une vague d'attaque ne doit pas
// l'effacer). Liste vérifiée par grep sur tous les appelants réels de
// enregistrerTentative/enregistrerTentativeAdmin/enregistrerTentativeAdminEntry
// du repo — tout outcome absent de cette liste reste classé échec par
// défaut (fail-secure), y compris pour des catégories pas encore auditées.
//
// ⚠️ Revue sécurité 12/09/2026 : 'trouve' et 'code_envoye' RETIRÉS de ce
// set (présents dans la version du 03/09, bug réel trouvé ici). Ces deux
// outcomes signalent seulement "un OTP vient d'être généré/envoyé" — AVANT
// toute vérification de code, donc sans aucune preuve d'identité. Comme
// ils partagent le même compteur device+IP que l'étape de vérification qui
// suit (citoyen_login, institution_login/institution_register), un
// attaquant pouvait rappeler lookup/send-otp entre chaque tentative de
// code pour remettre son compteur d'échecs à zéro et neutraliser
// complètement l'escalade (warning/blocage) sur ces flux. Le correctif
// d'origine (2 connexions légitimes qui bloquaient à tort) reste résolu :
// c'est 'code_correct' — une vraie preuve — qui réinitialise déjà le
// compteur à la fin d'un cycle complet réussi.
const OUTCOMES_SUCCES = new Set([
  "code_correct", // OTP/PIN/mot de passe/TOTP correct
  "compte_cree", // inscription aboutie
  "demande_creee", // récupération de compte : demande créée
  "verification_ok", // WebAuthn : assertion vérifiée
]);

/** Remet la fenêtre courte à zéro après un succès prouvé — ne touche pas
 * block_cycles_24h (voir commentaire ci-dessus). No-op si aucune ligne
 * n'existe encore pour ce device/ip. */
async function reinitialiserApresSucces(
  sb: SupabaseClient,
  scope: Scope,
  valeur: string,
  tables: TableSet = TABLES_DEFAUT
): Promise<EvaluationSecurite> {
  const { table, colonne } = tableEtColonne(scope, tables);
  const nowIso = new Date().toISOString();
  await sb
    .from(table)
    .update({
      attempts_in_window: 0,
      state: "normal",
      state_changed_at: nowIso,
      blocked_until: null,
      blocked_reason: null,
      last_seen_at: nowIso,
    })
    .eq(colonne, valeur);
  return { state: "normal" };
}

/** Enregistre une tentative RÉELLE d'authentification (jamais un simple
 * clic UI) — à appeler après résolution de l'opération métier (trouvé/
 * not_found, code correct/incorrect, etc.), jamais avant. Écrit l'audit
 * trail immuable et met à jour device+ip (échec : incrémente et escalade ;
 * succès : réinitialise, voir OUTCOMES_SUCCES ci-dessus). */
export async function enregistrerTentative(
  sb: SupabaseClient,
  params: {
    endpointCategory: AuthEndpointCategory;
    deviceId: string;
    ip: string;
    identifiant?: string | null;
    outcome: string;
    userAgent?: string | null;
  },
  tables: TableSet = TABLES_DEFAUT
): Promise<EvaluationSecurite> {
  const succes = OUTCOMES_SUCCES.has(params.outcome);
  const [deviceRes, ipRes] = await Promise.all([
    succes
      ? reinitialiserApresSucces(sb, "device", params.deviceId, tables)
      : incrementerEtEvaluer(sb, "device", params.deviceId, params.endpointCategory, params.ip, tables),
    succes
      ? reinitialiserApresSucces(sb, "ip", params.ip, tables)
      : incrementerEtEvaluer(sb, "ip", params.ip, params.endpointCategory, params.ip, tables),
  ]);
  const pire = pireEtat(deviceRes, ipRes);

  await sb.from("auth_security_events").insert({
    endpoint_category: params.endpointCategory,
    event_type: "attempt",
    outcome: params.outcome,
    resulting_state: pire.state,
    device_id: params.deviceId,
    ip: params.ip,
    identifiant: params.identifiant ?? null,
    user_agent: params.userAgent ?? null,
  });

  if (pire.state === "blocked" || pire.state === "support_only") {
    logSecurite("auth_security_blocage", {
      endpointCategory: params.endpointCategory,
      state: pire.state,
      deviceId: params.deviceId,
      ip: params.ip,
    });
  }

  return pire;
}

// Variante isolée Admin — voir le commentaire au-dessus de TableSet.
// Utilisée exclusivement par app/api/admin/auth/login/route.ts. Écrit
// toujours dans auth_security_events (partagée, déjà filtrable par
// endpoint_category='admin_login') — seuls les COMPTEURS d'état sont
// isolés, pas le journal d'audit, pour que /admin/security garde une vue
// unifiée de toutes les catégories.
export function enregistrerTentativeAdmin(
  sb: SupabaseClient,
  params: {
    deviceId: string;
    ip: string;
    identifiant?: string | null;
    outcome: string;
    userAgent?: string | null;
  }
): Promise<EvaluationSecurite> {
  return enregistrerTentative(sb, { ...params, endpointCategory: "admin_login" }, TABLES_ADMIN);
}

// Variante isolée Admin Entry (Lot 3, 30/08/2026) — voir
// evaluerTentativeAdminEntry ci-dessus. `identifiant` est toujours null ici
// (aucun email/identifiant saisi à cette étape, par conception — Option A
// de la décision, section 2 : pas d'identifiant préalable).
export function enregistrerTentativeAdminEntry(
  sb: SupabaseClient,
  params: {
    deviceId: string;
    ip: string;
    outcome: string;
    userAgent?: string | null;
  }
): Promise<EvaluationSecurite> {
  return enregistrerTentative(sb, { ...params, endpointCategory: "admin_entry", identifiant: null }, TABLES_ADMIN_ENTRY);
}

/** Message générique cohérent pour les 5 flux — jamais 4 formulations
 * différentes (exigence explicite du brief : "un mécanisme centralisé
 * réutilisable"). Le détail visuel complet (compte à rebours, FAQ,
 * contact support) vit dans components/security/AuthSecurityBlockedScreen
 * (Lot 6) ; ce message ne sert que pour la réponse JSON brute. */
export function messageSecurite(state: AuthSecurityState): string {
  switch (state) {
    case "blocked":
      return "Pour protéger Yelen contre les tentatives automatisées ou inhabituelles, les actions d'authentification ont été temporairement désactivées sur cet appareil.";
    case "support_only":
      return "Les actions d'authentification ont été désactivées sur cet appareil. Contactez le support pour les réactiver.";
    default:
      return "";
  }
}
