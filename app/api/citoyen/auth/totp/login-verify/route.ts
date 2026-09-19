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

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function lockedMsRemaining(citoyenId: string): number {
  const entry = failedAttempts.get(citoyenId)
  if (!entry) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

function registerFailure(citoyenId: string) {
  const now = Date.now()
  const entry = failedAttempts.get(citoyenId)
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0
  failedAttempts.set(citoyenId, { count, lockedUntil })
}

function clearFailures(citoyenId: string) {
  failedAttempts.delete(citoyenId)
}

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

    if (lockedMsRemaining(citoyenId) > 0) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' }, { status: 429 })
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('totp_secret, totp_backup_codes')
      .eq('id', citoyenId)
      .maybeSingle()

    if (!user?.totp_secret) {
      return NextResponse.json({ error: 'Configuration 2FA introuvable.', code: 'NOT_FOUND' }, { status: 404 })
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
      registerFailure(citoyenId)
      return NextResponse.json({ error: 'Ce code ne semble pas correct. Vérifiez qu\'il n\'a pas expiré dans votre application et réessayez.', code: 'INVALID_CODE' }, { status: 401 })
    }

    clearFailures(citoyenId)

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
