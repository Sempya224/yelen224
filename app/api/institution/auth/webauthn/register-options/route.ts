import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { getAuthenticatedInstitutionId } from '@/lib/institutionAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)
const RP_NAME = 'YELEN224'

// rpID WebAuthn — jamais codé en dur. Priorité à NEXT_PUBLIC_APP_URL (ancrage
// explicite du domaine de prod) ; à défaut, dérivé de l'URL réelle de la
// requête (fonctionne aussi bien en dev que sur les deploy previews Netlify).
function getWebAuthnRpID(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) {
    try { return new URL(envUrl).hostname } catch {}
  }
  return new URL(request.url).hostname
}

export async function POST(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const { data: institution } = await supabaseAdmin
      .from('institutions')
      .select('id, name')
      .eq('id', institutionId)
      .single()

    if (!institution) {
      return NextResponse.json({ error: 'Institution introuvable', code: 'NOT_FOUND' }, { status: 404 })
    }

    const { data: existingCreds } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .select('credential_id')
      .eq('institution_id', institutionId)

    const rpID = getWebAuthnRpID(request)

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(institutionId),
      userName: institution.name,
      userDisplayName: institution.name,
      attestationType: 'none',
      excludeCredentials: (existingCreds || []).map((c) => ({ id: c.credential_id })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    })

    // Challenge encodé dans un JWT signé courte durée (5 min) plutôt que
    // stocké en mémoire serveur — un Map en mémoire ne survit pas de façon
    // fiable entre deux invocations de fonction serverless (Netlify).
    const challengeToken = await new SignJWT({ institutionId, challenge: options.challenge })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer('yelen224-institution-webauthn')
      .sign(JWT_SECRET)

    return NextResponse.json({ success: true, options, challengeToken })

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN REGISTER OPTIONS ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
