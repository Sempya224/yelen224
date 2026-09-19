import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerNotification, salutation } from '@/lib/notificationEngine'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

// Boîte de réception admin des révisions de suspension (décision CEO
// 17/08/2026, "Demander une révision" côté institution). Structure calquée
// sur app/api/admin/recuperation/route.ts (filtre de statut, action PATCH
// accepter/rejeter avec motif obligatoire pour le rejet, miroir exact du
// pattern déjà en place sur suspendre/route.ts).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'institutions.suspension_appeals')

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || 'en_attente'

    let query = supabaseAdmin
      .from('institution_suspension_revisions')
      .select('id, reference, message, statut, created_at, decision_motif, decision_le, institution_id, suspension_id, institutions(name), institution_suspensions(motif, reference, created_at)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (statut !== 'tous') query = query.eq('statut', statut)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}

// action: "accepter" (réactive l'institution, clôture la suspension) |
// "rejeter" (motif obligatoire, institution reste suspendue mais peut
// soumettre une nouvelle révision — celle-ci n'est plus en_attente donc la
// contrainte d'unicité ne bloque plus un nouvel appel).
export async function PATCH(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request, 'institutions.suspension_appeals')

    const body = await request.json().catch(() => null)
    const id = body?.id
    const action = body?.action
    if (typeof id !== 'string') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }

    const { data: revision } = await supabaseAdmin
      .from('institution_suspension_revisions')
      .select('id, suspension_id, institution_id, statut')
      .eq('id', id)
      .maybeSingle()
    if (!revision) return NextResponse.json({ error: 'Révision introuvable' }, { status: 404 })
    if (revision.statut !== 'en_attente') {
      return NextResponse.json({ error: 'Cette révision a déjà été traitée' }, { status: 409 })
    }

    const { data: inst } = await supabaseAdmin.from('institutions').select('name').eq('id', revision.institution_id).single()

    if (action === 'accepter') {
      await supabaseAdmin.from('institutions').update({ statut: 'validee' }).eq('id', revision.institution_id)
      await supabaseAdmin
        .from('institution_suspensions')
        .update({ statut: 'levee', levee_par: 'revision', levee_le: new Date().toISOString() })
        .eq('id', revision.suspension_id)
        .eq('statut', 'active')
      await supabaseAdmin
        .from('institution_suspension_revisions')
        .update({ statut: 'acceptee', traite_par_admin_id: admin.adminId as string, decision_le: new Date().toISOString() })
        .eq('id', id)

      await envoyerNotification({
        destinataireId: revision.institution_id,
        destinataireType: 'institution',
        rdvId: null,
        type: 'revision_suspension_acceptee',
        titre: salutation(inst?.name || 'votre équipe'),
        message: "Votre demande de révision a été acceptée. Votre établissement est de nouveau visible par les citoyens.",
      })
    } else if (action === 'rejeter') {
      const motif = typeof body?.motif === 'string' ? body.motif.trim() : ''
      if (!motif) return NextResponse.json({ error: 'Motif de rejet requis' }, { status: 400 })

      await supabaseAdmin
        .from('institution_suspension_revisions')
        .update({ statut: 'rejetee', traite_par_admin_id: admin.adminId as string, decision_motif: motif, decision_le: new Date().toISOString() })
        .eq('id', id)

      await envoyerNotification({
        destinataireId: revision.institution_id,
        destinataireType: 'institution',
        rdvId: null,
        type: 'revision_suspension_rejetee',
        titre: salutation(inst?.name || 'votre équipe'),
        message: `Votre demande de révision a été examinée et refusée. Motif : « ${motif} ». Votre établissement reste suspendu — vous pouvez soumettre une nouvelle demande de révision si vous disposez d'informations complémentaires.`,
      })
    } else {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: action === 'accepter' ? 'REVISION_SUSPENSION_ACCEPTEE' : 'REVISION_SUSPENSION_REJETEE',
      cible_table: 'institution_suspension_revisions',
      cible_id: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AdminAuthError) return adminAuthErrorResponse(error)
    console.error('[ADMIN SUSPENSION REVISIONS PATCH ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
