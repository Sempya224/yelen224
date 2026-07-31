import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verify } from 'otplib'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyToken(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin',
    audience: 'yelen224-admin-dashboard',
  })
  return payload
}

function genererCodeSecours(): string {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`
}

// Confirme le premier code TOTP saisi (voir /2fa/setup) — active
// réellement la 2FA et génère les codes de secours (affichés une seule
// fois, jamais récupérables ensuite : seuls leurs hash bcrypt sont
// conservés en base, comme le mot de passe).
export async function POST(request: NextRequest) {
  let adminId: string
  try {
    const payload = await verifyToken(request)
    adminId = payload.adminId as string
  } catch {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null)
    const code = body?.code
    if (typeof code !== 'string') {
      return NextResponse.json({ error: 'Code requis' }, { status: 400 })
    }

    const { data: admin } = await supabaseAdmin
      .from('admin_users')
      .select('totp_secret')
      .eq('id', adminId)
      .maybeSingle()
    if (!admin?.totp_secret) {
      return NextResponse.json({ error: 'Aucune configuration 2FA en attente — recommencez depuis le début.' }, { status: 400 })
    }

    const result = await verify({ secret: admin.totp_secret, token: code })
    if (!result.valid) {
      return NextResponse.json({ error: 'Code invalide' }, { status: 401 })
    }

    const codesEnClair = Array.from({ length: 8 }, genererCodeSecours)
    const codesHashes = await Promise.all(codesEnClair.map(c => bcrypt.hash(c, 10)))

    const { error } = await supabaseAdmin
      .from('admin_users')
      .update({ totp_enabled: true, totp_backup_codes: codesHashes })
      .eq('id', adminId)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: adminId,
      action: '2FA_ACTIVEE',
    })

    return NextResponse.json({ ok: true, backupCodes: codesEnClair })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
