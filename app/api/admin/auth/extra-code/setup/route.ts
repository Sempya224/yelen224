import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { verifyAdminSession } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const CODE_RE = /^\d{8,16}$/

// 3e facteur admin (demande Bryan, 12/10/2026) — contrairement à la 2FA,
// l'admin choisit lui-même le code : pas de secret généré côté serveur à
// confirmer, donc un seul appel suffit (code + confirmation, comme un
// changement de mot de passe).
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
    const code = body?.code
    const confirmCode = body?.confirm_code

    if (typeof code !== 'string' || typeof confirmCode !== 'string') {
      return NextResponse.json({ error: 'Code requis' }, { status: 400 })
    }
    if (!CODE_RE.test(code)) {
      return NextResponse.json({ error: 'Le code doit contenir entre 8 et 16 chiffres.' }, { status: 400 })
    }
    if (code !== confirmCode) {
      return NextResponse.json({ error: 'La confirmation ne correspond pas au code.' }, { status: 400 })
    }

    const hash = await bcrypt.hash(code, 12)

    const { error } = await supabaseAdmin
      .from('admin_users')
      .update({ extra_code_hash: hash, extra_code_enabled: true })
      .eq('id', adminId)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: adminId,
      action: 'CODE_SECURITE_ACTIVE',
    })

    return NextResponse.json({ ok: true })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
