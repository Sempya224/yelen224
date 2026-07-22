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

// Consultée par app/institution/connexion/page.tsx juste après un login réussi, pour
// décider d'afficher l'écran d'annulation à la place du dashboard.
export async function GET(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const { data } = await supabaseAdmin
      .from('institution_deletion_requests')
      .select('motif, requested_at, scheduled_purge_at')
      .eq('institution_id', institutionId)
      .is('cancelled_at', null)
      .is('purged_at', null)
      .maybeSingle()

    if (!data) {
      return NextResponse.json({ success: true, pending: false })
    }

    return NextResponse.json({
      success: true,
      pending: true,
      motif: data.motif,
      requested_at: data.requested_at,
      scheduled_purge_at: data.scheduled_purge_at,
    })

  } catch (error) {
    console.error('[INSTITUTION DELETION STATUS ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
