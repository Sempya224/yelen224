import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'rdv.read')

    const { searchParams } = new URL(request.url)
    const limit  = parseInt(searchParams.get('limit') || '25')
    const page   = parseInt(searchParams.get('page')  || '0')
    const statut = searchParams.get('statut') || ''

    let query = supabaseAdmin
      .from('rdv')
      .select('id, statut, created_at, date_rdv, heure_rdv, institution_id, citoyen_id, objet')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut && statut !== 'tous') query = query.eq('statut', statut)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data || [])

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}