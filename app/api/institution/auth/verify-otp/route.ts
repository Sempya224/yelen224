import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

// ⚠️ DEV MODE — décision assumée de Bryan (voir CLAUDE.md /auth), pas une dette
// à corriger sans demande explicite.
const DEV_OTP = '123456'

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function lockedMsRemaining(identifier: string): number {
  const entry = failedAttempts.get(identifier)
  if (!entry) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

function registerFailure(identifier: string) {
  const now = Date.now()
  const entry = failedAttempts.get(identifier)
  // Un lockedUntil dépassé signifie que le lockout précédent est terminé : on repart à zéro.
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0
  failedAttempts.set(identifier, { count, lockedUntil })
}

function clearFailures(identifier: string) {
  failedAttempts.delete(identifier)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { institutionId, phone: rawPhone, code, rememberMe } = body

    const hasInstitutionId = typeof institutionId === 'string' && institutionId.length > 0
    const hasPhone = typeof rawPhone === 'string' && rawPhone.length > 0

    if (hasInstitutionId === hasPhone) {
      return NextResponse.json(
        { error: 'Fournir institutionId (connexion) ou phone (inscription), pas les deux', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'code requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const identifier: string = hasInstitutionId ? institutionId : rawPhone

    if (lockedMsRemaining(identifier) > 0) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' },
        { status: 429 }
      )
    }

    let phone: string
    let institution: { id: string; phone: string; name: string } | null = null

    if (hasInstitutionId) {
      const { data, error: dbError } = await supabaseAdmin
        .from('institutions')
        .select('id, phone, name')
        .eq('id', institutionId)
        .single()

      if (dbError || !data) {
        return NextResponse.json(
          { error: 'Institution introuvable', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }
      institution = data
      phone = data.phone
    } else {
      phone = rawPhone
    }

    let verified = false

    if (code === DEV_OTP) {
      verified = true
    } else {
      const { data: otpRow } = await supabaseAdmin
        .from('institution_otp')
        .select('id')
        .eq('phone', phone)
        .eq('code', code)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (otpRow) {
        await supabaseAdmin.from('institution_otp').delete().eq('id', otpRow.id)
        verified = true
      }
    }

    if (!verified) {
      registerFailure(identifier)
      return NextResponse.json(
        { error: 'Code incorrect', code: 'INVALID_CODE' },
        { status: 401 }
      )
    }

    clearFailures(identifier)

    // Flux inscription : téléphone confirmé, aucune institution à connecter pour l'instant.
    if (!institution) {
      return NextResponse.json({ success: true, phoneVerified: true })
    }

    // Flux connexion : session complète

    // Fondation multi-comptes (migration 20260714000001) — inclut membreId/
    // role dans le même JWT si le membre Admin principal existe déjà.
    const { data: membrePrincipal } = await supabaseAdmin
      .from('institution_membres')
      .select('id, role')
      .eq('institution_id', institution.id)
      .eq('compte_principal', true)
      .maybeSingle()

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

    const response = NextResponse.json({
      success: true,
      institution: { id: institution.id, name: institution.name },
    })

    response.cookies.set('yelen224_institution_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    // "Se souvenir de moi" — un token aléatoire à haute entropie (256 bits),
    // haché en SHA-256 (pas bcrypt : bcrypt sert à ralentir le brute-force
    // sur des secrets faibles comme un PIN ou un mot de passe ; ici le
    // token est déjà impossible à deviner, un hash rapide suffit et évite
    // un coût CPU inutile). Seul le hash est stocké, révocable par ligne.
    if (rememberMe === true) {
      const rawToken = crypto.randomBytes(32).toString('base64url')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

      await supabaseAdmin.from('institution_remember_tokens').insert({
        institution_id: institution.id,
        token_hash: tokenHash,
        user_agent: request.headers.get('user-agent'),
        expires_at: expiresAt,
      })

      response.cookies.set('yelen224_institution_remember', rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 24 * 60 * 60,
        path: '/',
      })
    }

    return response

  } catch (error) {
    console.error('[INSTITUTION AUTH ERROR]', error)
    return NextResponse.json(
      { error: 'Erreur serveur', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
