import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifierOtp } from '@/lib/auth/otp'
import { completerConnexionCitoyen, mintTotpChallengeToken, CITOYEN_REMEMBER_MAX_AGE_S } from '@/lib/auth/citoyenSession'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/

const ipAttempts = new Map<string, { count: number; resetAt: number }>()

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'

    if (!checkIpRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { phone, code } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'code requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, totp_enabled')
      .eq('phone', phone)
      .maybeSingle()

    if (dbError || !user) {
      return NextResponse.json(
        { error: 'Compte introuvable', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // Vérification réelle contre le code haché stocké pour ce citoyen
    // (retour Bryan 25/07/2026) — remplace l'ancienne comparaison à une
    // constante fixe. Le code est consommé qu'il soit juste ou faux : une
    // seule tentative possible, il faut redemander un code (retour à
    // l'étape numéro) sinon.
    const otpResult = await verifierOtp(supabaseAdmin, user.id, code)
    if (!otpResult.ok) {
      const messages: Record<typeof otpResult.reason, string> = {
        aucun_code: 'Aucun code en attente. Redemandez un code.',
        expire: 'Ce code a expiré. Redemandez un code.',
        incorrect: 'Code incorrect. Redemandez un code.',
      }
      return NextResponse.json(
        { error: messages[otpResult.reason], code: 'INVALID_CODE', reason: otpResult.reason },
        { status: 401 }
      )
    }

    // 2FA TOTP (chantier sécurité citoyen 25/07/2026) — le facteur
    // principal (OTP) vient de réussir, mais on ne finalise la connexion
    // (mint session + cookie "se souvenir") qu'après validation du code
    // TOTP, via /api/citoyen/auth/totp/login-verify.
    if (user.totp_enabled) {
      const totpToken = await mintTotpChallengeToken(user.id)
      return NextResponse.json({ requiresTotp: true, totpToken })
    }

    const { tokenHash, remember } = await completerConnexionCitoyen(supabaseAdmin, user.id, request)

    const response = NextResponse.json({ success: true, userId: user.id, tokenHash })

    if (remember) {
      response.cookies.set('yelen224_citoyen_remember', remember.rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: CITOYEN_REMEMBER_MAX_AGE_S,
        path: '/',
      })
    }

    return response

  } catch (error) {
    console.error('[CITOYEN VERIFY ERROR]', error)
    return NextResponse.json(
      { error: 'Erreur serveur', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
