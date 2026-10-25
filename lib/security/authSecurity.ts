import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { logSecurite } from "@/lib/edgeSecurity";

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

type SeuilCategorie = { warning: number; blocage: number };
const SEUILS_DEFAUT: SeuilCategorie = { warning: SEUIL_WARNING, blocage: SEUIL_BLOCAGE };

// Seuils par catégorie, scope device/ip (Priorité 4 validée CEO 18/10/2026)
// — jamais touché par défaut (SEUILS_DEFAUT = comportement actuel 3/4,
// inchangé pour admin_login/employee_login/checkin_*/citoyen_*/
// institution_* qui n'apparaissent pas ci-dessous). Seule `recuperation`
// est durcie : opération à fort impact (changement de numéro de
// récupération) et volume naturellement faible dans le parcours normal.
const SEUILS_DEVICE_IP_PAR_CATEGORIE: Partial<Record<AuthEndpointCategory, SeuilCategorie>> = {
  recuperation: { warning: 2, blocage: 3 },
};

// Seuils du nouveau scope "destination" (Priorités 3/4) — toujours plus
// stricts que device/ip par défaut : une destination (numéro/compte visé)
// qui reçoit beaucoup de tentatives depuis des appareils/IP VARIÉS est un
// signal plus fort qu'un seul device/IP qui insiste. N'est jamais évalué
// pour une catégorie absente de cette table (admin_login, employee_login,
// checkin_* — hors périmètre de ce chantier, aucune destination transmise
// par leurs appels).
const SEUILS_DESTINATION_PAR_CATEGORIE: Partial<Record<AuthEndpointCategory, SeuilCategorie>> = {
  citoyen_login: { warning: 2, blocage: 3 },
  citoyen_register: { warning: 2, blocage: 3 },
  institution_login: { warning: 2, blocage: 3 },
  institution_register: { warning: 2, blocage: 3 },
  recuperation: { warning: 1, blocage: 2 },
};

function seuilsPour(scope: Scope, category: AuthEndpointCategory): SeuilCategorie {
  const table = scope === "destination" ? SEUILS_DESTINATION_PAR_CATEGORIE : SEUILS_DEVICE_IP_PAR_CATEGORIE;
  return table[category] ?? SEUILS_DEFAUT;
}

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

type Scope = "device" | "ip" | "destination";
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
  // Scope destination (Priorités 3/4, 18/10/2026) — uniquement défini pour
  // TABLES_DEFAUT : admin_login/admin_entry n'en ont pas besoin dans ce
  // chantier (aucun appel ne transmet de destination pour ces catégories).
  destination?: "auth_destination_security";
};
const TABLES_DEFAUT: TableSet = { device: "auth_device_security", ip: "auth_ip_security", destination: "auth_destination_security" };
const TABLES_ADMIN: TableSet = { device: "auth_admin_device_security", ip: "auth_admin_ip_security" };
// Admin Entry Security V2 (Lot 3, 30/08/2026) — troisième scope isolé,
// même raisonnement que TABLES_ADMIN : un abus sur /entree-admin (ou
// inversement, un abus sur admin_login/institution_login/citoyen_login)
// ne doit jamais affecter ce scope ni être affecté par lui. Table dédiée
// (migration 20260830000010), zéro logique d'escalade dupliquée.
const TABLES_ADMIN_ENTRY: TableSet = { device: "auth_admin_entry_device_security", ip: "auth_admin_entry_ip_security" };

function tableEtColonne(scope: Scope, tables: TableSet = TABLES_DEFAUT): { table: string; colonne: "device_id" | "ip" | "destination" } | null {
  if (scope === "device") return { table: tables.device, colonne: "device_id" };
  if (scope === "ip") return { table: tables.ip, colonne: "ip" };
  if (!tables.destination) return null;
  return { table: tables.destination, colonne: "destination" };
}

// Namespacing (Priorités 3/4) — une seule colonne texte sur
// auth_destination_security, jamais de clé composite : préfixer la valeur
// par sa population empêche toute collision (un numéro de téléphone
// citoyen et un institutionId ne partagent jamais d'espace de clés même
// en cas de valeur accidentellement identique).
export function destinationCitoyen(phone: string): string {
  return `citoyen_phone:${phone}`;
}
export function destinationInstitution(institutionId: string): string {
  return `institution_id:${institutionId}`;
}
// Flux d'inscription institution (send-otp/verify-otp/register avec
// `phone` fourni, avant qu'un institutionId n'existe) — espace de noms
// distinct de destinationCitoyen malgré le même type de valeur (numéro de
// téléphone), pour ne jamais mélanger les deux populations même en cas de
// numéro identique côté affichage.
export function destinationInstitutionPhone(phone: string): string {
  return `institution_phone:${phone}`;
}

