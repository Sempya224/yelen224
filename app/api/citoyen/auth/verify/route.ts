import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifierOtp } from '@/lib/auth/otp'
import { completerConnexionCitoyen, mintTotpChallengeToken, CITOYEN_REMEMBER_MAX_AGE_S } from '@/lib/auth/citoyenSession'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from '@/lib/security/authSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026) — voir lib/security/authSecurity.ts.
  const { deviceId, estNouveau } = resoudreDeviceId(request)
  const ip = extraireIpClient(request)
  const userAgent = request.headers.get('user-agent')

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status })
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau)
    return response
  }

  try {
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip })
    if (porte.state === 'blocked' || porte.state === 'support_only') {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === 'blocked' ? 'AUTH_SECURITY_BLOCKED' : 'AUTH_SECURITY_SUPPORT_ONLY', security: porte },
        423
      )
    }

    const body = await request.json()
    const { phone, code } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return finaliser({ error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' }, 400)
    }
    if (!code || typeof code !== 'string') {
      return finaliser({ error: 'code requis', code: 'MISSING_FIELDS' }, 400)
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, totp_enabled')
      .eq('phone', phone)
      .maybeSingle()

    if (dbError || !user) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'citoyen_login', deviceId, ip, identifiant: phone, outcome: 'not_found', userAgent,
      })
      return finaliser({ error: 'Compte introuvable', code: 'NOT_FOUND', security: etat }, 404)
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
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'citoyen_login', deviceId, ip, identifiant: phone, outcome: `code_${otpResult.reason}`, userAgent,
      })
      return finaliser({ error: messages[otpResult.reason], code: 'INVALID_CODE', reason: otpResult.reason, security: etat }, 401)
    }

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'citoyen_login', deviceId, ip, identifiant: phone, outcome: 'code_correct', userAgent,
    })

    // 2FA TOTP (chantier sécurité citoyen 25/07/2026) — le facteur
    // principal (OTP) vient de réussir, mais on ne finalise la connexion
    // (mint session + cookie "se souvenir") qu'après validation du code
    // TOTP, via /api/citoyen/auth/totp/login-verify.
    if (user.totp_enabled) {
      const totpToken = await mintTotpChallengeToken(user.id)
      return finaliser({ requiresTotp: true, totpToken, security: etat }, 200)
    }

    const { tokenHash, remember } = await completerConnexionCitoyen(supabaseAdmin, user.id, request)

    const response = finaliser({ success: true, userId: user.id, tokenHash, security: etat }, 200)

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
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
