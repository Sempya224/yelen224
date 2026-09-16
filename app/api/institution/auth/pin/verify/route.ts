import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
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

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026, Lot 2 sécurité) — remplace les 2
  // Map locales (ipAttempts/failedAttempts par institutionId, non
  // persistantes, non partagées entre instances serverless) par le même
  // mécanisme device+IP partagé que le flux OTP (lookup/verify-otp),
  // catégorie 'institution_login' commune aux 3 facteurs de connexion
  // institution (OTP/PIN/WebAuthn) — voir lib/security/authSecurity.ts.
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
    const { institutionId, pin } = body

    if (!institutionId || typeof institutionId !== 'string' || !pin || typeof pin !== 'string') {
      return finaliser({ error: 'Requête incomplète', code: 'MISSING_FIELDS' }, 400)
    }

    // Verrouillage par compte (revue critique 30/08/2026, même jour) —
    // complète le throttle device+IP ci-dessus, contournable par rotation
    // du cookie device. Voir lib/auth/institutionSession.ts.
    const verrou = await verifierVerrouInstitution(supabaseAdmin, institutionId)
    if (verrou.verrouille) {
      return finaliser({ error: `Trop de tentatives. Réessayez dans ${verrou.minutesRestantes} minute(s).`, code: 'LOCKED' }, 429)
    }

    const { data: institution } = await supabaseAdmin
      .from('institutions')
      .select('id, name, phone, pin_hash, statut')
      .eq('id', institutionId)
      .single()

    if (!institution || !institution.pin_hash) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: institutionId, outcome: 'not_configured', userAgent,
      })
      return finaliser({ error: 'Aucun code de déverrouillage configuré pour cette institution', code: 'NOT_CONFIGURED', security: etat }, 404)
    }

    const valid = await bcrypt.compare(pin, institution.pin_hash)

    if (!valid) {
      await enregistrerEchecConnexionInstitution(supabaseAdmin, institutionId)
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: institutionId, outcome: 'code_incorrect', userAgent,
      })
      return finaliser({ error: 'Ce code ne semble pas correct. Réessayez.', code: 'INVALID_PIN', security: etat }, 401)
    }

    await reinitialiserEchecsConnexionInstitution(supabaseAdmin, institutionId)
    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'institution_login', deviceId, ip, identifiant: institutionId, outcome: 'code_correct', userAgent,
    })

    // Institution suspendue — ne bloque plus la connexion (révisé le
    // 17/08/2026, voir membre/login/route.ts pour le raisonnement complet ;
    // ce PIN de déverrouillage rapide est un flux compte_principal, jamais
    // un membre d'équipe classique).
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
      institutionId: institution.id, membreId: membrePrincipal?.id ?? null, phone: institution.phone, userAgent: request.headers.get('user-agent'), ip,
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
    console.error('[INSTITUTION PIN VERIFY ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
