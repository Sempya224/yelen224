import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'
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

// Génère un secret TOTP en attente de confirmation (totp_enabled reste
// false tant que /2fa/verify n'a pas validé un premier code) — évite
// qu'un secret jamais confirmé par l'admin ne verrouille la 2FA.
export async function POST(request: NextRequest) {
  let adminId: string
  let email: string
  try {
    const payload = await verifyToken(request)
    adminId = payload.adminId as string
    email = payload.email as string
  } catch {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }

  try {
    const secret = await generateSecret()
    const uri = generateURI({ issuer: 'Yelen224 Admin', label: email, secret })
    const qrDataUrl = await QRCode.toDataURL(uri)

    const { error } = await supabaseAdmin
      .from('admin_users')
      .update({ totp_secret: secret, totp_enabled: false })
      .eq('id', adminId)
    if (error) throw error

    return NextResponse.json({ qrDataUrl, secret })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
