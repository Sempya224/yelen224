// Détection réelle du canal d'acquisition d'une vue/clic d'offre —
// dérivée du Referer HTTP au moment où la page publique app/offres/[id]
// est chargée (seul point où le "referer d'origine" est observable ; le
// clic sur le CTA se fait ensuite depuis cette même page, donc son propre
// Referer serait toujours "l'app elle-même" — sans intérêt, voir
// app/offres/[id]/page.tsx qui propage le canal calculé ici jusqu'au lien
// CTA en query param plutôt que de re-détecter au clic).
// Aucun appel externe, aucune donnée inventée : classification par
// hostname connu, avec repli explicite "autres" si non reconnu.
export type Canal = "application" | "recherche_organique" | "reseaux_sociaux" | "site_web" | "autres";

export const CANAL_LABELS: Record<Canal, string> = {
  application: "Application Yelen",
  recherche_organique: "Recherche organique",
  reseaux_sociaux: "Réseaux sociaux",
  site_web: "Site web",
  autres: "Autres",
};

export const CANAUX_VALIDES: Canal[] = ["application", "recherche_organique", "reseaux_sociaux", "site_web", "autres"];

const MOTEURS_RECHERCHE = ["google.", "bing.", "yahoo.", "duckduckgo.", "qwant.", "ecosia."];
const RESEAUX_SOCIAUX = ["facebook.", "instagram.", "twitter.", "x.com", "whatsapp.", "tiktok.", "linkedin.", "t.co", "snapchat.", "l.instagram.com", "lm.facebook.com"];

// referer absent = navigation directe (URL tapée, appli installée, ou lien
// partagé dont le client masque le referer — WhatsApp/iMessage le font
// systématiquement) : bucket "application" plutôt que "autres", cohérent
// avec le fait que Yelen est d'abord consommé comme une app.
export function detecterCanal(refererUrl: string | null, appUrl: string): Canal {
  if (!refererUrl) return "application";
  let host: string;
  let appHost: string;
  try {
    host = new URL(refererUrl).hostname.toLowerCase();
    appHost = new URL(appUrl).hostname.toLowerCase();
  } catch {
    return "autres";
  }
  if (host === appHost || host.endsWith(`.${appHost}`)) return "application";
  if (MOTEURS_RECHERCHE.some(m => host.includes(m))) return "recherche_organique";
  if (RESEAUX_SOCIAUX.some(r => host.includes(r))) return "reseaux_sociaux";
  return "site_web";
}

export function estCanalValide(v: string | null): v is Canal {
  return v !== null && (CANAUX_VALIDES as string[]).includes(v);
}
