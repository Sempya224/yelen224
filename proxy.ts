import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { GEO_BYPASS_COOKIE, estRegionAutorisee, parseNetlifyGeo, timingSafeEqual } from '@/lib/geoAccess'
import { estIpVpnOuProxy, estRateLimite, estUserAgentSuspect, extraireIpClient, logSecurite, seuilEndpointSensible } from '@/lib/edgeSecurity'
import { cheminExempteMurMobile, estAppareilMobile, estRobotOuApercu } from '@/lib/deviceAccess'

// Routes publiques admin (pas de protection)
const PUBLIC_ADMIN_ROUTES = ['/admin/login']

// Toutes les routes API admin publiques
// /api/admin/entry/webauthn/auth-* (Lot 3, 30/08/2026) : c'est précisément
// leur rôle d'être atteignables sans session — établir le droit d'entrée
// AVANT toute authentification (docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md).
// register-options/register-verify restent volontairement absents de cette
// liste : ils exigent une vraie session admin (authorizeAdmin), protégés
// par la même garde /api/admin/* que le reste du dashboard, sans rien
// ajouter ici.
const PUBLIC_API_ROUTES = [
  '/api/admin/auth/login',
  '/api/admin/entry/webauthn/auth-options',
  '/api/admin/entry/webauthn/auth-verify',
]

// Chantier MFA Admin (décision CEO 13/08/2026, GAP-04-03) — seuls ces
// chemins restent accessibles à un compte dont la 2FA n'est pas encore
// active, le temps qu'il la configure. /admin/security héberge l'écran
// de configuration (app/admin/security/page.tsx) ; les 3 routes 2fa/*
// sont ce que cet écran appelle pour générer/confirmer le secret TOTP ;
// auth/me et auth/logout doivent toujours rester joignables.
const MFA_EXEMPT_ADMIN_ROUTES = ['/admin/security']
const MFA_EXEMPT_API_ROUTES = ['/api/admin/auth/logout', '/api/admin/auth/me', '/api/admin/auth/2fa/', '/api/admin/auth/change-password']

const ADMIN_JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

