import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative, messageSecurite,
} from '@/lib/security/authSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

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
  // Auth Security (revue critique 30/08/2026, même jour) — remplace la Map
  // IP locale (non persistante, non partagée entre instances serverless),
  // dernière survivante de ce pattern côté institution — voir
  // lib/security/authSecurity.ts.
  const { deviceId, estNouveau } = resoudreDeviceId(request)
  const ip = extraireIpClient(request)

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
    const { institutionId } = body

    if (!institutionId || typeof institutionId !== 'string') {
      return finaliser({ error: 'institutionId requis', code: 'MISSING_FIELDS' }, 400)
    }

    // Pas de session ici : c'est justement le but — permettre à un appareil
    // déjà connu de s'identifier sans repasser par le flow téléphone + OTP
    // complet. L'institutionId fourni n'est qu'une prétention d'identité ;
    // c'est auth-verify (vérification de signature) qui la prouve
    // cryptographiquement, pas cette route.
    const { data: creds } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .select('credential_id')
      .eq('institution_id', institutionId)

    if (!creds || creds.length === 0) {
      return finaliser({ error: "Aucun accès rapide configuré pour cette institution", code: 'NOT_CONFIGURED' }, 404)
    }

    const rpID = getWebAuthnRpID(request)

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({ id: c.credential_id })),
      userVerification: 'required',
    })

    const challengeToken = await new SignJWT({ institutionId, challenge: options.challenge })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer('yelen224-institution-webauthn')
      .sign(JWT_SECRET)

    return finaliser({ success: true, options, challengeToken }, 200)

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN AUTH OPTIONS ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
