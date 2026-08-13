import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { verify as verifyTotp } from 'otplib'

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
    const { email, password, totp_code: totpCode } = body

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
      .select('id, email, password_hash, role, nom, is_active, failed_login_attempts, locked_until, totp_enabled, totp_secret, totp_backup_codes')
      .eq('email', email.toLowerCase().trim())
      .single()

    // Verrouillage de compte persistant — vérifié avant toute
    // comparaison de mot de passe, tant qu'il n'a pas expiré. Complète
    // le rate-limit IP ci-dessus (celui-ci ne survit pas à un
    // changement d'IP ni à un redémarrage du process).
    if (admin?.locked_until && new Date(admin.locked_until) > new Date()) {
      const minutesRestantes = Math.ceil((new Date(admin.locked_until).getTime() - Date.now()) / 60000)
      return NextResponse.json(
        { error: `Compte verrouillé suite à plusieurs échecs. Réessayez dans ${minutesRestantes} min.`, code: 'ACCOUNT_LOCKED' },
        { status: 429 }
      )
    }

    // Protection timing attack
    const dummyHash = '$2b$12$KIx6TzCxFLkjY8mFbWqH8OqK5LzCxFLkjY8mFbWqH8OqK5LzCxFL'
    const hashToCompare = admin?.password_hash || dummyHash
    const passwordValid = await bcrypt.compare(password, hashToCompare)

    if (dbError || !admin || !passwordValid) {
      // Incrémente le compteur d'échecs uniquement si le compte existe
      // réellement (sinon on révélerait son existence par un effet de
      // bord en base). Verrouille 30 min au 5e échec consécutif.
      if (admin) {
        const attempts = (admin.failed_login_attempts ?? 0) + 1
        const updates: Record<string, unknown> = { failed_login_attempts: attempts }
        if (attempts >= 5) updates.locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString()
        await supabaseAdmin.from('admin_users').update(updates).eq('id', admin.id)
      }
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

    // 2FA TOTP (chantier "Sécurité" admin, 24/07/2026) — vérifié après le
    // mot de passe mais avant l'émission du JWT. Sans code fourni, on
    // redemande une étape supplémentaire (pas une erreur) ; avec un code
    // fourni mais invalide, même traitement qu'un mot de passe invalide
    // (compteur d'échecs/verrouillage), pour ne jamais révéler lequel des
    // deux facteurs a échoué.
    if (admin.totp_enabled) {
      if (typeof totpCode !== 'string' || !totpCode) {
        return NextResponse.json({ requiresTotp: true })
      }

      let totpValide = admin.totp_secret ? (await verifyTotp({ secret: admin.totp_secret, token: totpCode })).valid : false
      if (!totpValide && Array.isArray(admin.totp_backup_codes)) {
        const codes: string[] = admin.totp_backup_codes
        for (let i = 0; i < codes.length; i++) {
          if (await bcrypt.compare(totpCode, codes[i])) {
            totpValide = true
            const restants = [...codes]
            restants.splice(i, 1)
            await supabaseAdmin.from('admin_users').update({ totp_backup_codes: restants }).eq('id', admin.id)
            break
          }
        }
      }

      if (!totpValide) {
        const attempts = (admin.failed_login_attempts ?? 0) + 1
        const updates: Record<string, unknown> = { failed_login_attempts: attempts }
        if (attempts >= 5) updates.locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString()
        await supabaseAdmin.from('admin_users').update(updates).eq('id', admin.id)
        return NextResponse.json(
          { error: 'Code de vérification incorrect', code: 'INVALID_CREDENTIALS' },
          { status: 401 }
        )
      }
    }

    // Connexion réussie — remettre le compteur d'échecs à zéro
    if (admin.failed_login_attempts > 0 || admin.locked_until) {
      await supabaseAdmin.from('admin_users').update({ failed_login_attempts: 0, locked_until: null }).eq('id', admin.id)
    }

    // Générer JWT — mfaEnabled ajouté le 13/08/2026 (chantier MFA Admin,
    // décision CEO GAP-04-03) : reflète l'état réel au moment de la
    // connexion (si totp_enabled était true, le code TOTP vient d'être
    // vérifié ci-dessus avant d'atteindre ce point). Lu par middleware.ts
    // pour imposer la configuration 2FA aux comptes qui ne l'ont pas
    // encore activée.
    const token = await new SignJWT({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      nom: admin.nom,
      mfaEnabled: admin.totp_enabled === true,
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