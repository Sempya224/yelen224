import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyToken(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin',
    audience: 'yelen224-admin-dashboard',
  })
  return payload
}

const STATUTS = ['nouveau', 'lu', 'traite'] as const
type Statut = typeof STATUTS[number]

export async function GET(request: NextRequest) {
  try {
    await verifyToken(request)

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || 'tous'
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '0')

    let query = supabaseAdmin
      .from('feedback')
      .select('id, institution_id, type, message, statut, created_at')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut !== 'tous') query = query.eq('statut', statut)

    const { data, error } = await query
    if (error) throw error

    const institutionIds = [...new Set((data ?? []).map(f => f.institution_id))]
    const { data: institutions } = institutionIds.length
      ? await supabaseAdmin.from('institutions').select('id, name').in('id', institutionIds)
      : { data: [] as { id: string; name: string }[] }
    const nomMap = new Map((institutions ?? []).map(i => [i.id, i.name]))

    const feedbacks = (data ?? []).map(f => ({ ...f, institution_nom: nomMap.get(f.institution_id) ?? 'Institution inconnue' }))

    return NextResponse.json(feedbacks)

  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyToken(request)

    const body = await request.json().catch(() => null)
    const id = body?.id
    const statut = body?.statut
    if (typeof id !== 'string' || !STATUTS.includes(statut as Statut)) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('feedback').update({ statut }).eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'MAJ_STATUT_FEEDBACK',
      cible_table: 'feedback',
      cible_id: id,
    })

    return NextResponse.json({ success: true })

  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
