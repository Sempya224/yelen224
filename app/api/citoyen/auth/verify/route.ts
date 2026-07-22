import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { YELEN224_OTP_SIMULE } from '@/lib/auth/constants'
import { mintCitoyenSessionTokenHash, enregistrerConnexionCitoyen, CITOYEN_REMEMBER_MAX_AGE_S } from '@/lib/auth/citoyenSession'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/

const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

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

function lockedMsRemaining(phone: string): number {
  const entry = failedAttempts.get(phone)
  if (!entry) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

function registerFailure(phone: string) {
  const now = Date.now()
  const entry = failedAttempts.get(phone)
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0
  failedAttempts.set(phone, { count, lockedUntil })
}

function clearFailures(phone: string) {
  failedAttempts.delete(phone)
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

    if (lockedMsRemaining(phone) > 0) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' },
        { status: 429 }
      )
    }

    // ⚠️ DEV MODE — code OTP simulé, décision assumée de Bryan (voir CLAUDE.md /auth).
    if (code !== YELEN224_OTP_SIMULE) {
      registerFailure(phone)
      return NextResponse.json(
        { error: 'Code incorrect', code: 'INVALID_CODE' },
        { status: 401 }
      )
    }

    clearFailures(phone)

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (dbError || !user) {
      return NextResponse.json(
        { error: 'Compte introuvable', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const sessionResult = await mintCitoyenSessionTokenHash(supabaseAdmin, user.id)
    const tokenHash = 'tokenHash' in sessionResult ? sessionResult.tokenHash : null
    if ('error' in sessionResult) {
      console.error('[CITOYEN VERIFY SESSION MINT ERROR]', sessionResult.error)
    }

    const remember = await enregistrerConnexionCitoyen(supabaseAdmin, user.id, request)

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
