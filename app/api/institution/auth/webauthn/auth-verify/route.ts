import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, SignJWT } from 'jose'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server'
import { mintInstitutionTotpChallengeToken } from '@/lib/auth/institutionSession'

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

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function lockedMsRemaining(institutionId: string): number {
  const entry = failedAttempts.get(institutionId)
  if (!entry) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

function registerFailure(institutionId: string) {
  const now = Date.now()
  const entry = failedAttempts.get(institutionId)
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0
  failedAttempts.set(institutionId, { count, lockedUntil })
}

function clearFailures(institutionId: string) {
  failedAttempts.delete(institutionId)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { institutionId, credential, challengeToken } = body as {
      institutionId: string
      credential: AuthenticationResponseJSON
      challengeToken: string
    }

    if (!institutionId || typeof institutionId !== 'string' || !credential || !challengeToken) {
      return NextResponse.json({ error: 'Requête incomplète', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    if (lockedMsRemaining(institutionId) > 0) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' },
        { status: 429 }
      )
    }

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

    const { data: credRow } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .select('id, credential_id, public_key, counter')
      .eq('institution_id', institutionId)
      .eq('credential_id', credential.id)
      .maybeSingle()

    if (!credRow) {
      registerFailure(institutionId)
      return NextResponse.json({ error: 'Appareil non reconnu', code: 'CREDENTIAL_NOT_FOUND' }, { status: 401 })
    }

    const { rpID, expectedOrigin } = getWebAuthnOrigin(request)

    const webAuthnCredential: WebAuthnCredential = {
      id: credRow.credential_id,
      publicKey: new Uint8Array(Buffer.from(credRow.public_key, 'base64url')),
      counter: credRow.counter,
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: webAuthnCredential,
      requireUserVerification: true,
    })

    if (!verification.verified) {
      registerFailure(institutionId)
      return NextResponse.json({ error: "Échec de la vérification de l'empreinte/Face ID", code: 'VERIFICATION_FAILED' }, { status: 401 })
    }

    // Le compteur doit progresser à chaque authentification — une valeur qui
    // n'avance pas (alors que les deux valeurs sont non nulles) peut signaler
    // un authenticator cloné. Beaucoup de clés d'accès (passkeys) rapportent
    // toujours 0 : dans ce cas précis, on ne peut pas s'appuyer dessus.
    const { newCounter } = verification.authenticationInfo
    if (credRow.counter !== 0 && newCounter !== 0 && newCounter <= credRow.counter) {
      console.error('[INSTITUTION WEBAUTHN AUTH VERIFY] Régression de compteur suspecte', institutionId, credRow.credential_id)
      registerFailure(institutionId)
      return NextResponse.json({ error: 'Anomalie de sécurité détectée. Réessayez ou reconnectez-vous par SMS.', code: 'COUNTER_REGRESSION' }, { status: 401 })
    }

    clearFailures(institutionId)

    await supabaseAdmin
      .from('institution_webauthn_credentials')
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq('id', credRow.id)

    const { data: institution } = await supabaseAdmin
      .from('institutions')
      .select('id, name, phone')
      .eq('id', institutionId)
      .single()

    if (!institution) {
      return NextResponse.json({ error: 'Institution introuvable', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Fondation multi-comptes (migration 20260714000001) — inclut membreId/
    // role dans le même JWT si le membre Admin principal existe déjà.
    const { data: membrePrincipal } = await supabaseAdmin
      .from('institution_membres')
      .select('id, role, totp_enabled')
      .eq('institution_id', institution.id)
      .eq('compte_principal', true)
      .maybeSingle()

    // 2FA TOTP (chantier sécurité institution 25/07/2026) — voir verify-otp/route.ts.
    if (membrePrincipal?.totp_enabled) {
      const totpToken = await mintInstitutionTotpChallengeToken({
        institutionId: institution.id,
        membreId: membrePrincipal.id,
        role: membrePrincipal.role,
        rememberMe: false,
      })
      return NextResponse.json({ requiresTotp: true, totpToken })
    }

    const token = await new SignJWT({
      institutionId: institution.id,
      ...(membrePrincipal ? { membreId: membrePrincipal.id, role: membrePrincipal.role } : {}),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(institution.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('yelen224-institution')
      .setAudience('yelen224-institution-dashboard')
      .sign(JWT_SECRET)

    await supabaseAdmin.from('institution_sessions').insert({
      institution_id: institution.id,
      phone: institution.phone,
      user_agent: request.headers.get('user-agent'),
      is_active: true,
    })

    const response = NextResponse.json({ success: true, institution: { id: institution.id, name: institution.name } })

    response.cookies.set('yelen224_institution_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN AUTH VERIFY ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
