import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!)

async function getAuthenticatedInstitutionId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('yelen224_institution_session')?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'yelen224-institution',
      audience: 'yelen224-institution-dashboard',
    })
    return typeof payload.institutionId === 'string' ? payload.institutionId : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { credentialId } = body

    if (!credentialId || typeof credentialId !== 'string') {
      return NextResponse.json({ error: 'Identifiant manquant', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    // .delete() ne renvoie pas d'erreur si 0 ligne correspond — on vérifie explicitement
    // via .select() qu'une ligne appartenant à CETTE institution a bien été supprimée,
    // sinon une institution pourrait révoquer le credential d'une autre en devinant un id.
    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from('institution_webauthn_credentials')
      .delete()
      .eq('id', credentialId)
      .eq('institution_id', institutionId)
      .select('id')

    if (deleteError) {
      console.error('[INSTITUTION WEBAUTHN REVOKE ERROR]', deleteError.code, deleteError.message)
      return NextResponse.json({ error: 'Erreur lors de la révocation', code: 'DELETE_ERROR' }, { status: 500 })
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Appareil introuvable', code: 'NOT_FOUND' }, { status: 404 })
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
