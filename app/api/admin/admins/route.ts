import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { authorizeAdmin, adminAuthErrorResponse, verifyRecentReauth, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'admins.manage')
    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .select('id, email, nom, prenom, role, is_active, last_login, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request, 'admins.manage')
    // Réauthentification récente obligatoire (Mission Hardening Admin,
    // point 5, 30/08/2026) — créer un compte admin est explicitement listé
    // dans le brief ("modifier les permissions d'un autre administrateur").
    await verifyRecentReauth(admin)
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
    if (err instanceof AdminAuthError) return adminAuthErrorResponse(err)
    console.error('[ADMINS POST]', err)
    return NextResponse.json({ error: 'Erreur création' }, { status: 500 })
  }
}
