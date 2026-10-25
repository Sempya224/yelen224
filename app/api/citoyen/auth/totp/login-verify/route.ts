import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verify as verifyTotp } from 'otplib'
import bcrypt from 'bcryptjs'
import { completerConnexionCitoyen, verifyTotpChallengeToken, CITOYEN_REMEMBER_MAX_AGE_S } from '@/lib/auth/citoyenSession'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Verrou persisté (chantier Limites d'authentification, Priorité 2
// validée CEO 18/10/2026) — remplace une Map en mémoire locale, non
// partagée entre instances serverless Netlify, remise à zéro à chaque
// redémarrage/déploiement. Mirroring de institution_membres.failed_attempts/
// locked_until (son équivalent institution avait déjà cette persistance,
// seul le citoyen avait été oublié). Seuil durci par rapport à l'ancien
// comportement en mémoire (5 essais / 5 min) : 4 essais / 15 min — un 2e
// facteur déjà précédé d'un 1er facteur authentifié justifie une fenêtre
// de blocage plus longue qu'un simple essai de mot de passe.
const MAX_ATTEMPTS = 4
const LOCK_MINUTES = 15

// Finalise une connexion citoyen après que le facteur principal (OTP
// téléphone ou WebAuthn) a déjà réussi et émis un totpToken (voir
// app/api/citoyen/auth/verify et .../securite/webauthn/auth-verify) —
// seul point qui appelle réellement completerConnexionCitoyen quand la
// 2FA est activée.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const totpToken = body?.totpToken
    const code = body?.code
    if (typeof totpToken !== 'string' || typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'Requête incomplète', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    const citoyenId = await verifyTotpChallengeToken(totpToken)
    if (!citoyenId) {
      return NextResponse.json({ error: 'Session de vérification expirée. Reconnectez-vous.', code: 'INVALID_CHALLENGE' }, { status: 401 })
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('totp_secret, totp_backup_codes, totp_failed_attempts, totp_locked_until')
      .eq('id', citoyenId)
      .maybeSingle()

    if (!user?.totp_secret) {
      return NextResponse.json({ error: 'Configuration 2FA introuvable.', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (user.totp_locked_until && new Date(user.totp_locked_until).getTime() > Date.now()) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' }, { status: 429 })
    }

    let codeValide = (await verifyTotp({ secret: user.totp_secret, token: code.trim(), epochTolerance: 30 })).valid
    if (!codeValide && Array.isArray(user.totp_backup_codes)) {
      const codes: string[] = user.totp_backup_codes
      for (let i = 0; i < codes.length; i++) {
        if (await bcrypt.compare(code.trim(), codes[i])) {
          codeValide = true
          const restants = [...codes]
          restants.splice(i, 1)
          await supabaseAdmin.from('users').update({ totp_backup_codes: restants }).eq('id', citoyenId)
          break
        }
      }
    }

    if (!codeValide) {
      const failedAttempts = (user.totp_failed_attempts ?? 0) + 1
      const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null
      await supabaseAdmin.from('users').update({ totp_failed_attempts: failedAttempts, totp_locked_until: lockedUntil }).eq('id', citoyenId)
      return NextResponse.json({ error: 'Ce code ne semble pas correct. Vérifiez qu\'il n\'a pas expiré dans votre application et réessayez.', code: 'INVALID_CODE' }, { status: 401 })
    }

    if (user.totp_failed_attempts > 0 || user.totp_locked_until) {
      await supabaseAdmin.from('users').update({ totp_failed_attempts: 0, totp_locked_until: null }).eq('id', citoyenId)
    }

    const { tokenHash, remember } = await completerConnexionCitoyen(supabaseAdmin, citoyenId, request)

    const response = NextResponse.json({ success: true, userId: citoyenId, tokenHash })

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
    console.error('[CITOYEN TOTP LOGIN VERIFY ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
