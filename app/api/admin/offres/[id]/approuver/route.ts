import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enregistrerAction } from '@/lib/journalActivite'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'offres.moderate')
    const { id } = await params

    const { data: current } = await supabaseAdmin.from('offres').select('statut, institution_id, titre').eq('id', id).maybeSingle()
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

    // Journal d'activité côté institution (pas admin_logs, non exposée à
    // l'institution) — même convention que message_recu : membreId null
    // pour une action initiée hors de l'institution elle-même.
    if (current.institution_id) {
      await enregistrerAction({
        institutionId: current.institution_id, membreId: null,
        membreNom: 'Modération Yelen',
        action: 'offre_approuvee', cibleTable: 'offres', cibleId: id,
        details: { titre: current.titre },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
