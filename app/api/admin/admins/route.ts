import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard',
  })
  if (payload.role !== 'super_admin') throw new Error('FORBIDDEN')
  return payload
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .select('id, email, nom, prenom, role, is_active, last_login, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    const body = await request.json()
    const { email, password, nom, prenom, role } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
    }

    const password_hash = await bcrypt.hash(password, 12)

    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .insert({ email, password_hash, nom, prenom, role: role || 'support', is_active: true })
      .select('id, email, nom, prenom, role')
      .single()

    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'CREER_ADMIN',
      cible_table: 'admin_users',
      cible_id: data.id,
      details: { email, role },
    })

    return NextResponse.json(data)
  } catch (err) {
    console.error('[ADMINS POST]', err)
    return NextResponse.json({ error: 'Erreur création' }, { status: 500 })
  }
}
