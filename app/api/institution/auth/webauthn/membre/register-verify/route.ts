import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { getAuthenticatedMembre } from '@/lib/institutionAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

function getWebAuthnOrigin(request: NextRequest): { rpID: string; expectedOrigin: string } {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) {
    try {
      const u = new URL(envUrl)
      return { rpID: u.hostname, expectedOrigin: u.origin }
    } catch {}
  }
  const u = new URL(request.url)
  return { rpID: u.hostname, expectedOrigin: u.origin }
}

export async function POST(request: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(request)
    if (!membre) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const body = await request.json()
    const { credential, challengeToken, deviceLabel } = body as {
      credential: RegistrationResponseJSON
      challengeToken: string
      deviceLabel?: string
    }

    if (!credential || !challengeToken) {
      return NextResponse.json({ error: "Des informations sont manquantes pour terminer l'enregistrement. Réessayez.", code: 'MISSING_FIELDS' }, { status: 400 })
    }

    let expectedChallenge: string
    try {
      const { payload } = await jwtVerify(challengeToken, JWT_SECRET, {
        issuer: 'yelen224-institution-webauthn-membre',
      })
      if (payload.membreId !== membre.membreId || typeof payload.challenge !== 'string') {
        throw new Error('mismatch')
      }
      expectedChallenge = payload.challenge
    } catch {
      return NextResponse.json({ error: 'Cette demande a expiré (plus de 5 minutes se sont écoulées). Recommencez depuis "Ajouter une clé d\'accès".', code: 'INVALID_CHALLENGE' }, { status: 401 })
    }

    const { rpID, expectedOrigin } = getWebAuthnOrigin(request)

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "La clé d'accès n'a pas pu être vérifiée. Réessayez.", code: 'VERIFICATION_FAILED' }, { status: 401 })
    }

    const { id, publicKey, counter } = verification.registrationInfo.credential

    const { error: insertError } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .insert({
        institution_id: membre.institutionId,
        membre_id: membre.membreId,
        credential_id: id,
        public_key: Buffer.from(publicKey).toString('base64url'),
        counter,
        device_label: typeof deviceLabel === 'string' && deviceLabel.trim() ? deviceLabel.trim() : null,
      })

    if (insertError) {
      console.error('[INSTITUTION WEBAUTHN MEMBRE REGISTER VERIFY INSERT ERROR]', insertError.code, insertError.message, insertError.details, insertError.hint)
      return NextResponse.json(
        {
          error: insertError.code === '23505' ? 'Cet appareil est déjà enregistré.' : "La clé d'accès n'a pas pu être enregistrée. Réessayez.",
          code: insertError.code === '23505' ? 'ALREADY_REGISTERED' : 'INSERT_ERROR',
        },
        { status: insertError.code === '23505' ? 409 : 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN MEMBRE REGISTER VERIFY ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
