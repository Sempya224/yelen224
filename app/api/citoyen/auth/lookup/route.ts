import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { genererEtEnvoyerOtp } from '@/lib/auth/otp'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PHONE_REGEX = /^\+224\d{8,9}$/

const ipAttempts = new Map<string, { count: number; resetAt: number }>()

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
    const { phone } = body

    if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, prenom, nom')
      .eq('phone', phone)
      .maybeSingle()

    if (dbError || !user) {
      return NextResponse.json(
        { error: 'Aucun compte trouvé pour ce numéro', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // Génère et stocke le vrai code OTP de cette tentative de connexion
    // (retour Bryan 25/07/2026) — avant, aucun code n'était réellement émis
    // ici, la vérification comparait à une constante fixe.
    const otpResult = await genererEtEnvoyerOtp(supabaseAdmin, user.id, phone)
    if (!otpResult.ok) {
      console.error('[CITOYEN LOOKUP OTP ERROR]', otpResult.error)
      return NextResponse.json(
        { error: "Envoi du code impossible pour l'instant. Réessayez.", code: 'OTP_SEND_ERROR' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, user })

  } catch (error) {
    console.error('[CITOYEN LOOKUP ERROR]', error)
    return NextResponse.json(
      { error: 'Une erreur est survenue, réessayez dans un instant', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
