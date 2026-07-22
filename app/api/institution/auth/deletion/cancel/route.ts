import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedMembre } from '@/lib/institutionAuth'
import { can } from '@/lib/institutionPermissions'
import { enregistrerAction, getMembreNomPourJournal } from '@/lib/journalActivite'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(request)
    if (!membre) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }
    if (!can(membre.role, 'compte.delete_request')) {
      await enregistrerAction({
        institutionId: membre.institutionId, membreId: membre.membreId,
        membreNom: await getMembreNomPourJournal(membre.membreId),
        action: 'suppression_compte_acces_refuse', cibleTable: 'institution_deletion_requests',
        details: { role: membre.role, methode: 'cancel' },
        req: request,
      })
      return NextResponse.json({ error: 'Accès réservé aux administrateurs', code: 'FORBIDDEN' }, { status: 403 })
    }
    const institutionId = membre.institutionId

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('institution_deletion_requests')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('institution_id', institutionId)
      .is('cancelled_at', null)
      .is('purged_at', null)
      .select('id')

    if (updateError) {
      console.error('[INSTITUTION DELETION CANCEL ERROR]', updateError.code, updateError.message)
      return NextResponse.json({ error: "Erreur lors de l'annulation", code: 'UPDATE_ERROR' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Aucune demande de suppression en cours', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION DELETION CANCEL ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
