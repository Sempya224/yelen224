import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdminSession, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSession(request)

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '30')
    const page  = parseInt(searchParams.get('page')  || '0')
    const adminId = searchParams.get('admin_id')

    // logs.read (écran "Logs système", vue globale) reste réservé à
    // super_admin. Mais l'écran Sécurité (Mon compte, visible à tous les
    // rôles) appelle cette même route avec son propre admin_id pour
    // afficher uniquement SES propres actions — un contrôle de rôle seul
    // ne suffit pas ici : même authentifié, un rôle non-super_admin est
    // forcé sur son propre admin_id côté serveur, jamais celui fourni par
    // le client (protection BOLA — voir lib/adminAuth.ts).
    let query = supabaseAdmin
      .from('admin_logs')
      .select('id, action, created_at, admin_id, cible_table, cible_id, details')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (session.role === 'super_admin') {
      if (adminId) query = query.eq('admin_id', adminId)
    } else {
      query = query.eq('admin_id', session.adminId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data || [])

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}