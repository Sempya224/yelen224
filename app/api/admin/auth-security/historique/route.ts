import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Refonte opérationnelle Protection Auth (décision CEO 03/09/2026) — chronologie
// complète d'un scope précis (device/ip), pour le "dossier" détaillé d'une
// protection : la liste principale de /api/admin/auth-security ne renvoie
// que les 50 derniers événements bloqués/débloqués tous scopes confondus,
// insuffisant pour reconstruire l'historique d'UN appareil ou UNE IP en
// particulier. Aucune nouvelle donnée : mêmes tables, requête simplement
// filtrée sur un scope + jointure du nom de l'admin auteur d'une décision.
export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'auth_security.read')

    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope')
    const value = searchParams.get('value')
    const SCOPES = ['device', 'ip', 'admin_device', 'admin_ip']
    if (!scope || !SCOPES.includes(scope) || !value) {
      return NextResponse.json({ error: 'scope et value requis' }, { status: 400 })
    }
    const colonne = scope === 'ip' || scope === 'admin_ip' ? 'ip' : 'device_id'

    const { data, error } = await supabaseAdmin
      .from('auth_security_events')
      .select('id, created_at, event_type, endpoint_category, outcome, resulting_state, device_id, ip, identifiant, reason, admin_id, admin_users(nom)')
      .eq(colonne, value)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    return NextResponse.json({ events: data ?? [] })
  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
