import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { mintCitoyenSessionTokenHash } from '@/lib/auth/citoyenSession'
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
  // Auth Security (chantier 28/08/2026) — remplace les 2 Map locales
  // (ipAttempts/failedAttempts, non persistantes, non partagées entre
  // instances serverless) — voir lib/security/authSecurity.ts.
  const { deviceId, estNouveau } = resoudreDeviceId(request)
  const ip = extraireIpClient(request)
  const userAgent = request.headers.get('user-agent')

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status })
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau)
    return response
  }

  try {
    // Porte anti-abus — AVANT toute requête Supabase.
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip })
    if (porte.state === 'blocked' || porte.state === 'support_only') {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === 'blocked' ? 'AUTH_SECURITY_BLOCKED' : 'AUTH_SECURITY_SUPPORT_ONLY', security: porte },
        423
      )
    }

    const body = await request.json()
    const { phone, code, prenom, nom, ville } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return finaliser({ error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' }, 400)
    }
    if (!code || typeof code !== 'string') {
      return finaliser({ error: 'code requis', code: 'MISSING_FIELDS' }, 400)
    }
    if (!prenom || typeof prenom !== 'string' || !prenom.trim()) {
      return finaliser({ error: 'Le prénom est requis', code: 'MISSING_FIELDS' }, 400)
    }
    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return finaliser({ error: 'Le nom est requis', code: 'MISSING_FIELDS' }, 400)
    }

    // Ne pas dupliquer un compte déjà enregistré sur ce numéro
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (existing) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'citoyen_register', deviceId, ip, identifiant: phone, outcome: 'deja_enregistre', userAgent,
      })
      return finaliser({ error: 'Ce numéro est déjà enregistré. Connectez-vous à la place.', code: 'ALREADY_REGISTERED', security: etat }, 409)
    }

    // Revalidation complète du code OTP — ne fait jamais confiance à un état
    // "vérifié" déclaré par le client.
    // Retour Bryan 25/07/2026 : plus de constante publique en dur ni
    // affichée à l'écran (app/inscription/page.tsx). Tant qu'aucun
    // fournisseur SMS n'est branché (voir lib/auth/otp.ts), le code de
    // secours vit exclusivement dans une variable d'environnement serveur,
    // jamais committée. Pas de repli silencieux si elle est absente.
    const otpFallback = process.env.CITOYEN_OTP_FALLBACK
    if (!otpFallback) {
      console.error('[CITOYEN REGISTER OTP ERROR] CITOYEN_OTP_FALLBACK manquant')
      return finaliser({ error: "Inscription impossible pour l'instant. Réessayez plus tard.", code: 'OTP_SEND_ERROR' }, 500)
    }
    if (code !== otpFallback) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: 'citoyen_register', deviceId, ip, identifiant: phone, outcome: 'code_incorrect', userAgent,
      })
      return finaliser({ error: 'Code incorrect', code: 'INVALID_CODE', security: etat }, 401)
    }

    // ⚠️ COQUILLE TECHNIQUE — public.users.id est une FK vers auth.users(id)
    // (contrainte citoyens_id_fkey), mais les citoyens n'utilisent jamais
    // Supabase Auth (voir CLAUDE.md /auth : session 100% custom via
    // localStorage, aucun supabase.auth.* appelé côté citoyen). Ce compte
    // auth.users est créé uniquement pour satisfaire la contrainte FK — ce
    // n'est PAS un compte fonctionnel, il n'est jamais utilisé pour se
    // connecter (mot de passe aléatoire jamais communiqué, jamais vérifié
    // nulle part). Ne pas s'étonner de le voir dans auth.users : c'est
    // attendu tant que ce flow OTP custom n'est pas remplacé par le vrai
    // Supabase Phone Auth (décision de Bryan, voir /auth du CLAUDE.md).
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: `${randomUUID()}@citoyen.yelen224.local`,
      email_confirm: true,
      password: randomUUID(),
      user_metadata: {
        yelen224_shell_account: true,
        yelen224_shell_reason: 'FK users.id -> auth.users.id, pas un compte fonctionnel',
      },
    })

    if (authError || !authUser?.user) {
      console.error('[CITOYEN REGISTER AUTH SHELL ERROR]', authError)
      return finaliser({ error: 'Erreur lors de la création du compte', code: 'AUTH_SHELL_ERROR' }, 500)
    }

    const userId = authUser.user.id

    // Renomme l'email pour qu'il reflète l'id final — uniquement pour la
    // lisibilité si quelqu'un inspecte auth.users un jour. Non bloquant si
    // ça échoue : la coquille reste fonctionnelle avec son email temporaire.
    const { error: renameError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: `${userId}@citoyen.yelen224.local`,
    })
    if (renameError) {
      console.error('[CITOYEN REGISTER AUTH SHELL RENAME WARNING]', renameError)
    }

    const { error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        phone,
        prenom: prenom.trim(),
        nom: nom.trim(),
        ...(typeof ville === 'string' && ville.trim() ? { ville: ville.trim() } : {}),
      })

    if (insertError) {
      console.error('[CITOYEN REGISTER INSERT ERROR]', insertError)
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return finaliser({ error: 'Erreur lors de la création du compte', code: 'INSERT_ERROR' }, 500)
    }

    const sessionResult = await mintCitoyenSessionTokenHash(supabaseAdmin, userId)
    const tokenHash = 'tokenHash' in sessionResult ? sessionResult.tokenHash : null
    if ('error' in sessionResult) {
      console.error('[CITOYEN REGISTER SESSION MINT ERROR]', sessionResult.error)
    }

    const etat = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: 'citoyen_register', deviceId, ip, identifiant: phone, outcome: 'compte_cree', userAgent,
    })

    return finaliser({ success: true, userId, tokenHash, security: etat }, 200)

  } catch (error) {
    console.error('[CITOYEN REGISTER ERROR]', error)
    return finaliser({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
