import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { mintInstitutionTotpChallengeToken } from '@/lib/auth/institutionSession'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

const ipAttempts = new Map<string, { count: number; resetAt: number }>()
// Verrouillage plus long que l'OTP (15 min vs 5 min) : un code à 4-8
// chiffres a beaucoup moins d'entropie qu'un OTP à 6 chiffres à usage
// unique, donc le frein contre le brute-force doit être plus sévère.
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

function lockedMsRemaining(institutionId: string): number {
  const entry = failedAttempts.get(institutionId)
  if (!entry) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

function registerFailure(institutionId: string) {
  const now = Date.now()
  const entry = failedAttempts.get(institutionId)
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1
  const lockedUntil = count >= 5 ? now + 15 * 60 * 1000 : 0
  failedAttempts.set(institutionId, { count, lockedUntil })
}

function clearFailures(institutionId: string) {
  failedAttempts.delete(institutionId)
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
    const { institutionId, pin } = body

    if (!institutionId || typeof institutionId !== 'string' || !pin || typeof pin !== 'string') {
      return NextResponse.json({ error: 'Requête incomplète', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    const lockedMs = lockedMsRemaining(institutionId)
    if (lockedMs > 0) {
      return NextResponse.json(
        { error: `Trop de tentatives. Réessayez dans ${Math.ceil(lockedMs / 60000)} minute(s).`, code: 'LOCKED' },
        { status: 429 }
      )
    }

    const { data: institution } = await supabaseAdmin
      .from('institutions')
      .select('id, name, phone, pin_hash')
      .eq('id', institutionId)
      .single()

    if (!institution || !institution.pin_hash) {
      return NextResponse.json(
        { error: 'Aucun code de déverrouillage configuré pour cette institution', code: 'NOT_CONFIGURED' },
        { status: 404 }
      )
    }

    const valid = await bcrypt.compare(pin, institution.pin_hash)

    if (!valid) {
      registerFailure(institutionId)
      return NextResponse.json({ error: 'Code incorrect', code: 'INVALID_PIN' }, { status: 401 })
    }

    clearFailures(institutionId)

    // Fondation multi-comptes (migration 20260714000001) — inclut membreId/
    // role dans le même JWT si le membre Admin principal existe déjà.
    const { data: membrePrincipal } = await supabaseAdmin
      .from('institution_membres')
      .select('id, role, totp_enabled')
      .eq('institution_id', institution.id)
      .eq('compte_principal', true)
      .maybeSingle()

    // 2FA TOTP (chantier sécurité institution 25/07/2026) — voir verify-otp/route.ts.
    if (membrePrincipal?.totp_enabled) {
      const totpToken = await mintInstitutionTotpChallengeToken({
        institutionId: institution.id,
        membreId: membrePrincipal.id,
        role: membrePrincipal.role,
        rememberMe: false,
      })
      return NextResponse.json({ requiresTotp: true, totpToken })
    }

    const token = await new SignJWT({
      institutionId: institution.id,
      ...(membrePrincipal ? { membreId: membrePrincipal.id, role: membrePrincipal.role } : {}),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(institution.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('yelen224-institution')
      .setAudience('yelen224-institution-dashboard')
      .sign(JWT_SECRET)

    await supabaseAdmin.from('institution_sessions').insert({
      institution_id: institution.id,
      phone: institution.phone,
      user_agent: request.headers.get('user-agent'),
      is_active: true,
    })

    const response = NextResponse.json({ success: true, institution: { id: institution.id, name: institution.name } })

    response.cookies.set('yelen224_institution_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response

  } catch (error) {
    console.error('[INSTITUTION PIN VERIFY ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
