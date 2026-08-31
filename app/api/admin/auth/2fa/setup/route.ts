import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'
import { verifyAdminSession } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Génère un secret TOTP en attente de confirmation (totp_enabled reste
// false tant que /2fa/verify n'a pas validé un premier code) — évite
// qu'un secret jamais confirmé par l'admin ne verrouille la 2FA.
export async function POST(request: NextRequest) {
  let adminId: string
  let email: string
  try {
    const payload = await verifyAdminSession(request)
    adminId = payload.adminId
    email = payload.email
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
