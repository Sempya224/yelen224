import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Avant cette route, "Se déconnecter" faisait un simple router.push côté client — le
// cookie httpOnly yelen224_institution_session restait valide 8h de plus, et le token
// "se souvenir de moi" restait actif en base. On révoque explicitement les deux ici,
// même logique que remember/forget pour le token DB.
export async function POST(request: NextRequest) {
  try {
    const rememberToken = request.cookies.get('yelen224_institution_remember')?.value
    if (rememberToken) {
      const tokenHash = crypto.createHash('sha256').update(rememberToken).digest('hex')
      await supabaseAdmin.from('institution_remember_tokens').delete().eq('token_hash', tokenHash)
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete('yelen224_institution_session')
    response.cookies.delete('yelen224_institution_remember')
    return response

  } catch (error) {
    console.error('[INSTITUTION LOGOUT ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