/** Lecture seule — utilisée à la porte (evaluerTentative), n'incrémente
 * rien. 'warning' n'est jamais bloquant à l'entrée (le brief autorise
 * encore la tentative pendant le throttling) — seuls 'blocked' (tant que
 * blocked_until n'est pas dépassé) et 'support_only' le sont. */
async function lireEtat(sb: SupabaseClient, scope: Scope, valeur: string, tables: TableSet = TABLES_DEFAUT): Promise<EvaluationSecurite> {
  const cible = tableEtColonne(scope, tables);
  if (!cible) return { state: "normal" };
  const { table, colonne } = cible;
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

// Exemption "appareil de confiance pour cette destination précise"
// (Priorités 3/4, mandat CEO explicite : le scope destination doit rester
// complémentaire, jamais autonome — un tiers qui ne connaît qu'un numéro
// de téléphone/institutionId ne doit jamais pouvoir bloquer le titulaire
// légitime depuis SON PROPRE appareil déjà reconnu). N'intervient que
// lorsque la destination est le facteur qui détermine le blocage — jamais
// appelée si device/ip bloquent déjà indépendamment (ces deux scopes
// restent pleinement opposables, l'exemption ne neutralise QUE la
// contribution destination).
//
// Fail-open sur erreur technique (cohérent avec lireEtat ci-dessus :
// una erreur transitoire ne doit jamais être ce qui bloque un utilisateur
// réel) ; mais une absence de cookie ou un token qui ne correspond pas à
// cette destination n'est PAS une erreur — c'est le cas normal d'un
// appareil réellement inconnu, qui ne doit jamais être exempté.
async function estAppareilDeConfiancePourDestination(
  sb: SupabaseClient,
  request: NextRequest,
  destination: string
): Promise<boolean> {
  if (destination.startsWith("citoyen_phone:")) {
    const phone = destination.slice("citoyen_phone:".length);
    const raw = request.cookies.get("yelen224_citoyen_remember")?.value;
    if (!raw) return false;
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    const { data: tokenRow, error: e1 } = await sb
      .from("citoyen_remember_tokens")
      .select("citoyen_id, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (e1) { logSecurite("auth_security_exemption_echouee", { message: e1.message }); return true; }
    if (!tokenRow || tokenRow.status === "revoked" || new Date(tokenRow.expires_at) <= new Date()) return false;
    const { data: user, error: e2 } = await sb.from("users").select("phone").eq("id", tokenRow.citoyen_id).maybeSingle();
    if (e2) { logSecurite("auth_security_exemption_echouee", { message: e2.message }); return true; }
    return user?.phone === phone;
  }

  if (destination.startsWith("institution_id:")) {
    const institutionId = destination.slice("institution_id:".length);
    const raw = request.cookies.get("yelen224_institution_remember")?.value;
    if (!raw) return false;
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    const { data: tokenRow, error } = await sb
      .from("institution_remember_tokens")
      .select("institution_id, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) { logSecurite("auth_security_exemption_echouee", { message: error.message }); return true; }
    if (!tokenRow || tokenRow.status === "revoked" || new Date(tokenRow.expires_at) <= new Date()) return false;
    return tokenRow.institution_id === institutionId;
  }

  return false;
}

/** Contrôle à faire AVANT toute opération coûteuse (lookup DB, envoi OTP,
 * création de compte) — exigence explicite du brief : "une action refusée
 * par le système ne doit plus continuer à interroger la base".
 *
 * `destination` (Priorités 3/4, 18/10/2026) — optionnel, construit par
 * destinationCitoyen()/destinationInstitution() ; ignoré si `tables` n'a
 * pas de scope destination configuré (admin/admin_entry). `request` n'est
 * requis QUE pour l'exemption appareil de confiance — omis, le scope
 * destination s'applique sans jamais être neutralisé (comportement plus
 * strict, jamais moins). */
export async function evaluerTentative(
  sb: SupabaseClient,
  params: { deviceId: string; ip: string; destination?: string },
  tables: TableSet = TABLES_DEFAUT,
  request?: NextRequest
): Promise<EvaluationSecurite> {
  const destinationValeur = params.destination && tables.destination ? params.destination : undefined;
  const [device, ip, destination] = await Promise.all([
    lireEtat(sb, "device", params.deviceId, tables),
    lireEtat(sb, "ip", params.ip, tables),
    destinationValeur ? lireEtat(sb, "destination", destinationValeur, tables) : Promise.resolve<EvaluationSecurite>({ state: "normal" }),
  ]);

  const pireDeviceIp = pireEtat(device, ip);
  if (!destinationValeur || RANG[destination.state] <= RANG[pireDeviceIp.state]) {
    return pireEtat(pireDeviceIp, destination);
  }

  // La destination est ici le facteur déterminant du blocage/warning —
  // vérifier l'exemption avant de l'appliquer.
  if (request && (await estAppareilDeConfiancePourDestination(sb, request, destinationValeur))) {
    return pireDeviceIp;
  }
  return destination;
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
  const cible = tableEtColonne(scope, tables);
  if (!cible) return { state: "normal" };
  const { table, colonne } = cible;
  const seuils = seuilsPour(scope, endpointCategory);
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

  // Déjà bloqué/support_only et pas encore expiré : ne se produit qu'en
  // cas de requêtes concurrentes ayant franchi la porte avant l'écriture
  // de ce blocage (evaluerTentative aurait sinon déjà rejeté la requête
  // en amont) — on ne fait qu'observer l'état existant, sans le
  // recalculer ni ré-incrémenter le compteur. Ne s'applique que si une
  // ligne existe déjà (une toute première tentative ne peut par
  // définition pas être déjà bloquée).
  if (existant) {
    if (existant.state === "support_only") return { state: "support_only" };
    if (existant.state === "blocked" && existant.blocked_until && new Date(existant.blocked_until).getTime() > maintenant) {
      return { state: "blocked", retryAfterS: Math.ceil((new Date(existant.blocked_until).getTime() - maintenant) / 1000) };
    }
  }

  // Calcul unifié fenêtre/tentatives, qu'une ligne existe déjà ou non
  // (revue critique 18/10/2026 — avant, l'insertion d'une toute première
  // tentative forçait state:"normal" en dur, sans jamais évaluer les
  // seuils réellement configurés pour ce scope/catégorie : un seuil
  // `warning` fixé à 1 (catégorie à très faible tolérance, ex.
  // `recuperation` en scope destination) ne pouvait alors jamais se
  // déclencher dès la 1re tentative — bug trouvé en revue critique du
  // chantier Limites d'authentification, pas en test réel. Un seul
  // chemin de calcul, appliqué identiquement, élimine cette classe de
  // bug plutôt que de la corriger au cas par cas sur un seuil précis.
  const blocageExpire = !!existant && existant.state === "blocked" && !!existant.blocked_until && new Date(existant.blocked_until).getTime() <= maintenant;
  const fenetreExpiree = !existant || new Date(existant.window_started_at).getTime() + FENETRE_TENTATIVES_MS < maintenant;
  const nouvelleFenetre = !existant || blocageExpire || fenetreExpiree;
  const tentatives = nouvelleFenetre ? 1 : existant!.attempts_in_window + 1;

  let nouvelEtat: AuthSecurityState;
  let blockedUntil: string | null = null;
  let cycles = existant?.block_cycles_24h ?? 0;
  let cyclesWindowStart = existant?.cycles_window_started_at ?? null;

  if (tentatives >= seuils.blocage) {
    const cyclesFenetreExpiree = !cyclesWindowStart || new Date(cyclesWindowStart).getTime() + FENETRE_CYCLES_MS < maintenant;
    cycles = cyclesFenetreExpiree ? 1 : cycles + 1;
    cyclesWindowStart = cyclesFenetreExpiree ? nowIso : cyclesWindowStart;

    if (cycles >= SEUIL_SUPPORT_ONLY_CYCLES) {
      nouvelEtat = "support_only";
    } else {
      nouvelEtat = "blocked";
      blockedUntil = new Date(maintenant + dureeBlocageMs(cycles)).toISOString();
    }
  } else if (tentatives >= seuils.warning) {
    nouvelEtat = "warning";
  } else {
    nouvelEtat = "normal";
  }

  const blockedReasonSiBloque = (nouvelEtat === "blocked" || nouvelEtat === "support_only")
    ? `Seuil de tentatives dépassé (${endpointCategory})`
    : null;

  if (!existant) {
    await sb.from(table).insert({
      [colonne]: valeur,
      ...(scope === "device" ? { ip_last: ip } : {}),
      window_started_at: nowIso,
      attempts_in_window: tentatives,
      state: nouvelEtat,
      state_changed_at: nowIso,
      blocked_until: blockedUntil,
      block_cycles_24h: cycles,
      cycles_window_started_at: cyclesWindowStart,
      last_seen_at: nowIso,
      blocked_reason: blockedReasonSiBloque,
    });
  } else {
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
        // existant.state ne peut plus valoir 'support_only' ici (retour
        // anticipé plus haut) — seul 'blocked' reste à nettoyer au retour
        // à la normale.
        blocked_reason: blockedReasonSiBloque ?? (existant.state === "blocked" ? null : undefined),
      })
      .eq(colonne, valeur);
  }

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
//
// ⚠️ Revue critique 18/10/2026 : 'demande_creee' RETIRÉ de ce set (présent
// depuis l'origine, bug réel trouvé en revue — jamais en test réel).
// Contrairement aux 3 autres outcomes de succès, une demande de
// récupération créée ne prouve RIEN sur l'identité de l'appelant — cette
// preuve n'arrive que plus tard, via la revue humaine du document
// déposé, hors de la portée de ce module. Le traiter comme un succès
// réinitialisait le compteur à chaque soumission : app/api/citoyen/
// recuperation/route.ts n'enregistrant JAMAIS d'autre outcome que
// 'demande_creee' sur son seul chemin heureux, le throttle (device/IP ET
// le scope destination) ne pouvait alors jamais escalader au-delà de
// 'normal', quel que soit le nombre de soumissions répétées pour le même
// numéro — les seuils configurés pour 'recuperation' (voir
// SEUILS_*_PAR_CATEGORIE) étaient de fait inatteignables. Chaque
// soumission compte désormais contre le budget, qu'elle aboutisse ou non.
const OUTCOMES_SUCCES = new Set([
  "code_correct", // OTP/PIN/mot de passe/TOTP correct
  "compte_cree", // inscription aboutie
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
  const cible = tableEtColonne(scope, tables);
  if (!cible) return { state: "normal" };
  const { table, colonne } = cible;
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
    // Destination (Priorités 3/4, 18/10/2026) — construite par
    // destinationCitoyen()/destinationInstitution(). Incrémentée/réinitialisée
    // en parallèle de device/ip, jamais seule : voir evaluerTentative pour
    // l'exemption appareil de confiance qui s'applique au moment de la porte.
    destination?: string | null;
  },
  tables: TableSet = TABLES_DEFAUT
): Promise<EvaluationSecurite> {
  const succes = OUTCOMES_SUCCES.has(params.outcome);
  const destinationValeur = params.destination && tables.destination ? params.destination : undefined;
  const [deviceRes, ipRes, destRes] = await Promise.all([
    succes
      ? reinitialiserApresSucces(sb, "device", params.deviceId, tables)
      : incrementerEtEvaluer(sb, "device", params.deviceId, params.endpointCategory, params.ip, tables),
    succes
      ? reinitialiserApresSucces(sb, "ip", params.ip, tables)
      : incrementerEtEvaluer(sb, "ip", params.ip, params.endpointCategory, params.ip, tables),
    destinationValeur
      ? (succes
          ? reinitialiserApresSucces(sb, "destination", destinationValeur, tables)
          : incrementerEtEvaluer(sb, "destination", destinationValeur, params.endpointCategory, params.ip, tables))
      : Promise.resolve<EvaluationSecurite>({ state: "normal" }),
  ]);
  const pire = pireEtat(pireEtat(deviceRes, ipRes), destRes);

  await sb.from("auth_security_events").insert({
    endpoint_category: params.endpointCategory,
    event_type: "attempt",
    outcome: params.outcome,
    resulting_state: pire.state,
    device_id: params.deviceId,
    ip: params.ip,
    identifiant: params.identifiant ?? null,
    user_agent: params.userAgent ?? null,
    // Visibilité du scope destination (Priorités 3/4) dans /admin/security
    // sans ajouter de colonne dédiée à une table déjà large.
    metadata: destinationValeur ? { destination: destinationValeur } : null,
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
