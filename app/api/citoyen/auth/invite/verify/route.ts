import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { verifierOtpInvite } from '@/lib/auth/inviteOtp'
import { mintCitoyenSessionTokenHash } from '@/lib/auth/citoyenSession'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite, destinationCitoyen,
} from '@/lib/security/authSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/

// Réservation invité (ADR-001 E0.1, design A) — étapes 3 : vérifie l'OTP et,
// seulement à cet instant, crée la coquille auth.users + la ligne users
// (compte_complete_le reste NULL : c'est lui qui distingue l'invité d'un
// permanent), puis mint la session redeemée côté client par
// supabase.auth.verifyOtp(). Coquille email synthétique, comme
// register/route.ts : les "anonymous sign-ins" Supabase ne sont pas activés.
export async function POST(request: NextRequest) {
  // Feature flag E0.1 : désactivé par défaut, 404 générique (rien n'indique
  // que la route existe). Même variable que l'UI du wizard de réservation.
  if (process.env.NEXT_PUBLIC_RESERVATION_INVITE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { deviceId, estNouveau } = resoudreDeviceId(request)
  const ip = extraireIpClient(request)
  const userAgent = request.headers.get('user-agent')

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status })
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau)
    return response
  }

  try {
    const body = await request.json()
    const { phone, code, prenom, nom } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return finaliser({ error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' }, 400)
    }
    if (!code || typeof code !== 'string') {
      return finaliser({ error: 'code requis', code: 'MISSING_FIELDS' }, 400)
    }
    if (!prenom || typeof prenom !== 'string' || !prenom.trim()) {
      return finaliser({ error: 'Le prénom est requis', code: 'MISSING_FIELDS' }, 400)
    }
    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return finaliser({ error: 'Le nom est requis', code: 'MISSING_FIELDS' }, 400)
    }

    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip, destination: destinationCitoyen(phone) }, undefined, request)
    if (porte.state === 'blocked' || porte.state === 'support_only') {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === 'blocked' ? 'AUTH_SECURITY_BLOCKED' : 'AUTH_SECURITY_SUPPORT_ONLY', security: porte },
        423
      )
    }

    // Code consommé qu'il soit juste ou faux : une seule tentative par code.
    const otp = await verifierOtpInvite(supabaseAdmin, phone, code)
    if (!otp.ok) {
      const messages: Record<typeof otp.reason, string> = {
        aucun_code: 'Aucun code en attente. Redemandez un code.',
        expire: 'Ce code a expiré. Redemandez un code.',
        incorrect: 'Code incorrect. Redemandez un code.',
      }
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'citoyen_register', deviceId, ip, identifiant: phone, outcome: `code_${otp.reason}`, userAgent, destination: destinationCitoyen(phone),
      })
      return finaliser({ error: messages[otp.reason], code: 'INVALID_CODE', reason: otp.reason, security: etat }, 401)
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: `${randomUUID()}@citoyen.yelen224.local`,
      email_confirm: true,
      password: randomUUID(),
      user_metadata: {
        yelen224_shell_account: true,
        yelen224_shell_reason: 'FK users.id -> auth.users.id, pas un compte fonctionnel',
      },
    })
    if (authError || !authUser?.user) {
      console.error('[CITOYEN INVITE AUTH SHELL ERROR]', authError)
      return finaliser({ error: 'Erreur lors de la création du compte', code: 'AUTH_SHELL_ERROR' }, 500)
    }
    const userId = authUser.user.id

    const { error: renameError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: `${userId}@citoyen.yelen224.local`,
    })
    if (renameError) {
      console.error('[CITOYEN INVITE AUTH SHELL RENAME WARNING]', renameError)
    }

    // Pas de cgu_acceptee_le ni de compte_complete_le : l'invité n'a rien
    // accepté ni complété. users_phone_unique tranche la course avec un
    // permanent apparu entre-temps (23505), jamais un SELECT préalable.
    const { error: insertError } = await supabaseAdmin
      .from('users')
      .insert({ id: userId, phone, prenom: prenom.trim(), nom: nom.trim() })

    if (insertError) {
      console.error('[CITOYEN INVITE INSERT ERROR]', insertError)
      await supabaseAdmin.auth.admin.deleteUser(userId)
      if (insertError.code === '23505') {
        return finaliser({ error: 'Ce numéro est déjà enregistré. Connectez-vous à la place.', code: 'ALREADY_REGISTERED' }, 409)
      }
      return finaliser({ error: 'Erreur lors de la création du compte', code: 'INSERT_ERROR' }, 500)
    }

    const sessionResult = await mintCitoyenSessionTokenHash(supabaseAdmin, userId)
    if ('error' in sessionResult) {
      console.error('[CITOYEN INVITE SESSION MINT ERROR]', sessionResult.error)
      return finaliser({ error: 'Impossible de générer la session', code: 'SESSION_ERROR' }, 500)
    }

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'citoyen_register', deviceId, ip, identifiant: phone, outcome: 'compte_cree', userAgent, destination: destinationCitoyen(phone),
    })

    return finaliser({ success: true, userId, tokenHash: sessionResult.tokenHash, security: etat }, 200)
  } catch (error) {
    console.error('[CITOYEN INVITE VERIFY ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
