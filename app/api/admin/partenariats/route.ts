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
    await authorizeAdmin(request, 'partenariats.moderate')
    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || ''

    let q = supabaseAdmin
      .from('institution_partenariat_demandes')
      .select('id, institution_id, description_organisation, type_offres, impact_communaute, categorie, site_web, contact_nom, contact_email, contact_telephone, infos_complementaires, statut, motif_refus, date_decision, created_at, institutions(name, logo, ville, secteur)')
      .order('created_at', { ascending: false })

    if (statut && statut !== 'tous') q = q.eq('statut', statut)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
