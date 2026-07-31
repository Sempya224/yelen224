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
  if (payload.role !== 'super_admin' && payload.role !== 'moderateur') throw new Error('FORBIDDEN')
  return payload
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAdmin(request)
    const { id } = await params

    const { data: current } = await supabaseAdmin.from('offres').select('statut').eq('id', id).maybeSingle()
    if (!current) return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 })
    if (current.statut !== 'en_attente_validation') {
      return NextResponse.json({ error: 'Seule une offre en attente de validation peut être approuvée' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('offres')
      .update({ statut: 'publiee', valide_le: new Date().toISOString(), valide_par_admin_id: admin.adminId as string, motif_refus: null })
      .eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'APPROUVER_OFFRE',
      cible_table: 'offres',
      cible_id: id,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
