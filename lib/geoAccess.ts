// Restriction géographique de pré-lancement (mission sécurité, 09/08/2026,
// décision CEO) — Edge only (lu depuis middleware.ts, jamais depuis un
// composant client). Compatible Edge Runtime : aucune API Node
// (crypto/Buffer), uniquement des fonctions natives disponibles sur
// l'edge (atob, TextEncoder).
//
// Portée : couche de réduction de surface d'exposition avant lancement
// public, PAS une protection anti-bot à elle seule (déni de service, VPN/
// proxy/datacenter, credential stuffing restent hors du périmètre de ce
// fichier — voir le résumé de mission pour la liste des points qui restent
// des actions manuelles/infra côté Bryan).

/** Afrique de l'Ouest — les 15 membres CEDEAO + Mauritanie (souvent
 * incluse géographiquement bien que hors CEDEAO depuis son retrait en
 * 2000). Liste à ajuster par Bryan si le périmètre exact diffère. */
export const WEST_AFRICA_COUNTRY_CODES = [
  "BJ", "BF", "CV", "CI", "GM", "GH", "GN", "GW",
  "LR", "ML", "MR", "NE", "NG", "SN", "SL", "TG",
] as const;

export const GEO_BYPASS_COOKIE = "yelen224_geo_bypass";

export interface NetlifyGeo {
  city?: string;
  country?: { code?: string; name?: string };
  subdivision?: { code?: string; name?: string };
}

/** Décode l'en-tête `x-nf-geo` posé par le Next.js Runtime de Netlify
 * (base64 JSON) — voir la doc Netlify Edge Functions / geolocation.
 * Renvoie null si absent/invalide (dev local, ou runtime non-Netlify) :
 * le code appelant doit alors fail-open (ne jamais transformer un bug de
 * parsing en indisponibilité totale du site). */
export function parseNetlifyGeo(header: string | null): NetlifyGeo | null {
  if (!header) return null;
  try {
    return JSON.parse(atob(header)) as NetlifyGeo;
  } catch {
    return null;
  }
}

/** Régions autorisées : Afrique de l'Ouest (tout le pays) + New York,
 * États-Unis (approximation par subdivision "NY" — Netlify ne descend
 * pas en dessous de la subdivision/état, pas de précision "ville" fiable
 * pour ce niveau de décision ; documenté comme approximation assumée). */
export function estRegionAutorisee(geo: NetlifyGeo | null): boolean {
  if (!geo?.country?.code) return true; // fail-open, voir commentaire parseNetlifyGeo
  const pays = geo.country.code.toUpperCase();
  if ((WEST_AFRICA_COUNTRY_CODES as readonly string[]).includes(pays)) return true;
  if (pays === "US" && geo.subdivision?.code?.toUpperCase() === "NY") return true;
  return false;
}

/** Comparaison à temps constant — évite une fuite d'information par timing
 * sur le token de contournement. Pas de crypto.timingSafeEqual (API Node,
 * indisponible sur l'Edge Runtime). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
