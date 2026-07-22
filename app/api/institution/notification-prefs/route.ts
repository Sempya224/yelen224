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

const CATEGORIES = ['confirmation', 'rappels', 'annulation_report', 'rdv_termine'] as const
type Category = typeof CATEGORIES[number]

type ChannelPrefs = { inapp: boolean; email: boolean; sms: boolean }
type NotificationPrefs = Record<Category, ChannelPrefs>

// Reflète le default de la migration institution_notification_prefs — utilisé quand aucune
// ligne n'existe encore pour l'institution (jamais backfillée à la création du compte).
const DEFAULT_PREFS: NotificationPrefs = {
  confirmation: { inapp: true, email: false, sms: false },
  rappels: { inapp: true, email: false, sms: false },
  annulation_report: { inapp: true, email: false, sms: false },
  rdv_termine: { inapp: true, email: false, sms: false },
}

export async function GET(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const { data } = await supabaseAdmin
      .from('institution_notification_prefs')
      .select('prefs')
      .eq('institution_id', institutionId)
      .maybeSingle()

    return NextResponse.json({ success: true, prefs: (data?.prefs as NotificationPrefs) ?? DEFAULT_PREFS })

  } catch (error) {
    console.error('[INSTITUTION NOTIF PREFS GET ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// email/sms ne sont jamais activables tant qu'aucun provider n'est branché — la route
// ignore silencieusement toute tentative côté client, seul inapp est réellement modifiable.
export async function PATCH(request: NextRequest) {
  try {
    const institutionId = await getAuthenticatedInstitutionId(request)
    if (!institutionId) {
      return NextResponse.json({ error: 'Non authentifié', code: 'NO_SESSION' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { category, inapp } = body as { category?: string; inapp?: boolean }

    if (!category || !CATEGORIES.includes(category as Category) || typeof inapp !== 'boolean') {
      return NextResponse.json({ error: 'Requête invalide', code: 'INVALID_BODY' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('institution_notification_prefs')
      .select('prefs')
      .eq('institution_id', institutionId)
      .maybeSingle()

    const currentPrefs = (existing?.prefs as NotificationPrefs) ?? DEFAULT_PREFS
    const nextPrefs: NotificationPrefs = {
      ...currentPrefs,
      [category as Category]: { inapp, email: false, sms: false },
    }

    const { error: upsertError } = await supabaseAdmin
      .from('institution_notification_prefs')
      .upsert({ institution_id: institutionId, prefs: nextPrefs, updated_at: new Date().toISOString() }, { onConflict: 'institution_id' })

    if (upsertError) {
      console.error('[INSTITUTION NOTIF PREFS PATCH ERROR]', upsertError.code, upsertError.message)
      return NextResponse.json({ error: "Erreur lors de l'enregistrement", code: 'UPSERT_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ success: true, prefs: nextPrefs })

  } catch (error) {
    console.error('[INSTITUTION NOTIF PREFS PATCH ERROR]', error)
    return NextResponse.json({ error: 'Erreur serveur', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
