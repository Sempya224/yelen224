// Mur "mobile-only" citoyen (mission séparation Citizen/Web, 12/08/2026,
// décision CEO) — Yelen224 côté citoyen n'est accessible que depuis un
// téléphone ou une tablette, jamais un PC. Le Web reste réservé aux
// institutions/prestataires/professionnels (voir middleware.ts pour la
// liste des chemins exemptés). Override assumé de l'ancienne promesse
// d'accès "cybercafé/ordinateur" documentée dans la FAQ citoyen — corrigée
// dans le même chantier.
//
// Détection par User-Agent (pas par taille de viewport, décision Bryan) :
// ne gêne jamais un citoyen qui redimensionne sa fenêtre, et ne dépend pas
// du rendu réel de la page. Couvre téléphones ET tablettes (une tablette
// n'est pas un "PC").
const MOBILE_UA_REGEX = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/i;

// Robots d'indexation et bots d'aperçu de lien (WhatsApp, Facebook,
// Twitter/X, Slack, LinkedIn, Telegram, Discord, Google...) — sans cette
// exception, un lien Yelen224 (offre, institution, reçu) partagé sur
// WhatsApp afficherait un aperçu vide/cassé : le bot qui génère la carte
// d'aperçu n'a pas un user-agent "mobile" et se ferait rewriter vers
// l'écran de blocage au lieu de lire les balises OpenGraph réelles.
const BOT_UA_REGEX = /bot|crawl|spider|facebookexternalhit|WhatsApp|Slackbot|TelegramBot|LinkedInBot|Twitterbot|Discordbot|Googlebot|bingbot|Applebot|Pinterest|SkypeUriPreview/i;

export function estAppareilMobile(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return MOBILE_UA_REGEX.test(userAgent);
}

export function estRobotOuApercu(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT_UA_REGEX.test(userAgent);
}

// Chemins toujours accessibles depuis un PC, indépendamment du mur mobile :
// Web professionnel (institution/admin/clock — le dashboard institution
// lui-même a déménagé à la racine du site, /{slug}/{id}/{screen}, voir
// DASHBOARD_INSTITUTION_REGEX plus bas), API, pages légales/support
// partagées avec le dashboard institution, outils de vérification publique
// destinés à être ouverts par n'importe qui sur n'importe quel appareil
// (reçu de paiement).
export const MOBILE_WALL_EXEMPT_PREFIXES = [
  '/admin',
  // Admin Entry Security V2 (Lot 3, 30/08/2026) — /entree-admin est un
  // chemin racine séparé (pas sous /admin), donc pas couvert par le préfixe
  // '/admin' ci-dessus. Même trouvaille que celle documentée le même jour
  // pour ADMIN_ENTRY_TOKEN (préfixe non reconnu par ce mur) — corrigée ici
  // avant qu'elle ne se reproduise en production.
  '/entree-admin',
  '/institution',
  '/clock',
  '/api',
  '/verify',
  '/region-non-disponible',
  '/acces-mobile-requis',
  '/cgu',
  '/confidentialite',
  '/contact',
  '/guide-prestataire',
  '/mentions-legales',
  '/politique-cookies',
  '/conditions-prestataires',
];

// Dashboard institution (chantier "URLs dynamiques institution", 28/08/2026)
// : /{slug}/{id}/{screen} vit désormais à la racine du site, hors de tout
// préfixe fixe listé ci-dessus (le slug est propre à chaque institution,
// impossible à lister à l'avance). Reconnu par sa forme structurelle —
// exactement 3 segments, le 2e étant l'id institution (uuid) — plutôt que
// par un appel base de données ici (edge/proxy, coût par requête). Aucune
// route citoyenne existante n'a cette forme (toutes les routes dynamiques
// citoyen sont à 2 segments : /rdv/[id], /offres/[id], /institution/[id]...).
const DASHBOARD_INSTITUTION_REGEX = /^\/[a-z0-9-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9-]+$/i;

export function cheminExempteMurMobile(pathname: string): boolean {
  if (pathname.includes('opengraph-image')) return true;
  if (DASHBOARD_INSTITUTION_REGEX.test(pathname)) return true;
  return MOBILE_WALL_EXEMPT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
