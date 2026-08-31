import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { genererEtEnvoyerOtp } from '@/lib/auth/otp'
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
  // Auth Security (chantier 28/08/2026) — remplace l'ancien rate limit IP
  // en Map locale, non persistant, non partagé entre instances serverless
  // (voir lib/security/authSecurity.ts). Résolu avant toute logique métier
  // pour pouvoir poser le cookie device sur n'importe quelle réponse.
  const { deviceId, estNouveau } = resoudreDeviceId(request)
  const ip = extraireIpClient(request)
  const userAgent = request.headers.get('user-agent')

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status })
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau)
    return response
  }

  try {
    // Porte anti-abus — AVANT toute requête Supabase (exigence du brief :
    // une tentative refusée ne doit jamais interroger la base).
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

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, prenom, nom')
      .eq('phone', phone)
      .maybeSingle()

    if (dbError || !user) {
      // Compte toujours comme une vraie tentative — un citoyen qui martèle
      // un numéro inexistant (le sien mal saisi ou un numéro au hasard)
      // doit lui aussi déclencher l'escalade, en défense en profondeur du
      // garde-fou côté frontend (état terminal posé par app/login/page.tsx).
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'citoyen_login', deviceId, ip, identifiant: phone, outcome: 'not_found', userAgent,
      })
      return finaliser({ error: 'Aucun compte trouvé pour ce numéro', code: 'NOT_FOUND', security: etat }, 404)
    }

    // Génère et stocke le vrai code OTP de cette tentative de connexion
    // (retour Bryan 25/07/2026) — avant, aucun code n'était réellement émis
    // ici, la vérification comparait à une constante fixe.
    const otpResult = await genererEtEnvoyerOtp(supabaseAdmin, user.id, phone)
    if (!otpResult.ok) {
      console.error('[CITOYEN LOOKUP OTP ERROR]', otpResult.error)
      return finaliser({ error: "Envoi du code impossible pour l'instant. Réessayez.", code: 'OTP_SEND_ERROR' }, 500)
    }

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'citoyen_login', deviceId, ip, identifiant: phone, outcome: 'trouve', userAgent,
    })

    return finaliser({ success: true, user, security: etat }, 200)

  } catch (error) {
    console.error('[CITOYEN LOOKUP ERROR]', error)
    return finaliser({ error: 'Une erreur est survenue, réessayez dans un instant', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
