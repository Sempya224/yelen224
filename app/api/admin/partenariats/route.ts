import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

// Modération des demandes de partenariat — réservée à super_admin/moderateur
// (pas tous les rôles admin), à la différence des routes offres d'origine qui
// ne gataient rien. Cf. pattern app/api/admin/admins/route.ts.
async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard',
  })
  if (payload.role !== 'super_admin' && payload.role !== 'moderateur') throw new Error('FORBIDDEN')
  return payload
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
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
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}
