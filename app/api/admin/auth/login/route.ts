import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
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

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Format invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    if (password.length > 128) {
      return NextResponse.json(
        { error: 'Format invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    // Récupérer l'admin
    const { data: admin, error: dbError } = await supabaseAdmin
      .from('admin_users')
      .select('id, email, password_hash, role, nom, is_active')
      .eq('email', email.toLowerCase().trim())
      .single()

    // Protection timing attack
    const dummyHash = '$2b$12$KIx6TzCxFLkjY8mFbWqH8OqK5LzCxFLkjY8mFbWqH8OqK5LzCxFL'
    const hashToCompare = admin?.password_hash || dummyHash
    const passwordValid = await bcrypt.compare(password, hashToCompare)

    if (dbError || !admin || !passwordValid) {
      return NextResponse.json(
        { error: 'Email ou mot de passe incorrect', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      )
    }

    if (!admin.is_active) {
      return NextResponse.json(
        { error: 'Compte désactivé. Contactez le super admin.', code: 'ACCOUNT_DISABLED' },
        { status: 403 }
      )
    }

    // Générer JWT
    const token = await new SignJWT({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      nom: admin.nom,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('yelen224-admin')
      .setAudience('yelen224-admin-dashboard')
      .sign(JWT_SECRET)

    // Log connexion
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'LOGIN',
      details: { ip, user_agent: request.headers.get('user-agent') },
    })

    // Mettre à jour last_login
    await supabaseAdmin
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id)

    // Réponse avec cookie HttpOnly
    const response = NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        nom: admin.nom,
      }
    })

    response.cookies.set('yelen224_admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response

  } catch (error) {
    console.error('[ADMIN AUTH ERROR]', error)
    return NextResponse.json(
      { error: 'Erreur serveur', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}