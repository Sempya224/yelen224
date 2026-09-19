import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedMembre } from '@/lib/institutionAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Liste des passkeys DU MEMBRE CONNECTÉ uniquement (jamais celles d'un
// collègue ni celles, institution-wide, du compte principal — voir
// membre_id sur institution_webauthn_credentials, migration 16/09/2026).
export async function GET(request: NextRequest) {
  const membre = await getAuthenticatedMembre(request)
  if (!membre) return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('institution_webauthn_credentials')
    .select('id, device_label, created_at, last_used_at')
    .eq('membre_id', membre.membreId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ credentials: data ?? [] })
}
