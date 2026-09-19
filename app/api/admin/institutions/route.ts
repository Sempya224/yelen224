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
    await authorizeAdmin(request, 'institutions.manage')

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || 'tous'
    const limit  = parseInt(searchParams.get('limit') || '25')
    const page   = parseInt(searchParams.get('page')  || '0')
    const search = searchParams.get('search') || ''

    let query = supabaseAdmin
      .from('institutions')
      .select('id, name, category, ville, statut, created_at, email, phone, badge_verifie, avertissements, plan, document_officiel, description, whatsapp, website, adresse, moyenne_avis, nb_avis, logo, quartier')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut && statut !== 'tous') query = query.eq('statut', statut)
    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error } = await query

    if (error) {
      console.error('[INSTITUTIONS ERROR]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])

  } catch (err) {
    return adminAuthErrorResponse(err)
  }
}