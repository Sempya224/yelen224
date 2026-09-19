import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative, enregistrerTentative, messageSecurite,
} from '@/lib/security/authSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

function getWebAuthnRpID(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) {
    try { return new URL(envUrl).hostname } catch {}
  }
  return new URL(request.url).hostname
}

// Connexion passkey PAR MEMBRE (16/09/2026) — pas de session ici (c'est
// justement le but, comme le flux compte principal), mais l'identité
// prétendue est un IDENTIFIANT (pas un institutionId) puisque plusieurs
// membres partagent la même institution. Même throttle device+IP que
// membre/login (catégorie 'institution_login' partagée — un attaquant ne
// gagne aucun budget de tentatives supplémentaire en essayant la passkey
// plutôt que le PIN).
export async function POST(request: NextRequest) {
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
    const { identifiant } = body

    if (!identifiant || typeof identifiant !== 'string' || !identifiant.trim()) {
      return finaliser({ error: 'Identifiant requis', code: 'MISSING_FIELDS' }, 400)
    }

    const { data: membreRow } = await supabaseAdmin
      .from('institution_membres')
      .select('id, institution_id, actif')
      .eq('identifiant', identifiant.trim())
      .maybeSingle()

    // Message générique — ne jamais distinguer "identifiant inconnu" de
    // "aucune clé configurée" (mirroring membre/login "Identifiant ou PIN
    // incorrect"), pour ne pas transformer cette route en oracle
    // d'énumération des identifiants.
    const introuvable = () => enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'institution_login', deviceId, ip, identifiant: identifiant.trim(), outcome: 'not_found', userAgent,
    }).then(etat => finaliser({ error: "Identifiant ou clé d'accès non reconnu", code: 'NOT_CONFIGURED', security: etat }, 401))

    if (!membreRow || !membreRow.actif) return introuvable()

    const { data: creds } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .select('credential_id')
      .eq('membre_id', membreRow.id)

    if (!creds || creds.length === 0) return introuvable()

    const rpID = getWebAuthnRpID(request)

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({ id: c.credential_id })),
      userVerification: 'required',
    })

    const challengeToken = await new SignJWT({ membreId: membreRow.id, institutionId: membreRow.institution_id, challenge: options.challenge })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer('yelen224-institution-webauthn-membre')
      .sign(JWT_SECRET)

    return finaliser({ success: true, options, challengeToken }, 200)

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN MEMBRE AUTH OPTIONS ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
