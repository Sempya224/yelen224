import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// File de MODÉRATION des publications Yelen Community — mirroring exact
// de app/api/admin/offres/route.ts.
export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'posts.moderate')
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '25')
    const page  = parseInt(searchParams.get('page')  || '0')
    const statut = searchParams.get('statut') || ''

    let q = supabaseAdmin
      .from('posts')
      .select('id, auteur_id, categorie, author_nom, author_photo_url, author_verifie, author_membre_depuis, contenu, images, statut, motif_refus, soumis_le, valide_le, nb_partages, created_at')
      .order('soumis_le', { ascending: true })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut && statut !== 'tous') q = q.eq('statut', statut)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
