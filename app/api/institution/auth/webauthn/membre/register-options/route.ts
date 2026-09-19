import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { getAuthenticatedMembre, estReauthRecente } from '@/lib/institutionAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)
const RP_NAME = 'YELEN224'

// Passkey PAR MEMBRE (16/09/2026) — distinct de
// app/api/institution/auth/webauthn/register-options/route.ts qui
// n'enregistre que pour le compte principal (userID=institutionId). Ici
// userID=membreId : n'importe quel rôle (agent/comptable/superviseur/
// dirigeant/admin) peut ajouter SA PROPRE clé, en plus de son
// identifiant+PIN — jamais en remplacement (voir membre/auth-verify pour
// le flux de connexion correspondant).
function getWebAuthnRpID(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) {
    try { return new URL(envUrl).hostname } catch {}
  }
  return new URL(request.url).hostname
}

export async function POST(request: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(request)
    if (!membre) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }
    // Ajouter un nouveau moyen de connexion durable exige une identité
    // fraîchement reconfirmée (moteur de réauth, 16/09/2026) — sinon une
    // session volée pourrait planter une passkey qui survit à son
    // expiration (8h). register-verify n'a pas besoin du même gate : sans
    // ce challengeToken (obtenu uniquement ici), il ne peut jamais aboutir.
    if (!estReauthRecente(membre)) {
      return NextResponse.json({ error: "Pour votre sécurité, confirmez à nouveau votre identité pour continuer.", code: 'REAUTH_REQUIRED' }, { status: 403 })
    }

    const { data: row } = await supabaseAdmin
      .from('institution_membres')
      .select('identifiant, prenom, nom')
      .eq('id', membre.membreId)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'Compte introuvable', code: 'NOT_FOUND' }, { status: 404 })

    const { data: existingCreds } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .select('credential_id')
      .eq('membre_id', membre.membreId)

    const rpID = getWebAuthnRpID(request)
    const displayName = `${row.prenom} ${row.nom}`

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(membre.membreId),
      userName: row.identifiant || displayName,
      userDisplayName: displayName,
      attestationType: 'none',
      excludeCredentials: (existingCreds || []).map((c) => ({ id: c.credential_id })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    })

    const challengeToken = await new SignJWT({ membreId: membre.membreId, challenge: options.challenge })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer('yelen224-institution-webauthn-membre')
      .sign(JWT_SECRET)

    return NextResponse.json({ success: true, options, challengeToken })

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN MEMBRE REGISTER OPTIONS ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
