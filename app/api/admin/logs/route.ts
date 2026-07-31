import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
  // Durcissement rôle (chantier refonte admin 26/07/2026, Lot I).
  if (payload.role !== 'super_admin') throw new Error('FORBIDDEN')
  return payload
}

export async function GET(request: NextRequest) {
  try {
    await verifyToken(request)

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '30')
    const page  = parseInt(searchParams.get('page')  || '0')
    const adminId = searchParams.get('admin_id')

    // Filtre optionnel — l'écran Sécurité (Mon compte) l'appelle avec son
    // propre admin_id pour n'afficher que ses propres événements, pas
    // ceux des autres admins.
    let query = supabaseAdmin
      .from('admin_logs')
      .select('id, action, created_at, admin_id, cible_table, cible_id, details')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (adminId) query = query.eq('admin_id', adminId)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data || [])

  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}