import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
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

// Cooldown d'envoi (anti-spam SMS, distinct du throttling anti-abus) —
// conservé tel quel, ce n'est pas une tentative d'authentification mais
// une protection contre le renvoi répété d'un même code.
const cooldown = new Map<string, number>()

function checkCooldown(identifier: string): boolean {
  const now = Date.now()
  const nextAllowed = cooldown.get(identifier)
  if (nextAllowed && nextAllowed > now) return false
  cooldown.set(identifier, now + 60 * 1000)
  return true
}

export async function POST(request: NextRequest) {
  // Auth Security (chantier 28/08/2026) — voir lib/security/authSecurity.ts.
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
    const { institutionId, phone: rawPhone } = body

    const hasInstitutionId = typeof institutionId === 'string' && institutionId.length > 0
    const hasPhone = typeof rawPhone === 'string' && rawPhone.length > 0
    // Réutilisé pour la journalisation de la tentative ci-dessous — même
    // route pour connexion (institutionId connu) et inscription (phone).
    const endpointCategory = hasInstitutionId ? 'institution_login' as const : 'institution_register' as const

    if (hasInstitutionId === hasPhone) {
      return finaliser({ error: 'Fournir institutionId (connexion) ou phone (inscription), pas les deux', code: 'MISSING_FIELDS' }, 400)
    }

    if (hasPhone && !PHONE_REGEX.test(rawPhone)) {
      return finaliser({ error: 'Format de téléphone invalide', code: 'INVALID_FORMAT' }, 400)
    }

    const identifier: string = hasInstitutionId ? institutionId : rawPhone

    if (!checkCooldown(identifier)) {
      return finaliser({ error: 'Un code a déjà été envoyé récemment. Patientez avant de réessayer.', code: 'COOLDOWN' }, 429)
    }

    let phone: string

    if (hasInstitutionId) {
      const { data: institution, error: dbError } = await supabaseAdmin
        .from('institutions')
        .select('id, phone')
        .eq('id', institutionId)
        .single()

      if (dbError || !institution) {
        const etat = await enregistrerTentative(supabaseAdmin, {
          endpointCategory, deviceId, ip, identifiant: institutionId, outcome: 'not_found', userAgent,
        })
        return finaliser({ error: 'Institution introuvable', code: 'NOT_FOUND', security: etat }, 404)
      }
      phone = institution.phone
    } else {
      phone = rawPhone

      // Vérification "déjà enregistré" — service_role, voit TOUTES les
      // institutions quel que soit leur statut (contrairement à l'ancienne
      // pré-vérification côté client PhoneStep.tsx, qui utilisait le client
      // anon et ne voyait que statut='validee' via la RLS publique — une
      // institution en_attente passait donc au travers, incohérence réelle
      // trouvée par Bryan le 20/08/2026 : Ecobank/validee bloquée
      // correctement, Nimbasms/en_attente non détectée). Seul le flux
      // d'inscription (phone fourni) est concerné, jamais la connexion
      // (institutionId fourni, où le numéro appartient légitimement à
      // l'institution qui se connecte).
      const { data: existing } = await supabaseAdmin
        .from('institutions')
        .select('id')
        .eq('phone', phone)
        .maybeSingle()
      if (existing) {
        const etat = await enregistrerTentative(supabaseAdmin, {
          endpointCategory, deviceId, ip, identifiant: phone, outcome: 'deja_enregistre', userAgent,
        })
        return finaliser({ error: 'Ce numéro est déjà enregistré. Connectez-vous à la place.', code: 'ALREADY_REGISTERED', security: etat }, 409)
      }
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Durcissement Lot 1.1 (13/08/2026, remédiation GAP-04-01) — même
    // architecture que lib/auth/otp.ts côté citoyen : plus aucune valeur en
    // dur, plus aucun bypass inconditionnel. Tant qu'aucun SMS_PROVIDER
    // n'est configuré, le code réellement stocké/vérifié vient de
    // INSTITUTION_OTP_FALLBACK (variable d'environnement serveur, jamais
    // envoyée au client, jamais affichée à l'écran) — si elle est absente,
    // l'envoi échoue explicitement plutôt que de retomber sur une valeur
    // devinable. verify-otp/register n'ont plus aucun code de contournement
    // : ils vérifient uniquement ce qui est réellement stocké ici.
    let code: string
    if (process.env.SMS_PROVIDER) {
      // TODO(Bryan) : brancher l'envoi SMS réel ici une fois le
      // compte/la clé API créés.
      code = crypto.randomInt(100000, 1000000).toString()
      console.warn('[institution otp] SMS_PROVIDER défini mais aucun adaptateur d\'envoi réel implémenté — code non délivré à l\'institution.')
    } else {
      const fallback = process.env.INSTITUTION_OTP_FALLBACK
      if (!fallback) {
        return finaliser({ error: 'OTP non configuré côté serveur (INSTITUTION_OTP_FALLBACK manquant).', code: 'OTP_NOT_CONFIGURED' }, 500)
      }
      code = fallback
    }

    await supabaseAdmin.from('institution_otp').insert({
      phone,
      code,
      expires_at: expiresAt,
    })

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory, deviceId, ip, identifiant: hasInstitutionId ? institutionId : rawPhone, outcome: 'code_envoye', userAgent,
    })

    return finaliser({ success: true, security: etat }, 200)

  } catch (error) {
    console.error('[INSTITUTION OTP SEND ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
