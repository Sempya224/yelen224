import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'communaute.moderate')
    const { id } = await params
    const body = await request.json().catch(() => null)
    const motif = body?.motif
    if (!motif || typeof motif !== 'string' || !motif.trim()) {
      return NextResponse.json({ error: 'Un motif est requis' }, { status: 400 })
    }

    const { data: demande, error: findErr } = await supabaseAdmin
      .from('institution_communaute_demandes')
      .select('id, institution_id')
      .eq('id', id)
      .maybeSingle()
    if (findErr) throw findErr
    if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('institution_communaute_demandes')
      .update({ statut: 'refuse', motif_refus: motif, traite_par_admin_id: admin.adminId as string, date_decision: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('institutions').update({ communaute_statut: 'refuse' }).eq('id', demande.institution_id)

    await supabaseAdmin.from('notifications').insert({
      destinataire_id: demande.institution_id,
      destinataire_type: 'institution',
      titre: 'Demande d\'adhésion à Yelen Community refusée',
      message: `Votre demande n'a pas été retenue. Motif : ${motif}`,
      type: 'communaute',
      lien: `/institution/${demande.institution_id}/dashboard`,
    })

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'REFUSER_COMMUNAUTE_DEMANDE',
      cible_table: 'institution_communaute_demandes',
      cible_id: id,
      details: { institution_id: demande.institution_id, motif },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
