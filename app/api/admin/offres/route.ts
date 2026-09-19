import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// File de MODÉRATION des offres partenaires (chantier 26/07/2026) — évolution
// du CRUD d'origine. L'admin ne rédige plus aucune offre, il approuve/
// refuse/suspend uniquement (voir [id]/approuver, [id]/refuser, [id]/
// suspendre, DELETE ci-dessous).
export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'offres.moderate')
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
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