// Revue critique 30/08/2026 (même jour) — trouvaille : ce middleware ne
// vérifiait que la signature/expiration du JWT, jamais admin_sessions
// (table + claim `sid` construits le même jour, lib/adminAuth.ts). Un
// logout/changement de mot de passe/désactivation 2FA révoque
// admin_sessions mais un ancien cookie JWT encore valide continuait donc
// de faire passer le gate PAGE (le rendu de la coquille du dashboard
// aurait été bloqué ensuite côté API par lib/adminAuth.ts, mais jamais
// ici). Client Supabase dédié (Edge Runtime — pas de Node spécifique
// utilisé, simple REST via fetch, comme le reste du projet en edge).
const supabaseEdge = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Mission "Sécurisation de l'accès Administration" (30/08/2026, brief CEO,
// niveau OWASP) — point 2 : URL admin non prédictible, connue uniquement
// des membres autorisés. Valeur choisie et gardée par Bryan (jamais
// devinée/générée ici), absente par défaut (dev local, ou avant
// configuration Netlify) → FAIL-OPEN volontaire, même discipline que
// GEO_BLOCK_ENABLED/MOBILE_WALL_ENABLED : /admin reste l'entrée directe
// tant que la variable n'est pas définie, zéro risque de lockout au
// déploiement de ce code.
const ADMIN_ENTRY_TOKEN = process.env.ADMIN_ENTRY_TOKEN || null

// Admin Entry Security V2 — Lot 3 (30/08/2026, décision CEO
// docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md). Nom de cookie dupliqué
// depuis lib/adminEntry.ts (ADMIN_ENTRY_GRANT_COOKIE) plutôt qu'importé —
// ce fichier tourne sur l'Edge Runtime, lib/adminEntry.ts importe le
// module Node `crypto` (indisponible sur l'Edge, même contrainte déjà
// documentée pour timingSafeEqual dans lib/geoAccess.ts). Si le nom change
// un jour, les deux occurrences doivent être mises à jour ensemble.
const ADMIN_ENTRY_GRANT_COOKIE = 'yelen224_admin_entry_grant'

// Hash SHA-256 via Web Crypto (SubtleCrypto), disponible sur l'Edge
// Runtime contrairement à crypto.createHash (Node). Produit le même hex
// digest que crypto.createHash('sha256').update(x).digest('hex') côté
// route Node (lib/adminEntry.ts::creerGrantEntreeAdmin) — seul l'algorithme
// compte pour que les deux côtés se rencontrent, pas l'API utilisée pour
// le calculer.
async function sha256Hex(valeur: string): Promise<string> {
  const donnees = new TextEncoder().encode(valeur)
  const hashBuffer = await crypto.subtle.digest('SHA-256', donnees)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Vérifie le cookie de grant d'entrée — lecture seule, ne le consomme/
// révoque jamais ici (ce n'est qu'une porte de lecture, la consommation
// réelle se fait après authentification normale complète, ailleurs —
// app/api/admin/auth/login/route.ts, Lot 3 écart 2, 31/08/2026).
// Ne vérifie QUE l'existence d'un droit d'entrée valide — ne retourne et
// ne peut retourner aucune identité admin, aucun claim, rien d'accepté par
// verifyAdminSession()/authorizeAdmin() (lib/adminAuth.ts, jamais lu ici).
// `consumed_at` ajouté au contrôle (Lot 3 écart 2) : un grant déjà
// consommé par une connexion admin réussie devient invalide ici au même
// titre qu'un grant révoqué/expiré — sans ce contrôle, un grant restait
// utilisable pour rouvrir /admin/login indéfiniment pendant ses 20 min.
async function verifierGrantEntreeAdmin(request: NextRequest): Promise<boolean> {
  const raw = request.cookies.get(ADMIN_ENTRY_GRANT_COOKIE)?.value
  if (!raw) return false
  const hash = await sha256Hex(raw)
  const { data } = await supabaseEdge
    .from('admin_entry_grants')
    .select('revoked_at, expires_at, consumed_at')
    .eq('cookie_hash', hash)
    .maybeSingle()
  if (!data || data.revoked_at || data.consumed_at || !data.expires_at) return false
  return new Date(data.expires_at).getTime() > Date.now()
}

// Vérification réelle de signature — avant, le middleware ne contrôlait
// que le format (3 segments séparés par des points), la vraie
// vérification n'avait lieu que dans chaque route API individuellement.
// Un cookie forgé au bon format passait donc jusqu'à la page/route
// avant d'être rejeté. Durci le 19/07/2026 : même secret/issuer/
// audience que app/api/admin/auth/login/route.ts. Étendu le 13/08/2026
// (chantier MFA Admin) pour renvoyer aussi le claim mfaEnabled du JWT —
// les sessions signées avant ce changement n'ont pas ce claim
// (undefined !== true), donc traitées comme "MFA non active" jusqu'à la
// prochaine connexion, ce qui est le comportement voulu (jamais un
// contournement silencieux).
async function verifierTokenAdmin(token: string): Promise<{ valide: boolean; mfaEnabled: boolean }> {
  try {
    const { payload } = await jwtVerify(token, ADMIN_JWT_SECRET, {
      issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard',
    })
    if (typeof payload.sid !== 'string') return { valide: false, mfaEnabled: false }

    // Lecture seule ici — ne met jamais à jour last_seen_at (ça reste la
    // responsabilité exclusive de lib/adminAuth.ts::verifyAdminSession, pour
    // ne pas écrire deux fois sur la même requête quand une page appelle
    // ensuite une route /api/admin/*).
    const { data: session } = await supabaseEdge
      .from('admin_sessions')
      .select('revoked_at, expires_at, last_seen_at')
      .eq('id', payload.sid)
      .maybeSingle()
    const maintenant = Date.now()
    if (
      !session ||
      session.revoked_at ||
      new Date(session.expires_at).getTime() < maintenant ||
      new Date(session.last_seen_at).getTime() + 60 * 60 * 1000 < maintenant
    ) {
      return { valide: false, mfaEnabled: false }
    }

    return { valide: true, mfaEnabled: payload.mfaEnabled === true }
  } catch {
    return { valide: false, mfaEnabled: false }
  }
}

// CSP — Lot 1.1 (13/08/2026, remédiation GAP-16-01), volontairement en
// mode Report-Only : aucun outil navigateur n'est disponible dans cet
// environnement pour vérifier réellement qu'une CSP en mode bloquant ne
// casse rien (l'app s'appuie massivement sur des styles inline React,
// qui nécessitent 'unsafe-inline' sur style-src — sans ce mode
// permissif, l'app entière serait cassée). En Report-Only, le navigateur
// journalise dans la console les violations qui SERAIENT bloquées, sans
// rien bloquer réellement — donc zéro risque de casser l'application.
// Domaines externes réels utilisés par le produit, chacun confirmé par
// recherche exhaustive dans le code au Lot 1.5 (pas copié d'un modèle
// générique) :
//  - Supabase (REST + Realtime wss: + Storage) : backend applicatif.
//  - images.pexels.com, img.youtube.com : next.config.ts::remotePatterns.
//  - www.youtube.com : iframe embarquée app/page.tsx:1476.
//  - *.tile.openstreetmap.org : tuiles de carte Leaflet
//    (components/CarteMap.tsx, LocationPicker.tsx) — sous-domaines a/b/c,
//    d'où le wildcard.
//  - formsubmit.co (connect-src) : app/contact/page.tsx fait un fetch()
//    direct vers ce service tiers pour le formulaire de contact.
// Google Fonts (fonts.googleapis.com/fonts.gstatic.com) : PAS de source
// CSP — les 9 pages qui les chargeaient par @import direct ont été migrées
// vers next/font/google (auto-hébergé, même Lot 1.5) : zéro dépendance
// externe restante, donc zéro exception nécessaire. Principe du moindre
// privilège appliqué à la lettre plutôt que de garder une exception "par
// habitude".
// Aucun analytics, aucun script tiers, aucune police via <link> externe
// trouvés (recherche exhaustive également négative sur ces points).
// WebAuthn (@simplewebauthn/browser) n'a besoin d'aucune source
// supplémentaire : API navigateur native (navigator.credentials), toutes
// les vérifications passent par nos propres routes /api/* (déjà 'self').
// Pour passer en mode bloquant réel : renommer l'en-tête en
// "Content-Security-Policy" (sans "-Report-Only") UNIQUEMENT après avoir
// navigué sur l'app en conditions réelles et confirmé 0 violation dans
// la console navigateur (Bryan).
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://pgcabxgrgjgukuagpuhc.supabase.co https://images.pexels.com https://img.youtube.com https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' https://pgcabxgrgjgukuagpuhc.supabase.co wss://pgcabxgrgjgukuagpuhc.supabase.co https://formsubmit.co",
  "frame-src https://www.youtube.com https://pgcabxgrgjgukuagpuhc.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// Correctif verification Lot 1.5 (13/08/2026) — trouvé en vérification
// production que /api/admin/kpis (401 sans session) et /admin (redirect
// login sans cookie) n'avaient AUCUN header de sécurité : ils ne
// passaient pas par l'objet `response` d'origine mais par un nouveau
// NextResponse.redirect()/.json()/.rewrite() construit plus bas dans la
// fonction, qui ne recopie jamais les headers déjà posés ailleurs.
// Cette fonction doit être appelée sur CHAQUE réponse retournée par le
// middleware, pas seulement le "laisser passer" par défaut.
function appliquerHeadersSecurite<T extends NextResponse>(res: T): T {
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  // Lot 1.5 (13/08/2026, remédiation) — corrigé de camera=(), geolocation=()
  // (blocage total) à camera=(self), geolocation=(self) : inventaire réel
  // du code a trouvé 8 fichiers utilisant navigator.geolocation (recherche
  // à proximité, carte, favoris, onboarding...) et le scanner QR institution
  // (app/institution/scanner/page.tsx, html5-qrcode) qui a besoin de la
  // caméra — la valeur précédente les aurait cassés dès que le matcher
  // ci-dessous (élargi à tout le site) serait réellement déployé. microphone
  // reste bloqué : aucune capture audio réelle trouvée dans le code
  // (app/compte/confidentialite/confidentialite-client.tsx ne fait qu'une
  // LECTURE de permission déjà accordée, jamais une demande d'accès —
  // non affectée par cette policy dans un sens ou l'autre).
  res.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)')
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  res.headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY)
  return res
}

