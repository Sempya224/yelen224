import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'annonces.moderate')
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '25')
    const page  = parseInt(searchParams.get('page')  || '0')
    const statut = searchParams.get('statut') || ''
    const search = searchParams.get('search') || ''

    let q = supabaseAdmin
      .from('annonces')
      .select('id, titre, contenu, type, statut, date_expiration, nb_vues, nb_clics, epingle, institution_id, created_at, image_url, regions_cibles, date_publication')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut && statut !== 'tous') q = q.eq('statut', statut)
    if (search) q = q.ilike('titre', `%${search}%`)

    const { data, error } = await q
    if (error) throw error

    // Aligné sur api/institution/annonces (16/07/2026) — `nb_vues` brut n'est
    // écrit par personne côté citoyen (RLS n'autorise pas l'UPDATE client sur
    // `annonces`), donc COUNT(*) réel sur annonce_vues, même principe que côté
    // dashboard institution.
    const ids = (data ?? []).map((a) => a.id)
    const vuesMap: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: vuesRows } = await supabaseAdmin.from('annonce_vues').select('annonce_id').in('annonce_id', ids)
      ;(vuesRows ?? []).forEach((v: { annonce_id: string }) => {
        vuesMap[v.annonce_id] = (vuesMap[v.annonce_id] ?? 0) + 1
      })
    }
    const enriched = (data ?? []).map((a) => ({ ...a, nb_vues: vuesMap[a.id] ?? 0 }))

    return NextResponse.json(enriched)
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request, 'annonces.moderate')
    const body = await request.json()

    const { data, error } = await supabaseAdmin
      .from('annonces')
      .insert({
        titre: body.titre,
        contenu: body.contenu,
        type: body.type || 'information',
        statut: body.statut || 'publiee',
        date_expiration: body.date_expiration || null,
        epingle: body.epingle || false,
        institution_id: body.institution_id || null,
        date_publication: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'CREER_ANNONCE',
      cible_table: 'annonces',
      cible_id: data.id,
      details: { titre: body.titre },
    })

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof AdminAuthError) return adminAuthErrorResponse(err)
    console.error('[ANNONCES POST]', err)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
