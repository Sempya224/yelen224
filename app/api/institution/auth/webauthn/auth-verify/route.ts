import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, SignJWT } from 'jose'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server'
import {
  mintInstitutionTotpChallengeToken, verifierVerrouInstitution,
  enregistrerEchecConnexionInstitution, reinitialiserEchecsConnexionInstitution,
} from '@/lib/auth/institutionSession'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from '@/lib/security/authSecurity'
import { creerSessionInstitution, INSTITUTION_SESSION_TTL_JWT } from '@/lib/institutionAuth'

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

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026, Lot 2 sécurité) — remplace la Map
  // locale failedAttempts par institutionId (non persistante, non partagée
  // entre instances serverless) par le même mécanisme device+IP partagé que
  // le flux OTP (lookup/verify-otp) et PIN, catégorie 'institution_login'
  // commune aux 3 facteurs de connexion institution — voir
  // lib/security/authSecurity.ts.
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
    const { institutionId, credential, challengeToken } = body as {
      institutionId: string
      credential: AuthenticationResponseJSON
      challengeToken: string
    }

    if (!institutionId || typeof institutionId !== 'string' || !credential || !challengeToken) {
      return finaliser({ error: 'Requête incomplète', code: 'MISSING_FIELDS' }, 400)
    }

    // Verrouillage par compte (revue critique 30/08/2026, même jour) —
    // complète le throttle device+IP ci-dessus. Voir lib/auth/institutionSession.ts.
    const verrou = await verifierVerrouInstitution(supabaseAdmin, institutionId)
    if (verrou.verrouille) {
      return finaliser({ error: `Trop de tentatives. Réessayez dans ${verrou.minutesRestantes} minute(s).`, code: 'LOCKED' }, 429)
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
      return finaliser({ error: 'Challenge invalide ou expiré. Réessayez.', code: 'INVALID_CHALLENGE' }, 401)
    }

    const { data: credRow } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .select('id, credential_id, public_key, counter')
      .eq('institution_id', institutionId)
      .eq('credential_id', credential.id)
      .maybeSingle()

    if (!credRow) {
      await enregistrerEchecConnexionInstitution(supabaseAdmin, institutionId)
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: institutionId, outcome: 'credential_not_found', userAgent,
      })
      return finaliser({ error: 'Appareil non reconnu', code: 'CREDENTIAL_NOT_FOUND', security: etat }, 401)
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
      await enregistrerEchecConnexionInstitution(supabaseAdmin, institutionId)
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: institutionId, outcome: 'verification_failed', userAgent,
      })
      return finaliser({ error: "Échec de la vérification de l'empreinte/Face ID", code: 'VERIFICATION_FAILED', security: etat }, 401)
    }

    // Le compteur doit progresser à chaque authentification — une valeur qui
    // n'avance pas (alors que les deux valeurs sont non nulles) peut signaler
    // un authenticator cloné. Beaucoup de clés d'accès (passkeys) rapportent
    // toujours 0 : dans ce cas précis, on ne peut pas s'appuyer dessus.
    const { newCounter } = verification.authenticationInfo
    if (credRow.counter !== 0 && newCounter !== 0 && newCounter <= credRow.counter) {
      console.error('[INSTITUTION WEBAUTHN AUTH VERIFY] Régression de compteur suspecte', institutionId, credRow.credential_id)
      await enregistrerEchecConnexionInstitution(supabaseAdmin, institutionId)
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: institutionId, outcome: 'counter_regression', userAgent,
      })
      return finaliser({ error: 'Anomalie de sécurité détectée. Réessayez ou reconnectez-vous par SMS.', code: 'COUNTER_REGRESSION', security: etat }, 401)
    }

    await reinitialiserEchecsConnexionInstitution(supabaseAdmin, institutionId)
    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'institution_login', deviceId, ip, identifiant: institutionId, outcome: 'verification_ok', userAgent,
    })

    await supabaseAdmin
      .from('institution_webauthn_credentials')
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq('id', credRow.id)

    const { data: institution } = await supabaseAdmin
      .from('institutions')
      .select('id, name, phone, statut')
      .eq('id', institutionId)
      .single()

    if (!institution) {
      return finaliser({ error: 'Institution introuvable', code: 'NOT_FOUND' }, 404)
    }

    // Institution suspendue — ne bloque plus la connexion (révisé le
    // 17/08/2026, voir membre/login/route.ts pour le raisonnement complet).
    const suspended = institution.statut === 'suspendue'

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
      return finaliser({ requiresTotp: true, totpToken, security: etatVerifie }, 200)
    }

    // institution_sessions (dette technique comblée 30/08/2026, mirroring
    // admin_sessions) — voir lib/institutionAuth.ts::creerSessionInstitution.
    const sid = await creerSessionInstitution(supabaseAdmin, {
      institutionId: institution.id, phone: institution.phone, userAgent: request.headers.get('user-agent'), ip,
    })
    if (!sid) {
      return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
    }

    const token = await new SignJWT({
      institutionId: institution.id,
      ...(membrePrincipal ? { membreId: membrePrincipal.id, role: membrePrincipal.role } : {}),
      sid,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(institution.id)
      .setIssuedAt()
      .setExpirationTime(INSTITUTION_SESSION_TTL_JWT)
      .setIssuer('yelen224-institution')
      .setAudience('yelen224-institution-dashboard')
      .sign(JWT_SECRET)

    const response = finaliser({ success: true, institution: { id: institution.id, name: institution.name }, suspended, security: etatVerifie }, 200)

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
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
