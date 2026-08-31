import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getInstitutionSessionSid } from '@/lib/institutionAuth'

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

    // institution_sessions (dette technique comblée 30/08/2026, mirroring
    // admin/auth/logout/route.ts) — révoque UNIQUEMENT la session courante,
    // jamais les autres appareils du même compte (un logout normal n'a
    // jamais eu vocation à déconnecter ailleurs, contrairement à pin/set/
    // totp-disable/deletion-request). Avant ce correctif, le JWT institution
    // restait valide jusqu'à 8h après un logout malgré le cookie effacé, si
    // un attaquant en possédait déjà une copie.
    const sid = await getInstitutionSessionSid(request)
    if (sid) {
      await supabaseAdmin
        .from('institution_sessions')
        .update({ revoked_at: new Date().toISOString(), revoked_reason: 'logout' })
        .eq('id', sid)
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
