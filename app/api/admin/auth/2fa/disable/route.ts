import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { verifyAdminSession } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Exige le mot de passe actuel (comme /change-password) — la session
// seule ne suffit pas pour désactiver un facteur de sécurité.
export async function POST(request: NextRequest) {
  let adminId: string
  try {
    const payload = await verifyAdminSession(request)
    adminId = payload.adminId
  } catch {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null)
    const password = body?.password
    if (typeof password !== 'string') {
      return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 })
    }

    const { data: admin } = await supabaseAdmin
      .from('admin_users')
      .select('password_hash')
      .eq('id', adminId)
      .maybeSingle()
    if (!admin) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

    const passwordValide = await bcrypt.compare(password, admin.password_hash)
    if (!passwordValide) {
      return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 })
    }

    const { error } = await supabaseAdmin
      .from('admin_users')
      .update({ totp_secret: null, totp_enabled: false, totp_backup_codes: null })
      .eq('id', adminId)
    if (error) throw error

    // admin_sessions (Mission Hardening Admin, point 7, 30/08/2026,
    // remplace session_revoked_at de GAP-04-04) — révoque toutes les
    // sessions actives. Désactiver un facteur de sécurité est le scénario
    // même que la révocation vise à couvrir (reprise de contrôle après
    // compromission du 2e facteur).
    await supabaseAdmin
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: '2fa_disable' })
      .eq('admin_id', adminId)
      .is('revoked_at', null)

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: adminId,
      action: '2FA_DESACTIVEE',
    })

    return NextResponse.json({ ok: true })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