// Renommé middleware() -> proxy() (revue critique 30/08/2026, même jour) :
// Next.js 16.2.1 exige "proxy.ts" exclusivement, rejette le build si
// "middleware.ts" et "proxy.ts" coexistent tous les deux. Fichier trouvé
// pendant cette même revue : une tentative de migration abandonnée le
// 19/08/2026 (jamais commitée, jamais retouchée depuis) avait déjà créé un
// proxy.ts, mais resté une copie figée de l'ancien middleware.ts —
// remplacé ici par le contenu à jour (toutes les corrections du
// 30/08/2026 incluses), middleware.ts supprimé.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ═══════════════════════════════════════════
  // SÉCURITÉ 1 — Headers de sécurité globaux
  // ═══════════════════════════════════════════
  const response = appliquerHeadersSecurite(NextResponse.next())

  // ═══════════════════════════════════════════
  // Assets statiques publics — exemptés de TOUTES les couches ci-dessous
  // (mur mobile, anti-abus edge/UA suspect, rate limiting, géoblocage).
  // Trouvé le 04/09/2026 (illustration support Yelen, next/image sur un
  // fichier local) : le fetch interne que next/image fait pour optimiser
  // une image locale n'envoie AUCUN user-agent — il se faisait donc
  // rejeter par estUserAgentSuspect() (UA vide = suspect par design) puis,
  // une fois cette couche contournée, par le mur mobile (UA vide n'est ni
  // mobile ni robot connu) : l'optimiseur recevait du JSON/HTML au lieu du
  // PNG ("isn't a valid image"). Contenu inerte non sensible, donc aucune
  // des couches de sécurité ci-dessous n'a de raison de s'y appliquer —
  // seuls les headers de sécurité globaux restent posés.
  // ═══════════════════════════════════════════
  const STATIC_ASSET_PREFIXES = ['/illustrations']
  if (STATIC_ASSET_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return response
  }

  // ═══════════════════════════════════════════
  // SÉCURITÉ 0 — Restriction géographique de pré-lancement
  // (mission sécurité, 09/08/2026, décision CEO) — désactivée par défaut
  // (GEO_BLOCK_ENABLED non défini/≠"true") : à activer par Bryan
  // uniquement après tests réels depuis plusieurs régions autorisées ET
  // non autorisées (voir lib/geoAccess.ts). Volontairement une couche
  // parmi d'autres, pas une protection anti-bot à elle seule — jamais de
  // détail technique renvoyé, une seule page premium neutre pour tout
  // visiteur hors zone. /api/** et /region-non-disponible exemptés :
  // webhooks/services tiers/monitoring ne doivent jamais être cassés par
  // cette couche, et il ne faut jamais rewriter la page de blocage
  // vers elle-même.
  if (
    process.env.GEO_BLOCK_ENABLED === 'true' &&
    pathname !== '/region-non-disponible' &&
    !pathname.startsWith('/api/')
  ) {
    const bypassToken = process.env.GEO_BYPASS_TOKEN
    const bypassCookie = request.cookies.get(GEO_BYPASS_COOKIE)?.value
    const aLeContournement = !!bypassToken && !!bypassCookie && timingSafeEqual(bypassCookie, bypassToken)

    if (!aLeContournement) {
      const geo = parseNetlifyGeo(request.headers.get('x-nf-geo'))
      let autorise = estRegionAutorisee(geo)
      let raison = 'pays_non_autorise'

      // VPN/proxy/datacenter (brief : "pays autorisé" ne suffit pas si l'IP
      // est un point de sortie VPN loué exprès pour se faire passer pour
      // une région autorisée). Signal optionnel (IPQS_API_KEY), skip si
      // déjà refusé par la géo (inutile de payer l'appel tiers) ou si la
      // clé n'est pas configurée (fail-open, voir lib/edgeSecurity.ts).
      if (autorise) {
        const ip = extraireIpClient(request)
        if (await estIpVpnOuProxy(ip)) { autorise = false; raison = 'vpn_proxy_datacenter' }
      }

      if (!autorise) {
        logSecurite('geo_bloque', { raison, pays: geo?.country?.code ?? null, subdivision: geo?.subdivision?.code ?? null, ip: extraireIpClient(request), path: pathname })
        return appliquerHeadersSecurite(NextResponse.rewrite(new URL('/region-non-disponible', request.url)))
      }
    }
  }

  // ═══════════════════════════════════════════
  // SÉCURITÉ 0 ter — Mur mobile-only citoyen (mission séparation
  // Citizen/Web, 12/08/2026, décision CEO) — désactivé par défaut
  // (MOBILE_WALL_ENABLED non défini/≠"true"), même discipline que le
  // géoblocage : à activer par Bryan uniquement après tests réels depuis
  // un vrai téléphone/tablette ET un vrai PC. Le Web professionnel
  // (institution/admin/clock), l'API, les pages légales/support partagées
  // avec le dashboard institution et les outils de vérification publique
  // restent toujours accessibles (lib/deviceAccess.ts). Robots/bots
  // d'aperçu de lien exemptés pour ne jamais casser un partage WhatsApp.
  // ═══════════════════════════════════════════
  // Bug trouvé en test réel (30/08/2026, vérification du parcours
  // ADMIN_ENTRY_TOKEN) : cheminExempteMurMobile() vérifie le chemin brut
  // ('/admin' en préfixe) — avec ADMIN_ENTRY_TOKEN actif, l'URL publique
  // réelle est '/{token}/admin/login', qui ne commence jamais par
  // '/admin' littéralement. Sans ce retrait de préfixe, un admin sur
  // mobile avec les deux fonctionnalités actives en même temps se faisait
  // rediriger vers /acces-mobile-requis avant même d'atteindre la page de
  // connexion — jamais détecté avant faute de test avec les deux
  // activées simultanément.
  const cheminPourMurMobile = (ADMIN_ENTRY_TOKEN && pathname.startsWith(`/${ADMIN_ENTRY_TOKEN}/`))
    ? pathname.slice(`/${ADMIN_ENTRY_TOKEN}`.length)
    : pathname
  if (
    process.env.MOBILE_WALL_ENABLED === 'true' &&
    !cheminExempteMurMobile(cheminPourMurMobile)
  ) {
    const ua = request.headers.get('user-agent')
    if (!estRobotOuApercu(ua) && !estAppareilMobile(ua)) {
      return appliquerHeadersSecurite(NextResponse.rewrite(new URL('/acces-mobile-requis', request.url)))
    }
  }

  // ═══════════════════════════════════════════
  // SÉCURITÉ 0 bis — Anti-abus edge (mission sécurité, 09/08/2026)
  // "Le géoblocage n'est qu'une couche" (brief CEO) : signatures d'outils
  // de scan/exploitation connus (toujours actif, zéro faux positif
  // attendu sur un client légitime) + rate limiting à deux niveaux
  // (générique par IP + seuil dédié plus bas sur les endpoints
  // d'authentification/récupération — "protection des endpoints
  // sensibles" du brief). Défense en profondeur, ne remplace pas les
  // rate limits déjà posés route par route (lib/auth/otp.ts etc.) — voir
  // lib/edgeSecurity.ts pour le détail des seuils et leurs limites
  // assumées.
  // ═══════════════════════════════════════════
  const userAgent = request.headers.get('user-agent')
  if (estUserAgentSuspect(userAgent)) {
    logSecurite('ua_suspect_bloque', { userAgent, ip: extraireIpClient(request), path: pathname })
    return appliquerHeadersSecurite(NextResponse.json({ error: 'Requête refusée' }, { status: 403 }))
  }
  if (process.env.EDGE_RATE_LIMIT_ENABLED === 'true') {
    const ip = extraireIpClient(request)
    if (estRateLimite(`global:${ip}`)) {
      logSecurite('rate_limit_global', { ip, path: pathname })
      return appliquerHeadersSecurite(NextResponse.json({ error: 'Trop de requêtes, réessayez dans un instant.' }, { status: 429 }))
    }
    const seuilSensible = seuilEndpointSensible(pathname)
    if (seuilSensible !== null && estRateLimite(`sensible:${ip}`, seuilSensible)) {
      logSecurite('rate_limit_endpoint_sensible', { ip, path: pathname, seuil: seuilSensible })
      return appliquerHeadersSecurite(NextResponse.json({ error: 'Trop de tentatives, réessayez dans un instant.' }, { status: 429 }))
    }
  }

  // ═══════════════════════════════════════════
  // SÉCURITÉ 2 — Protection routes /admin/*
  //
  // Point 1 du brief (30/08/2026) : /admin en dur ne doit jamais révéler
  // qu'une console existe à un visiteur qui n'a jamais été authentifié.
  // Dès que ADMIN_ENTRY_TOKEN est configuré : un /admin/* en dur SANS
  // aucun cookie de session admin (même expiré/invalide) → 404 muet,
  // jamais un redirect vers une page de login visible. Un admin qui a
  // DÉJÀ un cookie (valide ou expiré) continue de passer par la logique
  // normale ci-dessous (redirect vers login si invalide) — condition
  // volontaire : la navigation interne du dashboard (liens, router.push)
  // pointe massivement vers des chemins /admin/* en dur, jamais préfixés
  // par le token ; casser ça pour un admin déjà connecté briserait tout
  // le dashboard. Seul le tout premier accès (aucun cookie du tout, donc
  // navigateur jamais authentifié sur ce poste, ou cookies effacés) doit
  // passer par /{ADMIN_ENTRY_TOKEN}/admin/login — réécrit en interne vers
  // /admin/login, qui pose le cookie ; toute navigation suivante
  // redevient un /admin/* en dur normal.
  // Rappel du brief (point 8) : cette URL n'est qu'une PREMIÈRE couche,
  // jamais le mécanisme d'autorisation — JWT/MFA ci-dessous restent la
  // vraie protection, strictement inchangés par ce point.
  // ═══════════════════════════════════════════
  const estCheminAdminBrut = pathname === '/admin' || pathname.startsWith('/admin/')
  const prefixeAdminToken = ADMIN_ENTRY_TOKEN ? `/${ADMIN_ENTRY_TOKEN}` : null
  const estCheminAdminViaToken = !!prefixeAdminToken &&
    (pathname === `${prefixeAdminToken}/admin` || pathname.startsWith(`${prefixeAdminToken}/admin/`))

  if (estCheminAdminBrut || estCheminAdminViaToken) {
    // Chemin réel côté app (sans le préfixe secret, qui n'existe pas sur
    // disque — les pages restent à app/admin/*, seule l'URL publique
    // change) et base à réutiliser pour tout redirect généré ci-dessous,
    // pour ne jamais renvoyer un admin non-connecté vers un /admin/login
    // en dur si son entrée s'est faite par le token.
    const cheminInterne = estCheminAdminViaToken ? pathname.slice(prefixeAdminToken!.length) : pathname
    const basePublique = estCheminAdminViaToken ? prefixeAdminToken! : ''

    const reecrireSiBesoin = (res: NextResponse) => {
      if (!estCheminAdminViaToken) return res
      const url = new URL(cheminInterne + request.nextUrl.search, request.url)
      return appliquerHeadersSecurite(NextResponse.rewrite(url))
    }

    // Revue critique 31/08/2026 (écart Lot 3) — validité RÉELLE de la
    // session calculée une seule fois ici, réutilisée plus bas. Avant ce
    // correctif, le garde-fou grant/token juste en dessous ne testait que
    // la PRÉSENCE du cookie `yelen224_admin_session`, jamais sa validité :
    // un client HTTP direct (curl/Burp, aucun navigateur requis) envoyant
    // `Cookie: yelen224_admin_session=n'importe-quoi` faisait sauter le
    // garde-fou entièrement, atteignait la route publique /admin/login
    // (PUBLIC_ADMIN_ROUTES, plus bas) SANS jamais vérifier le JWT — bypass
    // complet de l'obscurcissement (point 1 du brief : un visiteur jamais
    // authentifié ne doit jamais découvrir que la console existe), sans
    // connaître ADMIN_ENTRY_TOKEN ni posséder de credential WebAuthn.
    // Coût : un JWT présent mais expiré/révoqué (session normale expirée
    // en cours de navigation) tombe désormais aussi sous le garde-fou
    // grant/token au lieu d'un redirect direct vers /admin/login — compromis
    // assumé (sécurité avant confort), l'admin repasse par /entree-admin
    // (WebAuthn) ou l'URL à token.
    const adminToken = request.cookies.get('yelen224_admin_session')?.value
    const sessionAdmin = adminToken ? await verifierTokenAdmin(adminToken) : { valide: false, mfaEnabled: false }

    // Admin Entry Security V2 — Lot 3 (30/08/2026) : coexistence OBLIGATOIRE
    // avec V1 pendant toute la migration (décision CEO, section 6) — un
    // grant WebAuthn valide (/entree-admin) lève le même 404 muet qu'un
    // accès via le lien secret ADMIN_ENTRY_TOKEN, sans que V1 soit modifiée
    // d'aucune façon (le test du token ci-dessous reste identique). Un
    // grant seul ne fait que passer cette porte — il n'est jamais accepté
    // par la vérification JWT/admin_sessions qui suit, donc n'accède
    // jamais au dashboard.
    if (estCheminAdminBrut && ADMIN_ENTRY_TOKEN && !sessionAdmin.valide) {
      const grantValide = await verifierGrantEntreeAdmin(request)
      if (!grantValide) {
        return appliquerHeadersSecurite(NextResponse.rewrite(new URL('/__route_inexistante__', request.url)))
      }
    }

    // Routes publiques → laisser passer (réécrites en interne si accès via token)
    if (PUBLIC_ADMIN_ROUTES.some(route => cheminInterne.startsWith(route))) {
      return reecrireSiBesoin(response)
    }

    if (!adminToken) {
      // Pas de session → redirect login (vers l'URL publique réellement
      // utilisée : préfixée si l'accès s'est fait par le token)
      const loginUrl = new URL(`${basePublique}/admin/login`, request.url)
      loginUrl.searchParams.set('redirect', `${basePublique}${cheminInterne}`)
      return appliquerHeadersSecurite(NextResponse.redirect(loginUrl))
    }

    // Vérification réelle de la signature JWT déjà faite ci-dessus
    // (sessionAdmin) — réutilisée ici, jamais recalculée deux fois.
    const { valide, mfaEnabled } = sessionAdmin
    if (!valide) {
      logSecurite('admin_token_invalide', { path: cheminInterne, ip: extraireIpClient(request) })
      const loginUrl = new URL(`${basePublique}/admin/login`, request.url)
      loginUrl.searchParams.set('redirect', `${basePublique}${cheminInterne}`)
      const redirectResponse = appliquerHeadersSecurite(NextResponse.redirect(loginUrl))
      redirectResponse.cookies.delete('yelen224_admin_session')
      return redirectResponse
    }

    // MFA obligatoire (chantier MFA Admin, décision CEO 13/08/2026,
    // GAP-04-03) — un compte sans 2FA active est redirigé vers l'écran de
    // configuration, seul chemin encore accessible tant qu'elle n'est pas
    // activée.
    if (!mfaEnabled && !MFA_EXEMPT_ADMIN_ROUTES.some(route => cheminInterne.startsWith(route))) {
      return appliquerHeadersSecurite(NextResponse.redirect(new URL(`${basePublique}/admin/security`, request.url)))
    }

    // Sécurisation Logout Admin (décision CEO 03/09/2026) — empêche qu'une
    // page admin déjà rendue (dashboard, données citoyennes/institution)
    // reste exposable via le bouton Back / bfcache une fois la session
    // révoquée : sans no-store, le navigateur peut restaurer le DOM déjà
    // peint sans repasser par ce middleware. Ne touche que la réponse
    // d'une session authentifiée valide — /admin/login (PUBLIC_ADMIN_ROUTES,
    // plus haut) et les redirects ne passent jamais par cette ligne.
    const pageAuthentifiee = reecrireSiBesoin(response)
    pageAuthentifiee.headers.set('Cache-Control', 'no-store')
    return pageAuthentifiee
  }

  // ═══════════════════════════════════════════
  // SÉCURITÉ 3 — Protection routes /api/admin/*
  // ═══════════════════════════════════════════
  if (pathname.startsWith('/api/admin')) {
    // Routes API publiques → laisser passer
    if (PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))) {
      return response
    }

    const adminToken = request.cookies.get('yelen224_admin_session')?.value

    if (!adminToken) {
      return appliquerHeadersSecurite(NextResponse.json(
        { error: 'Non autorisé', code: 'NO_SESSION' },
        { status: 401 }
      ))
    }

    const { valide, mfaEnabled } = await verifierTokenAdmin(adminToken)
    if (!valide) {
      logSecurite('admin_token_invalide', { path: pathname, ip: extraireIpClient(request) })
      return appliquerHeadersSecurite(NextResponse.json(
        { error: 'Session invalide ou expirée', code: 'INVALID_SESSION' },
        { status: 401 }
      ))
    }

    if (!mfaEnabled && !MFA_EXEMPT_API_ROUTES.some(route => pathname.startsWith(route))) {
      return appliquerHeadersSecurite(NextResponse.json(
        { error: 'Configuration de la double authentification requise avant de continuer.', code: 'MFA_SETUP_REQUIRED' },
        { status: 403 }
      ))
    }

    return response
  }

  return response
}

export const config = {
  // Élargi le 09/08/2026 (mission sécurité) : la restriction géographique
  // doit s'appliquer à tout le site, pas seulement /admin — les deux
  // matchers précédents ('/admin/:path*', '/api/admin/:path*') restent
  // couverts par ce pattern plus large, leur logique de protection JWT
  // est inchangée dans le corps de la fonction ci-dessus.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-|apple-touch-icon|robots.txt|sitemap.xml).*)',
  ],
}
