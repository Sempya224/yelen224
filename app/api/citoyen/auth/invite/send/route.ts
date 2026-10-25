import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerOtpInvite } from '@/lib/auth/inviteOtp'
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

// Réservation invité (ADR-001 E0.1, design A) — étape 2 : émet un OTP lié au
// seul numéro. Aucune ligne users / auth.users n'est créée ici ni avant le
// succès de la vérification (invite/verify). Catégorie anti-abus
// `citoyen_register` réutilisée : le parcours invité est une inscription
// minimale, mêmes seuils par destination.
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
    const { phone } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return finaliser({ error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' }, 400)
    }

    // Porte anti-abus — AVANT toute requête Supabase.
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip, destination: destinationCitoyen(phone) }, undefined, request)
    if (porte.state === 'blocked' || porte.state === 'support_only') {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === 'blocked' ? 'AUTH_SECURITY_BLOCKED' : 'AUTH_SECURITY_SUPPORT_ONLY', security: porte },
        423
      )
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (lookupError) {
      console.error('[CITOYEN INVITE SEND LOOKUP ERROR]', lookupError)
      return finaliser({ error: "Envoi du code impossible pour l'instant. Réessayez.", code: 'SERVER_ERROR' }, 500)
    }

    // Aucune fusion automatique : un numéro déjà lié à un compte passe par la
    // connexion normale (test 6 de l'ADR).
    if (existing) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'citoyen_register', deviceId, ip, identifiant: phone, outcome: 'deja_enregistre', userAgent, destination: destinationCitoyen(phone),
      })
      return finaliser({ error: 'Ce numéro est déjà enregistré. Connectez-vous à la place.', code: 'ALREADY_REGISTERED', security: etat }, 409)
    }

    const envoi = await envoyerOtpInvite(supabaseAdmin, phone)
    if (!envoi.ok) {
      console.error('[CITOYEN INVITE SEND OTP ERROR]', envoi.error)
      return finaliser({ error: "Envoi du code impossible pour l'instant. Réessayez.", code: 'OTP_SEND_ERROR' }, 500)
    }

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'citoyen_register', deviceId, ip, identifiant: phone, outcome: 'code_envoye', userAgent, destination: destinationCitoyen(phone),
    })

    return finaliser({ success: true, security: etat }, 200)
  } catch (error) {
    console.error('[CITOYEN INVITE SEND ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
