import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

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

// Supprime le PIN — redemande le PIN actuel avant d'agir (défense en profondeur : la
// session de 8h prouve déjà l'identité, mais un poste déverrouillé volé ne devrait pas
// suffire à désactiver un verrou de sécurité sans re-saisie), même logique que pin/verify.
export async function DELETE(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { pin } = body

    if (!pin || typeof pin !== 'string') {
      return NextResponse.json({ error: 'Code PIN actuel requis', code: 'MISSING_PIN' }, { status: 400 })
    }

    const { data: institution } = await supabaseAdmin
      .from('institutions')
      .select('pin_hash')
      .eq('id', institutionId)
      .single()

    if (!institution?.pin_hash) {
      return NextResponse.json({ error: 'Aucun code configuré', code: 'NOT_CONFIGURED' }, { status: 404 })
    }

    const valid = await bcrypt.compare(pin, institution.pin_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Code incorrect', code: 'INVALID_PIN' }, { status: 401 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('institutions')
      .update({ pin_hash: null })
      .eq('id', institutionId)

    if (updateError) {
      console.error('[INSTITUTION PIN DELETE ERROR]', updateError.code, updateError.message)
      return NextResponse.json({ error: 'Erreur lors de la suppression', code: 'UPDATE_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION PIN DELETE ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
