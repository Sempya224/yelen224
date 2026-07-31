import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
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

// Politique simple, cohérente avec le niveau déjà appliqué ailleurs dans
// le projet (citoyen/institution) : longueur + diversité minimale, pas de
// liste de mots interdits (pas de donnée de référence fiable pour ça ici).
function motDePasseValide(pwd: string): boolean {
  return pwd.length >= 10 && /[a-zA-Z]/.test(pwd) && /[0-9]/.test(pwd)
}

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

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: adminId,
      action: 'MOT_DE_PASSE_CHANGE',
    })

    return NextResponse.json({ ok: true })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
