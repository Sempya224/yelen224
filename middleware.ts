import { NextRequest, NextResponse } from 'next/server'

// Routes publiques admin (pas de protection)
const PUBLIC_ADMIN_ROUTES = ['/admin/login']

// Toutes les routes API admin publiques
const PUBLIC_API_ROUTES = ['/api/admin/auth/login']

export function middleware(request: NextRequest) {
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

    // Vérifier format basique du token (JWT-like)
    const parts = adminToken.split('.')
    if (parts.length !== 3) {
      const response = NextResponse.redirect(new URL('/admin/login', request.url))
      response.cookies.delete('yelen224_admin_session')
      return response
    }

    // Token présent → laisser passer (vérification complète côté API/page)
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