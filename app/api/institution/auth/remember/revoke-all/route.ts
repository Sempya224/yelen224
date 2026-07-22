import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import crypto from 'crypto'

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

// "Déconnecter tous les autres appareils" — exclut volontairement l'appareil courant
// (identifié par le cookie yelen224_institution_remember du navigateur qui fait l'appel),
// sinon l'action se couperait elle-même de son propre accès rapide immédiatement après.
export async function POST(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const currentRememberToken = request.cookies.get('yelen224_institution_remember')?.value
    const currentTokenHash = currentRememberToken
      ? crypto.createHash('sha256').update(currentRememberToken).digest('hex')
      : null

    let query = supabaseAdmin
      .from('institution_remember_tokens')
      .delete()
      .eq('institution_id', institutionId)

    if (currentTokenHash) {
      query = query.neq('token_hash', currentTokenHash)
    }

    const { error: deleteError } = await query

    if (deleteError) {
      console.error('[INSTITUTION REMEMBER REVOKE ALL ERROR]', deleteError.code, deleteError.message)
      return NextResponse.json({ error: 'Erreur lors de la révocation', code: 'DELETE_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION REMEMBER REVOKE ALL ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
