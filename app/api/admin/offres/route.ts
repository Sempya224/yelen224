import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

// File de MODÉRATION des offres partenaires (chantier 26/07/2026) — évolution
// du CRUD d'origine. L'admin ne rédige plus aucune offre, il approuve/
// refuse/suspend uniquement (voir [id]/approuver, [id]/refuser, [id]/
// suspendre, DELETE ci-dessous). Réservé à super_admin/moderateur.
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
    const limit = parseInt(searchParams.get('limit') || '25')
    const page  = parseInt(searchParams.get('page')  || '0')
    const statut = searchParams.get('statut') || ''
    const search = searchParams.get('search') || ''

    let q = supabaseAdmin
      .from('offres')
      .select('id, titre, description_courte, description_longue, categorie, genre, partenaire_nom, partenaire_logo, cta_label, cta_url, statut, date_expiration, soumis_le, valide_le, motif_refus, nb_clics, epingle, ordre, faits, avantages, limites, created_at, institution_id, institutions(name, logo, ville)')
      .order('soumis_le', { ascending: true })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut && statut !== 'tous') q = q.eq('statut', statut)
    if (search) q = q.ilike('titre', `%${search}%`)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}
