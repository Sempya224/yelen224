import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

// rpID/origin WebAuthn — jamais codés en dur. Priorité à NEXT_PUBLIC_APP_URL
// (ancrage explicite du domaine de prod) ; à défaut, dérivés de l'URL réelle
// de la requête (fonctionne aussi bien en dev que sur les deploy previews
// Netlify, dont le sous-domaine change à chaque déploiement).
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

async function getAuthenticatedInstitutionId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('yelen224_institution_session')?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'yelen224-institution',
      audience: 'yelen224-institution-dashboard',
    })
    return typeof payload.institutionId === 'string' ? payload.institutionId : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const body = await request.json()
    const { credential, challengeToken, deviceLabel } = body as {
      credential: RegistrationResponseJSON
      challengeToken: string
      deviceLabel?: string
    }

    if (!credential || !challengeToken) {
      return NextResponse.json({ error: 'Requête incomplète', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    // Revalidation du challenge — jamais confiance dans une valeur envoyée
    // par le client seule. Le JWT signé prouve qu'il vient bien de nous,
    // qu'il n'a pas expiré (5 min) et qu'il correspond à cette institution.
    let expectedChallenge: string
    try {
      const { payload } = await jwtVerify(challengeToken, JWT_SECRET, {
        issuer: 'yelen224-institution-webauthn',
      })
      if (payload.institutionId !== institutionId || typeof payload.challenge !== 'string') {
        throw new Error('mismatch')
      }
      expectedChallenge = payload.challenge
    } catch {
      return NextResponse.json({ error: 'Challenge invalide ou expiré. Réessayez.', code: 'INVALID_CHALLENGE' }, { status: 401 })
    }

    const { rpID, expectedOrigin } = getWebAuthnOrigin(request)

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Échec de la vérification de l'empreinte/Face ID", code: 'VERIFICATION_FAILED' }, { status: 401 })
    }

    const { id, publicKey, counter } = verification.registrationInfo.credential

    const { error: insertError } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .insert({
        institution_id: institutionId,
        credential_id: id,
        public_key: Buffer.from(publicKey).toString('base64url'),
        counter,
        device_label: typeof deviceLabel === 'string' && deviceLabel.trim() ? deviceLabel.trim() : null,
      })

    if (insertError) {
      console.error('[INSTITUTION WEBAUTHN REGISTER VERIFY INSERT ERROR]', insertError.code, insertError.message, insertError.details, insertError.hint)
      return NextResponse.json(
        {
          error: insertError.code === '23505' ? 'Cet appareil est déjà enregistré.' : "Erreur lors de l'enregistrement",
          code: insertError.code === '23505' ? 'ALREADY_REGISTERED' : 'INSERT_ERROR',
        },
        { status: insertError.code === '23505' ? 409 : 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN REGISTER VERIFY ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
