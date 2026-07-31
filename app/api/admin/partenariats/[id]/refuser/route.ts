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
    const body = await request.json().catch(() => null)
    const motif = body?.motif
    if (!motif || typeof motif !== 'string' || !motif.trim()) {
      return NextResponse.json({ error: 'Un motif est requis' }, { status: 400 })
    }

    const { data: demande, error: findErr } = await supabaseAdmin
      .from('institution_partenariat_demandes')
      .select('id, institution_id')
      .eq('id', id)
      .maybeSingle()
    if (findErr) throw findErr
    if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('institution_partenariat_demandes')
      .update({ statut: 'refuse', motif_refus: motif, traite_par_admin_id: admin.adminId as string, date_decision: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('institutions').update({ partenaire_statut: 'refuse' }).eq('id', demande.institution_id)

    await supabaseAdmin.from('notifications').insert({
      destinataire_id: demande.institution_id,
      destinataire_type: 'institution',
      titre: 'Demande de partenariat refusée',
      message: `Votre demande de partenariat Yelen n'a pas été retenue. Motif : ${motif}`,
      type: 'partenariat',
      lien: `/institution/${demande.institution_id}/dashboard`,
    })

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'REFUSER_PARTENARIAT',
      cible_table: 'institution_partenariat_demandes',
      cible_id: id,
      details: { institution_id: demande.institution_id, motif },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
