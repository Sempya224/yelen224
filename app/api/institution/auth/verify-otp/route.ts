import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import {
  mintInstitutionTotpChallengeToken, evaluerAppareilInstitution, enregistrerConnexionInstitution,
  verifierVerrouInstitution, enregistrerEchecConnexionInstitution, reinitialiserEchecsConnexionInstitution,
} from '@/lib/auth/institutionSession'
import { enregistrerAction } from '@/lib/journalActivite'
import { extraireIpClient } from '@/lib/edgeSecurity'
import { creerSessionInstitution, INSTITUTION_SESSION_TTL_JWT } from '@/lib/institutionAuth'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from '@/lib/security/authSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026) — remplace la Map failedAttempts
  // locale, voir lib/security/authSecurity.ts.
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
    const { institutionId, phone: rawPhone, code, rememberMe } = body

    const hasInstitutionId = typeof institutionId === 'string' && institutionId.length > 0
    const hasPhone = typeof rawPhone === 'string' && rawPhone.length > 0
    const endpointCategory = hasInstitutionId ? 'institution_login' as const : 'institution_register' as const

    if (hasInstitutionId === hasPhone) {
      return finaliser({ error: 'Fournir institutionId (connexion) ou phone (inscription), pas les deux', code: 'MISSING_FIELDS' }, 400)
    }

    if (!code || typeof code !== 'string') {
      return finaliser({ error: 'code requis', code: 'MISSING_FIELDS' }, 400)
    }

    // Verrouillage par compte (revue critique 30/08/2026, même jour) —
    // uniquement en flux connexion (institutionId connu) : en inscription,
    // aucun compte n'existe encore à verrouiller. Complète le throttle
    // device+IP ci-dessus. Voir lib/auth/institutionSession.ts.
    if (hasInstitutionId) {
      const verrou = await verifierVerrouInstitution(supabaseAdmin, institutionId)
      if (verrou.verrouille) {
        return finaliser({ error: `Trop de tentatives. Réessayez dans ${verrou.minutesRestantes} minute(s).`, code: 'LOCKED' }, 429)
      }
    }

    const identifiant: string = hasInstitutionId ? institutionId : rawPhone

    let phone: string
    let institution: { id: string; phone: string; name: string; statut: string } | null = null

    if (hasInstitutionId) {
      const { data, error: dbError } = await supabaseAdmin
        .from('institutions')
        .select('id, phone, name, statut')
        .eq('id', institutionId)
        .single()

      if (dbError || !data) {
        const etat = await enregistrerTentative(supabaseAdmin, {
          endpointCategory, deviceId, ip, identifiant, outcome: 'not_found', userAgent,
        })
        return finaliser({ error: 'Institution introuvable', code: 'NOT_FOUND', security: etat }, 404)
      }
      institution = data
      phone = data.phone
    } else {
      phone = rawPhone
    }

    // Durcissement Lot 1.1 (13/08/2026, remédiation GAP-04-01) — plus de
    // bypass en dur : seul le code réellement stocké par send-otp/route.ts
    // (via INSTITUTION_OTP_FALLBACK tant qu'aucun SMS_PROVIDER n'est
    // configuré) est accepté.
    let verified = false
    const { data: otpRow } = await supabaseAdmin
      .from('institution_otp')
      .select('id')
      .eq('phone', phone)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpRow) {
      verified = true
      // Fix 14/08/2026 (diagnostic Lot 02) : en flux inscription (institution
      // encore null ici), ne pas supprimer la ligne — /register refait
      // exactement la même vérification (phone+code+expires_at) avant de
      // créer le compte, potentiellement plusieurs écrans plus tard. La
      // supprimer ici cassait systématiquement register.ts:167-189 avec
      // INVALID_CODE, bloquant toute inscription sur le chemin nominal.
      // En flux connexion, institution est déjà résolue et cette route est
      // le seul point de vérification : le code doit être consommé ici.
      if (institution) {
        await supabaseAdmin.from('institution_otp').delete().eq('id', otpRow.id)
      }
    }

    if (!verified) {
      if (institution) await enregistrerEchecConnexionInstitution(supabaseAdmin, institution.id)
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory, deviceId, ip, identifiant, outcome: 'code_incorrect', userAgent,
      })
      return finaliser({ error: 'Code incorrect', code: 'INVALID_CODE', security: etat }, 401)
    }

    if (institution) await reinitialiserEchecsConnexionInstitution(supabaseAdmin, institution.id)
    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory, deviceId, ip, identifiant, outcome: 'code_correct', userAgent,
    })

    // Flux inscription : téléphone confirmé, aucune institution à connecter pour l'instant.
    if (!institution) {
      return finaliser({ success: true, phoneVerified: true, security: etatVerifie }, 200)
    }

    // Flux connexion : session complète

    // Institution suspendue — ne bloque plus la connexion (révisé le
    // 17/08/2026, voir membre/login/route.ts pour le raisonnement complet).
    // Le flag `suspended` voyage jusqu'à la réponse finale.
    const suspended = institution.statut === 'suspendue'

    // Fondation multi-comptes (migration 20260714000001) — inclut membreId/
    // role dans le même JWT si le membre Admin principal existe déjà.
    const { data: membrePrincipal } = await supabaseAdmin
      .from('institution_membres')
      .select('id, role, totp_enabled, prenom, nom')
      .eq('institution_id', institution.id)
      .eq('compte_principal', true)
      .maybeSingle()

    // 2FA TOTP (chantier sécurité institution 25/07/2026) — l'OTP téléphone
    // vient de réussir, mais on ne finalise la session qu'après validation
    // du code TOTP, via /api/institution/auth/totp/login-verify. rememberMe
    // voyage dans le jeton de défi pour être honoré après coup. membreNom
    // transporté aussi (bug corrigé 05/08/2026 : sans lui, login-verify ne
    // journalisait jamais "connexion" ni ne mettait à jour
    // derniere_connexion pour le compte_principal en 2FA — seul le flux
    // membre/login le faisait).
    if (membrePrincipal?.totp_enabled) {
      const totpToken = await mintInstitutionTotpChallengeToken({
        institutionId: institution.id,
        membreId: membrePrincipal.id,
        role: membrePrincipal.role,
        rememberMe: rememberMe === true,
        membreNom: `${membrePrincipal.prenom} ${membrePrincipal.nom}`,
      })
      return finaliser({ requiresTotp: true, totpToken }, 200)
    }

    // Traçabilité de connexion (bug corrigé 05/08/2026) — ce flux
    // (téléphone + OTP, utilisé par le compte_principal au quotidien)
    // n'écrivait ni "connexion" dans journal_activite ni
    // institution_membres.derniere_connexion, contrairement au flux
    // membre/login (identifiant+PIN). D'où l'incohérence observée :
    // "Dernières actions" pouvait sembler vide/incohérent pour ce compte
    // pendant que "Dernière connexion" affichait "Jamais connecté" malgré
    // des connexions réelles répétées.
    if (membrePrincipal) {
      await supabaseAdmin
        .from('institution_membres')
        .update({ derniere_connexion: new Date().toISOString() })
        .eq('id', membrePrincipal.id)

      await enregistrerAction({
        institutionId: institution.id,
        membreId: membrePrincipal.id,
        membreNom: `${membrePrincipal.prenom} ${membrePrincipal.nom}`,
        action: 'connexion',
        cibleTable: 'institution_membres',
        cibleId: membrePrincipal.id,
        req: request,
      })
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

    const response = finaliser({
      success: true,
      institution: { id: institution.id, name: institution.name },
      suspended,
    }, 200)

    response.cookies.set('yelen224_institution_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    // "Se souvenir de moi" — un token aléatoire à haute entropie (256 bits),
    // haché en SHA-256 (pas bcrypt : bcrypt sert à ralentir le brute-force
    // sur des secrets faibles comme un PIN ou un mot de passe ; ici le
    // token est déjà impossible à deviner, un hash rapide suffit et évite
    // un coût CPU inutile). Seul le hash est stocké, révocable par ligne.
    //
    // Trusted Device (30/08/2026) — evaluerAppareilInstitution décide du
    // statut (premier appareil du compte = 'trusted' direct, appareil
    // suivant = 'pending') ; voir lib/auth/institutionSession.ts.
    if (rememberMe === true) {
      const evaluation = await evaluerAppareilInstitution(supabaseAdmin, institution.id, request)
      const remember = await enregistrerConnexionInstitution(supabaseAdmin, institution.id, request, evaluation)

      if (remember) {
        response.cookies.set('yelen224_institution_remember', remember.rawToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 60 * 24 * 60 * 60,
          path: '/',
        })
      }
    }

    return response

  } catch (error) {
    console.error('[INSTITUTION AUTH ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
