import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { SignJWT } from 'jose'
import { verify as verifyTotp } from 'otplib'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentativeAdmin,
  enregistrerTentativeAdmin, messageSecurite,
} from '@/lib/security/authSecurity'
import { ADMIN_ENTRY_GRANT_COOKIE } from '@/lib/adminEntry'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

export async function POST(request: NextRequest) {
  // Auth Security (Lot 2 sécurité, 30/08/2026) — remplace la Map IP locale
  // loginAttempts (non persistante, non partagée entre instances
  // serverless) par le mécanisme device+IP partagé, catégorie
  // 'admin_login' dédiée (jamais mêlée aux seuils citoyen/institution vu
  // le niveau de privilège). Complète, sans le remplacer, le verrouillage
  // par compte déjà en place (admin_users.failed_login_attempts/
  // locked_until, persistant depuis le Lot 1) — voir lib/security/
  // authSecurity.ts.
  const { deviceId, estNouveau } = resoudreDeviceId(request)
  const ip = extraireIpClient(request)
  const userAgent = request.headers.get('user-agent')

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status })
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau)
    return response
  }

  try {
    const porte = await evaluerTentativeAdmin(supabaseAdmin, { deviceId, ip })
    if (porte.state === 'blocked' || porte.state === 'support_only') {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === 'blocked' ? 'AUTH_SECURITY_BLOCKED' : 'AUTH_SECURITY_SUPPORT_ONLY', security: porte },
        423
      )
    }

    const body = await request.json()
    const { email, password, totp_code: totpCode } = body

    if (!email || !password) {
      return finaliser({ error: 'Email et mot de passe requis', code: 'MISSING_FIELDS' }, 400)
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return finaliser({ error: 'Format invalide', code: 'INVALID_FORMAT' }, 400)
    }

    if (password.length > 128) {
      return finaliser({ error: 'Format invalide', code: 'INVALID_FORMAT' }, 400)
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
      return finaliser({ error: `Compte verrouillé suite à plusieurs échecs. Réessayez dans ${minutesRestantes} min.`, code: 'ACCOUNT_LOCKED' }, 429)
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
        // Audit obligatoire (mission Sécurisation Admin, 30/08/2026, point
        // 7) — avant ce lot, un échec de connexion n'était jamais tracé
        // dans admin_logs (seul auth_security_events, ci-dessus, moins
        // lisible pour une revue humaine par compte). Uniquement si le
        // compte existe : sinon admin_id (NOT NULL) n'a rien à référencer.
        await supabaseAdmin.from('admin_logs').insert({
          admin_id: admin.id,
          action: 'LOGIN_FAILED',
          details: { reason: 'mot_de_passe_incorrect', role: admin.role, ip, user_agent: userAgent },
        })
      }
      const etat = await enregistrerTentativeAdmin(supabaseAdmin, {
        deviceId, ip, identifiant: email.toLowerCase().trim(), outcome: admin ? 'code_incorrect' : 'not_found', userAgent,
      })
      return finaliser({ error: 'Email ou mot de passe incorrect', code: 'INVALID_CREDENTIALS', security: etat }, 401)
    }

    if (!admin.is_active) {
      return finaliser({ error: 'Compte désactivé. Contactez le super admin.', code: 'ACCOUNT_DISABLED' }, 403)
    }

    // 2FA TOTP (chantier "Sécurité" admin, 24/07/2026) — vérifié après le
    // mot de passe mais avant l'émission du JWT. Sans code fourni, on
    // redemande une étape supplémentaire (pas une erreur) ; avec un code
    // fourni mais invalide, même traitement qu'un mot de passe invalide
    // (compteur d'échecs/verrouillage), pour ne jamais révéler lequel des
    // deux facteurs a échoué.
    if (admin.totp_enabled) {
      if (typeof totpCode !== 'string' || !totpCode) {
        return finaliser({ requiresTotp: true }, 200)
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
        await supabaseAdmin.from('admin_logs').insert({
          admin_id: admin.id,
          action: 'LOGIN_FAILED',
          details: { reason: 'totp_incorrect', role: admin.role, ip, user_agent: userAgent },
        })
        const etat = await enregistrerTentativeAdmin(supabaseAdmin, {
          deviceId, ip, identifiant: email.toLowerCase().trim(), outcome: 'totp_incorrect', userAgent,
        })
        return finaliser({ error: 'Code de vérification incorrect', code: 'INVALID_CREDENTIALS', security: etat }, 401)
      }
    }

    // Connexion réussie — remettre le compteur d'échecs à zéro
    if (admin.failed_login_attempts > 0 || admin.locked_until) {
      await supabaseAdmin.from('admin_users').update({ failed_login_attempts: 0, locked_until: null }).eq('id', admin.id)
    }

    const etatVerifie = await enregistrerTentativeAdmin(supabaseAdmin, {
      deviceId, ip, identifiant: email.toLowerCase().trim(), outcome: 'code_correct', userAgent,
    })

    // admin_sessions (Mission Hardening Admin, point 7, 30/08/2026) — une
    // ligne par session, créée AVANT la signature du JWT pour pouvoir y
    // inclure son id comme claim `sid`. expires_at miroir exact de
    // l'expiration du JWT (8h) — voir lib/adminAuth.ts pour la
    // vérification (révocation individuelle, inactivité, réauth).
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
    const { data: sessionRow, error: sessionError } = await supabaseAdmin
      .from('admin_sessions')
      .insert({ admin_id: admin.id, expires_at: expiresAt, ip, user_agent: userAgent })
      .select('id')
      .single()
    if (sessionError || !sessionRow) {
      console.error('[ADMIN LOGIN] Erreur création admin_sessions:', sessionError?.message)
      return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
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
      sid: sessionRow.id,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('yelen224-admin')
      .setAudience('yelen224-admin-dashboard')
      .sign(JWT_SECRET)

    // Lot 3, écart 2 (31/08/2026) — consommation atomique du grant
    // d'entrée WebAuthn (docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md,
    // section 4), exactement à la transition réussie vers une session
    // admin réelle. `UPDATE ... WHERE consumed_at IS NULL AND ...` est
    // atomique au niveau ligne (verrouillage Postgres) : si deux requêtes
    // concurrentes consomment le même grant, une seule affecte une ligne,
    // l'autre affecte 0 ligne — jamais les deux ne peuvent le considérer
    // valide simultanément. Best-effort et non bloquant pour la connexion
    // elle-même : le grant n'a jamais conditionné le succès de l'auth
    // admin (mot de passe + MFA seuls en décident), conforme à la
    // séparation stricte grant/session déjà actée. Absence du cookie
    // (connexion via ADMIN_ENTRY_TOKEN V1, ou grant déjà consommé/expiré/
    // révoqué) : aucune ligne affectée, aucune erreur, comportement normal.
    const grantRaw = request.cookies.get(ADMIN_ENTRY_GRANT_COOKIE)?.value
    if (grantRaw) {
      const grantHash = crypto.createHash('sha256').update(grantRaw).digest('hex')
      const { error: grantError } = await supabaseAdmin
        .from('admin_entry_grants')
        .update({ consumed_at: new Date().toISOString() })
        .eq('cookie_hash', grantHash)
        .is('consumed_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
      if (grantError) {
        console.error('[ADMIN LOGIN] Erreur consommation grant entrée:', grantError.message)
      }
    }

    // Log connexion
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.id,
      action: 'LOGIN',
      details: { role: admin.role, ip, user_agent: request.headers.get('user-agent') },
    })

    // Mettre à jour last_login
    await supabaseAdmin
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id)

    // Réponse avec cookie HttpOnly
    const response = finaliser({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        nom: admin.nom,
      },
      security: etatVerifie,
    }, 200)

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
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}