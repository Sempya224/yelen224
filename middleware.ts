import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// Routes publiques admin (pas de protection)
const PUBLIC_ADMIN_ROUTES = ['/admin/login']

// Toutes les routes API admin publiques
const PUBLIC_API_ROUTES = ['/api/admin/auth/login']

const ADMIN_JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

// Vérification réelle de signature — avant, le middleware ne contrôlait
// que le format (3 segments séparés par des points), la vraie
// vérification n'avait lieu que dans chaque route API individuellement.
// Un cookie forgé au bon format passait donc jusqu'à la page/route
// avant d'être rejeté. Durci le 19/07/2026 : même secret/issuer/
// audience que app/api/admin/auth/login/route.ts.
async function adminTokenValide(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, ADMIN_JWT_SECRET, {
      issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard',
    })
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ═══════════════════════════════════════════
  // SÉCURITÉ 1 — Headers de sécurité globaux
  // ═══════════════════════════════════════════
  const response = NextResponse.next()

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )

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
      return NextResponse.redirect(loginUrl)
    }

    // Vérification réelle de la signature JWT (plus un simple contrôle
    // de format) — un token invalide/expiré/forgé est rejeté ici, avant
    // d'atteindre la page.
    if (!(await adminTokenValide(adminToken))) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      const redirectResponse = NextResponse.redirect(loginUrl)
      redirectResponse.cookies.delete('yelen224_admin_session')
      return redirectResponse
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
      return NextResponse.json(
        { error: 'Non autorisé', code: 'NO_SESSION' },
        { status: 401 }
      )
    }

    if (!(await adminTokenValide(adminToken))) {
      return NextResponse.json(
        { error: 'Session invalide ou expirée', code: 'INVALID_SESSION' },
        { status: 401 }
      )
    }

    return response
  }

  return response
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}