import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enregistrerAction } from '@/lib/journalActivite'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Suspension d'urgence côté admin — une offre publiée peut être retirée
// immédiatement sans attendre que le partenaire agisse lui-même.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'offres.moderate')
    const { id } = await params

    const { data: current } = await supabaseAdmin.from('offres').select('statut, institution_id, titre').eq('id', id).maybeSingle()
    if (!current) return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 })
    if (current.statut !== 'publiee') {
      return NextResponse.json({ error: 'Seule une offre publiée peut être suspendue' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('offres').update({ statut: 'suspendue' }).eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'SUSPENDRE_OFFRE',
      cible_table: 'offres',
      cible_id: id,
    })

    if (current.institution_id) {
      await enregistrerAction({
        institutionId: current.institution_id, membreId: null,
        membreNom: 'Modération Yelen',
        action: 'offre_suspendue_admin', cibleTable: 'offres', cibleId: id,
        details: { titre: current.titre },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
