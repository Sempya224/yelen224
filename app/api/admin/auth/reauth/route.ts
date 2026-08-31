import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { verify as verifyTotp } from 'otplib'
import { verifyAdminSession, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

// Réauthentification pour actions critiques (Mission Hardening Admin,
// point 5, 30/08/2026) — une session admin valide ne suffit plus pour
// les opérations listées dans le brief (modifier/supprimer un compte
// admin, export de données sensibles, déblocage sécurité) : le mot de
// passe (+ TOTP si actif) doit être reconfirmé ici dans les 10 dernières
// minutes (REAUTH_WINDOW_MS, lib/adminAuth.ts). Les routes concernées
// appellent verifyRecentReauth(session) après authorizeAdmin().
//
// Rotation de session (point 7 : "rotation du session ID après
// authentification/réauthentification") : une réauth réussie mint une
// NOUVELLE session (nouveau sid, nouveau cookie), révoque l'ancienne —
// jamais une simple mise à jour en place.
export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof verifyAdminSession>>
  try {
    session = await verifyAdminSession(request)
  } catch (err) {
    return adminAuthErrorResponse(err)
  }

  try {
    const body = await request.json().catch(() => null)
    const password = body?.password
    const totpCode = body?.totp_code
    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Mot de passe requis', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    const { data: admin } = await supabaseAdmin
      .from('admin_users')
      .select('id, password_hash, totp_enabled, totp_secret, totp_backup_codes, failed_login_attempts, locked_until')
      .eq('id', session.adminId)
      .maybeSingle()
    if (!admin) return NextResponse.json({ error: 'Compte introuvable', code: 'NOT_FOUND' }, { status: 404 })

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      const minutesRestantes = Math.ceil((new Date(admin.locked_until).getTime() - Date.now()) / 60000)
      return NextResponse.json({ error: `Compte verrouillé suite à plusieurs échecs. Réessayez dans ${minutesRestantes} min.`, code: 'ACCOUNT_LOCKED' }, { status: 429 })
    }

    const echec = async (raison: string) => {
      const attempts = (admin.failed_login_attempts ?? 0) + 1
      const updates: Record<string, unknown> = { failed_login_attempts: attempts }
      if (attempts >= 5) updates.locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      await supabaseAdmin.from('admin_users').update(updates).eq('id', admin.id)
      await supabaseAdmin.from('admin_logs').insert({
        admin_id: admin.id, action: 'REAUTH_FAILED', details: { reason: raison },
      })
    }

    const passwordValide = await bcrypt.compare(password, admin.password_hash)
    if (!passwordValide) {
      await echec('mot_de_passe_incorrect')
      return NextResponse.json({ error: 'Mot de passe incorrect', code: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    if (admin.totp_enabled) {
      if (typeof totpCode !== 'string' || !totpCode) {
        return NextResponse.json({ requiresTotp: true }, { status: 200 })
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
        await echec('totp_incorrect')
        return NextResponse.json({ error: 'Code de vérification incorrect', code: 'INVALID_CREDENTIALS' }, { status: 401 })
      }
    }

    if (admin.failed_login_attempts > 0 || admin.locked_until) {
      await supabaseAdmin.from('admin_users').update({ failed_login_attempts: 0, locked_until: null }).eq('id', admin.id)
    }

    // Rotation — nouvelle session, ancienne révoquée.
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
    const nowIso = new Date().toISOString()
    const { data: nouvelleSession, error: sessionError } = await supabaseAdmin
      .from('admin_sessions')
      .insert({
        admin_id: admin.id, expires_at: expiresAt, reauth_at: nowIso,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
        user_agent: request.headers.get('user-agent'),
      })
      .select('id')
      .single()
    if (sessionError || !nouvelleSession) {
      console.error('[ADMIN REAUTH] Erreur création admin_sessions:', sessionError?.message)
      return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
    }

    await supabaseAdmin
      .from('admin_sessions')
      .update({ revoked_at: nowIso, revoked_reason: 'reauth_rotation' })
      .eq('id', session.sid)

    await supabaseAdmin.from('admin_logs').insert({ admin_id: admin.id, action: 'REAUTH_SUCCESS' })

    const token = await new SignJWT({
      adminId: admin.id,
      email: session.email,
      role: session.role,
      nom: session.nom,
      mfaEnabled: admin.totp_enabled === true,
      sid: nouvelleSession.id,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('yelen224-admin')
      .setAudience('yelen224-admin-dashboard')
      .sign(JWT_SECRET)

    const response = NextResponse.json({ success: true })
    response.cookies.set('yelen224_admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })
    return response

  } catch (error) {
    console.error('[ADMIN REAUTH ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
