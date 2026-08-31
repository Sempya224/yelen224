import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extraireIpClient } from '@/lib/edgeSecurity'
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from '@/lib/security/authSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026) — remplace la Map IP locale, voir
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
    const { phone } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return finaliser({ error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' }, 400)
    }

    // Pas de filtre sur statut : contrairement à la policy publique
    // (institutions_public_read, réservée aux institutions "validee"), une
    // institution peut se connecter dès son inscription, quel que soit son
    // statut de validation.
    const { data: institution, error: dbError } = await supabaseAdmin
      .from('institutions')
      .select('id, name, category, ville, logo, badge_verifie, moyenne_avis, nb_avis, phone, statut')
      .eq('phone', phone)
      .maybeSingle()

    if (dbError || !institution) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'institution_login', deviceId, ip, identifiant: phone, outcome: 'not_found', userAgent,
      })
      return finaliser({ error: 'Aucun compte trouvé pour ce numéro', code: 'NOT_FOUND', security: etat }, 404)
    }

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'institution_login', deviceId, ip, identifiant: phone, outcome: 'trouve', userAgent,
    })

    return finaliser({ success: true, institution, security: etat }, 200)

  } catch (error) {
    console.error('[INSTITUTION LOOKUP ERROR]', error)
    return finaliser({ error: 'Une erreur est survenue, réessayez dans un instant', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
