import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluerActivationSecurite, getAuthenticatedMembre } from "@/lib/institutionAuth";

// ─────────────────────────────────────────────────────────────────────────
// GAP-08-05 (23/10/2026) — application SERVEUR de "Yelen Security
// Activation" (MFA TOTP ou Passkey obligatoire 24h après la première
// connexion d'un membre, voir lib/institutionAuth.ts::evaluerActivationSecurite).
//
// Jusqu'ici le blocage n'existait que côté client (SecurityActivationGate,
// calque plein écran du dashboard) : un membre en retard pouvait continuer
// à appeler n'importe quelle route /api/institution/** directement. Cette
// garde est appelée par proxy.ts pour TOUTE route institution (deny-by-
// default, routes futures comprises) — seules les routes listées dans
// ROUTES_EXEMPTEES_MFA restent joignables, chacune avec sa justification.
//
// Ce module ne remplace pas l'authentification des routes : sans session
// membre valide il laisse passer, la route elle-même renvoie son 401.
// ─────────────────────────────────────────────────────────────────────────

export const CODE_MFA_REQUISE = "MFA_REQUISE";

type Methode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Exemption = { chemin: string; methodes?: readonly Methode[]; motif: string };

const PRE_SESSION = "Établit ou rétablit la session (aucune session membre exploitable avant) — bloquer empêcherait toute reconnexion d'un membre en retard.";

// Correspondance EXACTE du chemin (jamais un préfixe) : une nouvelle route
// ajoutée sous auth/ ou securite/ est protégée par défaut tant qu'elle n'est
// pas explicitement ajoutée ici.
export const ROUTES_EXEMPTEES_MFA: readonly Exemption[] = [
  // ─── Établissement / fin de session ───────────────────────────────────
  { chemin: "/api/institution/auth/logout", motif: "Se déconnecter doit toujours rester possible (même règle que la garde MFA admin de proxy.ts)." },
  { chemin: "/api/institution/auth/lookup", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/register", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/send-otp", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/verify-otp", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/membre/login", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/pin/verify", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/totp/login-verify", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/remember/check", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/remember/forget", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/webauthn/auth-options", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/webauthn/auth-verify", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/webauthn/membre/auth-options", motif: PRE_SESSION },
  { chemin: "/api/institution/auth/webauthn/membre/auth-verify", motif: PRE_SESSION },

  // ─── Sortie du blocage : activer sa MFA ───────────────────────────────
  // Exactement les appels de SecurityActivationGate + TotpSection +
  // PasskeySection (self-scope) nécessaires pour ACTIVER une protection —
  // pas ceux qui la désactivent ou la gèrent (totp/disable,
  // backup-codes/regenerate, webauthn/revoke restent bloqués).
  { chemin: "/api/institution/auth/security-activation-status", methodes: ["GET"], motif: "Le calque de blocage interroge cet état pour savoir s'il peut se lever." },
  { chemin: "/api/institution/securite/totp/setup", methodes: ["POST"], motif: "Génère le secret TOTP à activer." },
  { chemin: "/api/institution/securite/totp/verify", methodes: ["POST"], motif: "Confirme le code TOTP et active la protection." },
  { chemin: "/api/institution/security-status", methodes: ["GET"], motif: "TotpSection lit l'état TOTP du membre ; les champs institution-wide restent réservés à l'admin par la route elle-même." },
  { chemin: "/api/institution/auth/webauthn/membre", methodes: ["GET"], motif: "PasskeySection liste les passkeys du membre (self-scope)." },
  { chemin: "/api/institution/auth/webauthn/membre/register-options", methodes: ["POST"], motif: "Enregistrement d'une passkey du membre (étape 1)." },
  { chemin: "/api/institution/auth/webauthn/membre/register-verify", methodes: ["POST"], motif: "Enregistrement d'une passkey du membre (étape 2) — active la protection." },

  // ─── Ancrage du dashboard ─────────────────────────────────────────────
  {
    chemin: "/api/institution/profile",
    methodes: ["GET"],
    motif: "Le layout du dashboard interprète un 403 sur cette route comme \"mauvaise institution\" et DÉCONNECTE le membre (app/[slug]/[id]/layout.tsx, loadData) — bloquée, elle rendrait l'activation impossible. Lecture seule ; PUT reste bloqué.",
  },
];

function normaliserChemin(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** Routes authentifiées par la session membre institution. */
export function routeSousGardeMfa(pathname: string): boolean {
  const p = normaliserChemin(pathname);
  return p.startsWith("/api/institution/") || p === "/api/qr/validate";
}

export function estExempteeMfa(pathname: string, methode: string): boolean {
  const p = normaliserChemin(pathname);
  return ROUTES_EXEMPTEES_MFA.some((e) => e.chemin === p && (!e.methodes || (e.methodes as readonly string[]).includes(methode)));
}

// Cache par instance des membres NON bloqués (MFA active, non concernés,
// ou encore dans leur délai) : évite 3 requêtes supplémentaires à chaque
// appel API. Jamais au-delà de l'échéance d'un membre encore dans son délai
// (il doit basculer en bloqué à l'heure exacte). Effet assumé : une MFA
// désactivée APRÈS l'échéance n'est re-bloquée qu'au plus CACHE_TTL_MS plus
// tard. Les membres bloqués ne sont jamais mis en cache (ils doivent
// pouvoir sortir du blocage dès l'activation).
const CACHE_TTL_MS = 60_000;
const nonBloquesJusqua = new Map<string, number>();

let clientParDefaut: SupabaseClient | null = null;
function client(): SupabaseClient {
  clientParDefaut ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return clientParDefaut;
}

export type ResultatGardeMfa = { bloque: false } | { bloque: true; deadline: string | null };

export async function evaluerGardeMfaInstitution(request: NextRequest): Promise<ResultatGardeMfa> {
  const { pathname } = request.nextUrl;
  if (!routeSousGardeMfa(pathname) || estExempteeMfa(pathname, request.method)) return { bloque: false };

  const membre = await getAuthenticatedMembre(request);
  if (!membre) return { bloque: false };

  const maintenant = Date.now();
  const cache = nonBloquesJusqua.get(membre.membreId);
  if (cache !== undefined && cache > maintenant) return { bloque: false };

  // Fail-open si la lecture échoue (evaluerActivationSecurite renvoie alors
  // "non requise") — même choix que le reste de Yelen Security Activation :
  // une panne de lecture ne doit jamais priver un membre légitime de son
  // espace.
  const activation = await evaluerActivationSecurite(client(), membre.membreId);
  if (activation.bloque) {
    nonBloquesJusqua.delete(membre.membreId);
    return { bloque: true, deadline: activation.deadline };
  }
  const echeance = activation.requise && activation.deadline ? new Date(activation.deadline).getTime() : Infinity;
  nonBloquesJusqua.set(membre.membreId, Math.min(maintenant + CACHE_TTL_MS, echeance));
  return { bloque: false };
}

/** Réservé aux tests : vide le cache entre deux cas. */
export function viderCacheGardeMfa(): void {
  nonBloquesJusqua.clear();
}
