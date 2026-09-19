import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, SignJWT } from 'jose'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server'
import { mintInstitutionTotpChallengeToken } from '@/lib/auth/institutionSession'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative, enregistrerTentative, messageSecurite,
} from '@/lib/security/authSecurity'
import { creerSessionInstitution, INSTITUTION_SESSION_TTL_JWT } from '@/lib/institutionAuth'
import { enregistrerAction } from '@/lib/journalActivite'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

// Même verrouillage que membre/login (institution_membres.failed_attempts/
// locked_until) — un échec de passkey compte sur LE MÊME compteur qu'un
// échec de PIN, jamais un budget séparé (sinon un attaquant double ses
// chances de brute-force en alternant les deux méthodes).
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 5

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
    const { identifiant, credential, challengeToken } = body as {
      identifiant: string
      credential: AuthenticationResponseJSON
      challengeToken: string
    }

    if (!identifiant || typeof identifiant !== 'string' || !credential || !challengeToken) {
      return finaliser({ error: 'Des informations sont manquantes pour vous connecter. Réessayez.', code: 'MISSING_FIELDS' }, 400)
    }

    const { data: membreRow } = await supabaseAdmin
      .from('institution_membres')
      .select('id, institution_id, role, actif, prenom, nom, totp_enabled, failed_attempts, locked_until, acces_restreints')
      .eq('identifiant', identifiant.trim())
      .maybeSingle()

    if (!membreRow || !membreRow.actif) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: identifiant.trim(), outcome: 'not_found', userAgent,
      })
      return finaliser({ error: "Identifiant ou clé d'accès non reconnu", code: 'CREDENTIAL_NOT_FOUND', security: etat }, 401)
    }

    if (membreRow.locked_until && new Date(membreRow.locked_until).getTime() > Date.now()) {
      return finaliser({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' }, 429)
    }

    let expectedChallenge: string
    try {
      const { payload } = await jwtVerify(challengeToken, JWT_SECRET, {
        issuer: 'yelen224-institution-webauthn-membre',
      })
      if (payload.membreId !== membreRow.id || typeof payload.challenge !== 'string') {
        throw new Error('mismatch')
      }
      expectedChallenge = payload.challenge
    } catch {
      return finaliser({ error: 'Challenge invalide ou expiré. Réessayez.', code: 'INVALID_CHALLENGE' }, 401)
    }

    const { data: credRow } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .select('id, credential_id, public_key, counter')
      .eq('membre_id', membreRow.id)
      .eq('credential_id', credential.id)
      .maybeSingle()

    // Échec compté sur le MÊME compteur que le PIN (voir commentaire en tête
    // de fichier) — jamais un budget de tentatives séparé.
    const echec = async (outcome: string) => {
      const failedAttempts = membreRow.failed_attempts + 1
      const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null
      await supabaseAdmin.from('institution_membres').update({ failed_attempts: failedAttempts, locked_until: lockedUntil }).eq('id', membreRow.id)
      return enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: identifiant.trim(), outcome, userAgent,
      })
    }

    if (!credRow) {
      const etat = await echec('credential_not_found')
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
      const etat = await echec('verification_failed')
      return finaliser({ error: "Échec de la vérification de l'empreinte/Face ID", code: 'VERIFICATION_FAILED', security: etat }, 401)
    }

    const { newCounter } = verification.authenticationInfo
    if (credRow.counter !== 0 && newCounter !== 0 && newCounter <= credRow.counter) {
      console.error('[INSTITUTION WEBAUTHN MEMBRE AUTH VERIFY] Régression de compteur suspecte', membreRow.id, credRow.credential_id)
      const etat = await echec('counter_regression')
      return finaliser({ error: 'Anomalie de sécurité détectée. Réessayez ou reconnectez-vous avec votre PIN.', code: 'COUNTER_REGRESSION', security: etat }, 401)
    }

    // Compteur/rate-limit mis à jour AVANT le check de suspension (même
    // ordre que app/api/institution/auth/webauthn/auth-verify/route.ts,
    // corrigé le 16/09/2026) — une signature valide doit toujours faire
    // progresser le compteur et réinitialiser le throttle device/IP, que
    // l'institution soit suspendue ou non. Sinon un membre légitime d'une
    // institution suspendue qui retente sa connexion (signature valide à
    // chaque fois) accumulerait des "échecs" au sens du throttle anti-abus.
    await supabaseAdmin
      .from('institution_webauthn_credentials')
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq('id', credRow.id)

    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'institution_login', deviceId, ip, identifiant: identifiant.trim(), outcome: 'verification_ok', userAgent,
    })

    // Institution suspendue — bloque toujours ce flux (jamais le compte
    // principal ici, voir membre/login pour le même raisonnement).
    const { data: instStatut } = await supabaseAdmin.from('institutions').select('statut').eq('id', membreRow.institution_id).maybeSingle()
    if (instStatut?.statut === 'suspendue') {
      return finaliser({ error: "Votre établissement a été suspendu par l'équipe Yelen224. Connexion bloquée pour les membres d'équipe — seul le compte principal peut se connecter pour gérer cette situation.", code: 'INSTITUTION_SUSPENDED' }, 403)
    }

    // 2FA TOTP — même chaînage que membre/login (failed_attempts remis à
    // zéro, derniere_connexion attend la validation TOTP finale, journalisée
    // par totp/login-verify).
    if (membreRow.totp_enabled) {
      await supabaseAdmin.from('institution_membres').update({ failed_attempts: 0, locked_until: null }).eq('id', membreRow.id)
      const totpToken = await mintInstitutionTotpChallengeToken({
        institutionId: membreRow.institution_id,
        membreId: membreRow.id,
        role: membreRow.role,
        rememberMe: false,
        membreNom: `${membreRow.prenom} ${membreRow.nom}`,
      })
      return finaliser({ requiresTotp: true, totpToken, security: etatVerifie }, 200)
    }

    await supabaseAdmin
      .from('institution_membres')
      .update({ failed_attempts: 0, locked_until: null, derniere_connexion: new Date().toISOString() })
      .eq('id', membreRow.id)

    await enregistrerAction({
      institutionId: membreRow.institution_id,
      membreId: membreRow.id,
      membreNom: `${membreRow.prenom} ${membreRow.nom}`,
      action: 'connexion',
      cibleTable: 'institution_membres',
      cibleId: membreRow.id,
      details: { methode: 'passkey' },
      req: request,
    })

    const sid = await creerSessionInstitution(supabaseAdmin, {
      institutionId: membreRow.institution_id, membreId: membreRow.id, userAgent: request.headers.get('user-agent'), ip,
    })
    if (!sid) {
      return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
    }

    const token = await new SignJWT({ institutionId: membreRow.institution_id, membreId: membreRow.id, role: membreRow.role, sid, accesRestreints: membreRow.acces_restreints ?? null })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(membreRow.institution_id)
      .setIssuedAt()
      .setExpirationTime(INSTITUTION_SESSION_TTL_JWT)
      .setIssuer('yelen224-institution')
      .setAudience('yelen224-institution-dashboard')
      .sign(JWT_SECRET)

    const response = finaliser({
      success: true, institutionId: membreRow.institution_id, membreId: membreRow.id, role: membreRow.role, security: etatVerifie,
    }, 200)

    response.cookies.set('yelen224_institution_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN MEMBRE AUTH VERIFY ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
