import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard',
  })
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
      .from('annonces')
      .select('id, titre, contenu, type, statut, date_expiration, nb_vues, nb_clics, epingle, institution_id, created_at, image_url, regions_cibles, date_publication')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut && statut !== 'tous') q = q.eq('statut', statut)
    if (search) q = q.ilike('titre', `%${search}%`)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
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
    console.error('[ANNONCES POST]', err)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
