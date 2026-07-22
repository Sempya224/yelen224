import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Utilisé par "Ce n'est pas vous ?" sur l'écran de déverrouillage rapide —
// le cookie est httpOnly (volontairement, contre le vol par XSS), donc le
// client ne peut pas le supprimer lui-même : un aller-retour serveur est
// nécessaire pour révoquer le token en base ET effacer le cookie.
export async function POST(request: NextRequest) {
  try {
    const rawToken = request.cookies.get('yelen224_institution_remember')?.value
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await supabaseAdmin.from('institution_remember_tokens').delete().eq('token_hash', tokenHash)
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete('yelen224_institution_remember')
    return response

  } catch (error) {
    console.error('[INSTITUTION REMEMBER FORGET ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
