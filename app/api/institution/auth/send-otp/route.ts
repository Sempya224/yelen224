import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ⚠️ DEV MODE — décision assumée de Bryan (voir CLAUDE.md /auth), pas une dette
// à corriger sans demande explicite. Ne jamais passer à false ni brancher un
// vrai fournisseur SMS sans validation préalable.
const DEV_MODE = true
const DEV_OTP = '123456'

const PHONE_REGEX = /^\+224\d{8,9}$/

const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const cooldown = new Map<string, number>()

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

function checkCooldown(identifier: string): boolean {
  const now = Date.now()
  const nextAllowed = cooldown.get(identifier)
  if (nextAllowed && nextAllowed > now) return false
  cooldown.set(identifier, now + 60 * 1000)
  return true
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
    const { institutionId, phone: rawPhone } = body

    const hasInstitutionId = typeof institutionId === 'string' && institutionId.length > 0
    const hasPhone = typeof rawPhone === 'string' && rawPhone.length > 0

    if (hasInstitutionId === hasPhone) {
      return NextResponse.json(
        { error: 'Fournir institutionId (connexion) ou phone (inscription), pas les deux', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (hasPhone && !PHONE_REGEX.test(rawPhone)) {
      return NextResponse.json(
        { error: 'Format de téléphone invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    const identifier: string = hasInstitutionId ? institutionId : rawPhone

    if (!checkCooldown(identifier)) {
      return NextResponse.json(
        { error: 'Un code a déjà été envoyé récemment. Patientez avant de réessayer.', code: 'COOLDOWN' },
        { status: 429 }
      )
    }

    let phone: string

    if (hasInstitutionId) {
      const { data: institution, error: dbError } = await supabaseAdmin
        .from('institutions')
        .select('id, phone')
        .eq('id', institutionId)
        .single()

      if (dbError || !institution) {
        return NextResponse.json(
          { error: 'Institution introuvable', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }
      phone = institution.phone
    } else {
      phone = rawPhone
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    if (DEV_MODE) {
      await supabaseAdmin.from('institution_otp').insert({
        phone,
        code: DEV_OTP,
        expires_at: expiresAt,
      })

      return NextResponse.json({ success: true, devMode: true, code: DEV_OTP })
    }

    // Branche prod — squelette. Fournisseur SMS non branché : le code est
    // généré et stocké mais jamais renvoyé au client.
    const code = crypto.randomInt(100000, 1000000).toString()

    await supabaseAdmin.from('institution_otp').insert({
      phone,
      code,
      expires_at: expiresAt,
    })

    return NextResponse.json({ success: true, devMode: false })

  } catch (error) {
    console.error('[INSTITUTION OTP SEND ERROR]', error)
    return NextResponse.json(
      { error: 'Erreur serveur', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
