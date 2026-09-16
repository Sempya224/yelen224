import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedInstitutionId } from '@/lib/institutionAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Révoque UN appareil mémorisé ciblé par id — distinct de remember/forget (pré-auth,
// ne peut agir que sur le cookie du navigateur courant). Ici l'institution est déjà
// authentifiée et peut cibler n'importe lequel de ses propres appareils mémorisés.
export async function POST(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { tokenId } = body

    if (!tokenId || typeof tokenId !== 'string') {
      return NextResponse.json({ error: "Identifiant de l'appareil manquant.", code: 'MISSING_FIELDS' }, { status: 400 })
    }

    // Trusted Device (30/08/2026) — status='revoked' plutôt qu'un DELETE :
    // conserve l'historique de l'appareil (liste "Vos appareils"). Même
    // limite assumée que côté citoyen (voir securite/remember/revoke
    // citoyen) : ceci invalide la confiance/le raccourci pour les
    // prochaines connexions, pas une session déjà ouverte sur cet
    // appareil précis — institution n'a pas de table de session par
    // appareil (contrairement à admin_sessions côté admin).
    const { data: revoked, error: updateError } = await supabaseAdmin
      .from('institution_remember_tokens')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', tokenId)
      .eq('institution_id', institutionId)
      .select('id')

    if (updateError) {
      console.error('[INSTITUTION REMEMBER REVOKE ERROR]', updateError.code, updateError.message)
      return NextResponse.json({ error: "Cet appareil n'a pas pu être déconnecté. Réessayez.", code: 'DELETE_ERROR' }, { status: 500 })
    }
    if (!revoked || revoked.length === 0) {
      return NextResponse.json({ error: 'Cet appareil est introuvable — il a peut-être déjà été déconnecté.', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION REMEMBER REVOKE ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
