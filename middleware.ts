import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { GEO_BYPASS_COOKIE, estRegionAutorisee, parseNetlifyGeo, timingSafeEqual } from '@/lib/geoAccess'
import { estIpVpnOuProxy, estRateLimite, estUserAgentSuspect, extraireIpClient, logSecurite, seuilEndpointSensible } from '@/lib/edgeSecurity'
import { cheminExempteMurMobile, estAppareilMobile, estRobotOuApercu } from '@/lib/deviceAccess'

// Routes publiques admin (pas de protection)
const PUBLIC_ADMIN_ROUTES = ['/admin/login']

// Toutes les routes API admin publiques
const PUBLIC_API_ROUTES = ['/api/admin/auth/login']

// Chantier MFA Admin (décision CEO 13/08/2026, GAP-04-03) — seuls ces
// chemins restent accessibles à un compte dont la 2FA n'est pas encore
// active, le temps qu'il la configure. /admin/security héberge l'écran
// de configuration (app/admin/security/page.tsx) ; les 3 routes 2fa/*
// sont ce que cet écran appelle pour générer/confirmer le secret TOTP ;
// auth/me et auth/logout doivent toujours rester joignables.
const MFA_EXEMPT_ADMIN_ROUTES = ['/admin/security']
const MFA_EXEMPT_API_ROUTES = ['/api/admin/auth/logout', '/api/admin/auth/me', '/api/admin/auth/2fa/', '/api/admin/auth/change-password']

const ADMIN_JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ═══════════════════════════════════════════
  // SÉCURITÉ 1 — Headers de sécurité globaux
  // ═══════════════════════════════════════════
  const response = appliquerHeadersSecurite(NextResponse.next())

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
  if (
    process.env.MOBILE_WALL_ENABLED === 'true' &&
    !cheminExempteMurMobile(pathname)
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
  // ═══════════════════════════════════════════
  if (pathname.startsWith('/admin')) {
    // Routes publiques → laisser passer
    if (PUBLIC_ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      return response
    }

    // Vérifier le token de session admin
    const adminToken = request.cookies.get('yelen224_admin_session')?.value

    if (!adminToken) {
      // Pas de session → redirect login
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return appliquerHeadersSecurite(NextResponse.redirect(loginUrl))
    }

    // Vérification réelle de la signature JWT (plus un simple contrôle
    // de format) — un token invalide/expiré/forgé est rejeté ici, avant
    // d'atteindre la page.
    const { valide, mfaEnabled } = await verifierTokenAdmin(adminToken)
    if (!valide) {
      logSecurite('admin_token_invalide', { path: pathname, ip: extraireIpClient(request) })
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      const redirectResponse = appliquerHeadersSecurite(NextResponse.redirect(loginUrl))
      redirectResponse.cookies.delete('yelen224_admin_session')
      return redirectResponse
    }

    // MFA obligatoire (chantier MFA Admin, décision CEO 13/08/2026,
    // GAP-04-03) — un compte sans 2FA active est redirigé vers l'écran de
    // configuration, seul chemin encore accessible tant qu'elle n'est pas
    // activée.
    if (!mfaEnabled && !MFA_EXEMPT_ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      return appliquerHeadersSecurite(NextResponse.redirect(new URL('/admin/security', request.url)))
    }

    return response
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