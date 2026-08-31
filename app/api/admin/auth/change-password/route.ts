import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { verifyAdminSession } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Politique simple, cohérente avec le niveau déjà appliqué ailleurs dans
// le projet (citoyen/institution) : longueur + diversité minimale, pas de
// liste de mots interdits (pas de donnée de référence fiable pour ça ici).
function motDePasseValide(pwd: string): boolean {
  return pwd.length >= 10 && /[a-zA-Z]/.test(pwd) && /[0-9]/.test(pwd)
}

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
    const passwordActuel = body?.password_actuel
    const nouveauPassword = body?.nouveau_password
    if (typeof passwordActuel !== 'string' || typeof nouveauPassword !== 'string') {
      return NextResponse.json({ error: 'password_actuel et nouveau_password requis' }, { status: 400 })
    }
    if (!motDePasseValide(nouveauPassword)) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre.' }, { status: 400 })
    }

    const { data: admin } = await supabaseAdmin
      .from('admin_users')
      .select('id, password_hash')
      .eq('id', adminId)
      .maybeSingle()
    if (!admin) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

    const actuelValide = await bcrypt.compare(passwordActuel, admin.password_hash)
    if (!actuelValide) {
      return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 })
    }

    const nouveauHash = await bcrypt.hash(nouveauPassword, 12)
    const { error } = await supabaseAdmin
      .from('admin_users')
      .update({ password_hash: nouveauHash, password_changed_at: new Date().toISOString() })
      .eq('id', adminId)
    if (error) throw error

    // admin_sessions (Mission Hardening Admin, point 7, 30/08/2026,
    // remplace session_revoked_at de GAP-04-04) — révoque TOUTES les
    // sessions actives du compte, y compris celle-ci (reconnexion requise,
    // même précédent que le chantier MFA Admin du 13/08/2026). Un
    // changement de mot de passe est explicitement un scénario de
    // compromission potentielle.
    await supabaseAdmin
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: 'password_change' })
      .eq('admin_id', adminId)
      .is('revoked_at', null)

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: adminId,
      action: 'MOT_DE_PASSE_CHANGE',
    })

    return NextResponse.json({ ok: true })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
