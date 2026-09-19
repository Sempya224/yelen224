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

    const { data: demande, error: findErr } = await supabaseAdmin
      .from('institution_communaute_demandes')
      .select('id, institution_id, statut')
      .eq('id', id)
      .maybeSingle()
    if (findErr) throw findErr
    if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('institution_communaute_demandes')
      .update({ statut: 'approuve', traite_par_admin_id: admin.adminId as string, date_decision: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('institutions').update({ communaute_statut: 'approuve' }).eq('id', demande.institution_id)

    await supabaseAdmin.from('notifications').insert({
      destinataire_id: demande.institution_id,
      destinataire_type: 'institution',
      titre: 'Adhésion à Yelen Community approuvée',
      message: "Votre demande a été approuvée. Vous pouvez maintenant publier depuis l'onglet Yelen Community.",
      type: 'communaute',
      lien: `/institution/${demande.institution_id}/dashboard`,
    })

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'VALIDER_COMMUNAUTE_DEMANDE',
      cible_table: 'institution_communaute_demandes',
      cible_id: id,
      details: { institution_id: demande.institution_id },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
