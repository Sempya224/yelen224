import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const rawToken = request.cookies.get('yelen224_institution_remember')?.value
    if (!rawToken) {
      return NextResponse.json({ error: 'Aucun appareil mémorisé', code: 'NO_REMEMBER_TOKEN' }, { status: 401 })
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const { data: remembered } = await supabaseAdmin
      .from('institution_remember_tokens')
      .select('id, institution_id, status, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    // Trusted Device (30/08/2026) — un appareil 'revoked' ne doit plus
    // jamais proposer le déverrouillage rapide (voir remember/check
    // citoyen pour le même raisonnement).
    if (!remembered || remembered.status === 'revoked' || new Date(remembered.expires_at).getTime() < Date.now()) {
      const response = NextResponse.json({ error: 'Appareil non reconnu ou expiré', code: 'INVALID_OR_EXPIRED' }, { status: 401 })
      response.cookies.delete('yelen224_institution_remember')
      return response
    }

    void supabaseAdmin.from('institution_remember_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', remembered.id)

    const { data: institution } = await supabaseAdmin
      .from('institutions')
      .select('id, name')
      .eq('id', remembered.institution_id)
      .single()

    if (!institution) {
      const response = NextResponse.json({ error: 'Institution introuvable', code: 'NOT_FOUND' }, { status: 404 })
      response.cookies.delete('yelen224_institution_remember')
      return response
    }

    // Ce token identifie seulement l'institution — il ne délivre AUCUNE
    // session. Il sert uniquement à savoir quel écran de déverrouillage
    // rapide (biométrie/PIN) afficher ensuite ; la preuve d'identité réelle
    // reste webauthn/auth-verify ou pin/verify.
    return NextResponse.json({ success: true, institution: { id: institution.id, name: institution.name } })

  } catch (error) {
    console.error('[INSTITUTION REMEMBER CHECK ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Méthode non autorisée' }, { status: 405 })
}
