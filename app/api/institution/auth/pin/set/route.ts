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

const PIN_REGEX = /^\d{4,8}$/

// Codes trop faibles pour servir de verrou réel — rejetés même s'ils
// respectent le format. Répétitions et suites triviales uniquement ;
// on ne prétend pas couvrir tous les cas, juste les plus évidents.
function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true // 0000, 1111, 222222...
  const ascending = pin.split('').every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) + 1)
  const descending = pin.split('').every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) - 1)
  return ascending || descending // 1234, 4321, 123456...
}

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

    const body = await request.json()
    const { pin } = body

    if (!pin || typeof pin !== 'string' || !PIN_REGEX.test(pin)) {
      return NextResponse.json(
        { error: 'Le code doit contenir entre 4 et 8 chiffres.', code: 'INVALID_FORMAT' },
        { status: 400 }
      )
    }
    if (isWeakPin(pin)) {
      return NextResponse.json(
        { error: 'Ce code est trop simple (chiffres répétés ou suite logique). Choisissez-en un autre.', code: 'WEAK_PIN' },
        { status: 400 }
      )
    }

    const pinHash = await bcrypt.hash(pin, 12)

    // .update() ne renvoie pas d'erreur si 0 ligne correspond au filtre —
    // il faut vérifier explicitement via .select() qu'une ligne a bien été
    // modifiée, sinon un institutionId obsolète (session valide mais compte
    // supprimé entre-temps) répondrait "succès" sans avoir rien écrit.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('institutions')
      .update({ pin_hash: pinHash })
      .eq('id', institutionId)
      .select('id')

    if (updateError) {
      console.error('[INSTITUTION PIN SET ERROR]', updateError.code, updateError.message, updateError.details, updateError.hint)
      return NextResponse.json({ error: "Erreur lors de l'enregistrement du code", code: 'UPDATE_ERROR' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Institution introuvable', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION PIN SET ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
