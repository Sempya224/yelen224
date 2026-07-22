import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { YELEN224_OTP_SIMULE } from '@/lib/auth/constants'
import { mintCitoyenSessionTokenHash } from '@/lib/auth/citoyenSession'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/

const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

function lockedMsRemaining(phone: string): number {
  const entry = failedAttempts.get(phone)
  if (!entry) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? remaining : 0
}

function registerFailure(phone: string) {
  const now = Date.now()
  const entry = failedAttempts.get(phone)
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0
  failedAttempts.set(phone, { count, lockedUntil })
}

function clearFailures(phone: string) {
  failedAttempts.delete(phone)
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'

    if (!checkIpRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { phone, code, prenom, nom, ville } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'code requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!prenom || typeof prenom !== 'string' || !prenom.trim()) {
      return NextResponse.json(
        { error: 'Le prénom est requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }
    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return NextResponse.json(
        { error: 'Le nom est requis', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (lockedMsRemaining(phone) > 0) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'LOCKED' },
        { status: 429 }
      )
    }

    // Ne pas dupliquer un compte déjà enregistré sur ce numéro
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Ce numéro est déjà enregistré. Connectez-vous à la place.', code: 'ALREADY_REGISTERED' },
        { status: 409 }
      )
    }

    // Revalidation complète du code OTP — ne fait jamais confiance à un état
    // "vérifié" déclaré par le client.
    // ⚠️ DEV MODE — code OTP simulé, décision assumée de Bryan (voir CLAUDE.md /auth).
    if (code !== YELEN224_OTP_SIMULE) {
      registerFailure(phone)
      return NextResponse.json(
        { error: 'Code incorrect', code: 'INVALID_CODE' },
        { status: 401 }
      )
    }

    clearFailures(phone)

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
      return NextResponse.json(
        { error: 'Erreur lors de la création du compte', code: 'AUTH_SHELL_ERROR' },
        { status: 500 }
      )
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
      return NextResponse.json(
        { error: 'Erreur lors de la création du compte', code: 'INSERT_ERROR' },
        { status: 500 }
      )
    }

    const sessionResult = await mintCitoyenSessionTokenHash(supabaseAdmin, userId)
    const tokenHash = 'tokenHash' in sessionResult ? sessionResult.tokenHash : null
    if ('error' in sessionResult) {
      console.error('[CITOYEN REGISTER SESSION MINT ERROR]', sessionResult.error)
    }

    return NextResponse.json({ success: true, userId, tokenHash })

  } catch (error) {
    console.error('[CITOYEN REGISTER ERROR]', error)
    return NextResponse.json(
      { error: 'Erreur serveur', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
