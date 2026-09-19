import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedMembre, estReauthRecente } from '@/lib/institutionAuth'

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
    // Moteur de réauthentification (16/09/2026) — désactiver une protection
    // de sécurité sans preuve d'identité fraîche exposerait le compte à un
    // attaquant ayant simplement volé la session (cookie).
    if (!estReauthRecente(membre)) {
      return NextResponse.json({ error: "Pour votre sécurité, confirmez à nouveau votre identité pour continuer.", code: 'REAUTH_REQUIRED' }, { status: 403 })
    }
    const institutionId = membre.institutionId

    const body = await request.json().catch(() => ({}))
    const { credentialId } = body

    if (!credentialId || typeof credentialId !== 'string') {
      return NextResponse.json({ error: "Identifiant de la clé d'accès manquant.", code: 'MISSING_FIELDS' }, { status: 400 })
    }

    // Passkeys par membre (16/09/2026) — un membre ne peut retirer QUE SA
    // PROPRE clé (membre_id = lui-même). Les credentials legacy du compte
    // principal (membre_id NULL, enregistrées avant cette migration) restent
    // réservées au compte principal — jamais un membre d'équipe quelconque,
    // même admin, ne doit pouvoir supprimer la clé institution-wide d'un
    // autre compte en devinant son id.
    //
    // Deux requêtes explicites plutôt qu'un .or() construit par
    // interpolation de chaîne (revue critique 16/09/2026) — membre.membreId
    // vient toujours d'un JWT vérifié côté serveur donc le risque
    // d'injection était déjà nul, mais cette forme reste plus sûre par
    // construction et n'a pas besoin de cette garantie implicite pour l'être.
    const { data: cible } = await supabaseAdmin.from('institution_membres').select('compte_principal').eq('id', membre.membreId).maybeSingle()

    let deleted: { id: string }[] | null = null
    let deleteError: { code?: string; message: string } | null = null

    const tentativePropre = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .delete()
      .eq('id', credentialId)
      .eq('institution_id', institutionId)
      .eq('membre_id', membre.membreId)
      .select('id')
    deleted = tentativePropre.data
    deleteError = tentativePropre.error

    if (!deleteError && (!deleted || deleted.length === 0) && cible?.compte_principal) {
      const tentativeLegacy = await supabaseAdmin
        .from('institution_webauthn_credentials')
        .delete()
        .eq('id', credentialId)
        .eq('institution_id', institutionId)
        .is('membre_id', null)
        .select('id')
      deleted = tentativeLegacy.data
      deleteError = tentativeLegacy.error
    }

    if (deleteError) {
      console.error('[INSTITUTION WEBAUTHN REVOKE ERROR]', deleteError.code, deleteError.message)
      return NextResponse.json({ error: "Cette clé d'accès n'a pas pu être retirée. Réessayez.", code: 'DELETE_ERROR' }, { status: 500 })
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Cette clé d'accès est introuvable — elle a peut-être déjà été retirée.", code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION WEBAUTHN REVOKE ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
