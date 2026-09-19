import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { getAuthenticatedInstitutionId, getInstitutionSessionSid, revoquerAutresSessionsInstitution } from '@/lib/institutionAuth'
import { isWeakPin, PIN_TROP_SIMPLE_MESSAGE } from '@/lib/pinSecurity'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PIN_REGEX = /^\d{4,8}$/

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
        { error: PIN_TROP_SIMPLE_MESSAGE, code: 'WEAK_PIN' },
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
      return NextResponse.json({ error: "Le code PIN n'a pas pu être enregistré. Réessayez.", code: 'UPDATE_ERROR' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Votre compte est introuvable. Reconnectez-vous et réessayez.', code: 'NOT_FOUND' }, { status: 404 })
    }

    // institution_sessions — invalide les autres sessions actives (pas
    // celle-ci, voir lib/institutionAuth.ts::revoquerAutresSessionsInstitution :
    // révoquer aussi l'appelant cassait "Configurer l'accès rapide" juste
    // après un premier login, qui enchaîne cet appel puis redirige vers le
    // dashboard avec ce même cookie — bug réel corrigé le 08/09/2026).
    const currentSid = await getInstitutionSessionSid(request)
    await revoquerAutresSessionsInstitution(supabaseAdmin, institutionId, currentSid, 'pin_change')

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[INSTITUTION PIN SET ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
