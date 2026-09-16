import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Visibilité admin du chantier Auth Security (28/08/2026, Lot 7) — état
// courant des scopes device/IP non "normal" (warning/blocked/support_only)
// + journal d'événements récent, pour identifier un blocage et son
// contexte (brief : "le support doit pouvoir identifier le blocage et son
// contexte depuis l'administration"). super_admin seul, voir
// lib/adminAuth.ts.
export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'auth_security.read')

    // Colonnes étendues (refonte opérationnelle Protection Auth, décision
    // CEO 03/09/2026) — first_seen_at/attempts_in_window/window_started_at
    // existent depuis la migration d'origine (20260828000004) mais
    // n'étaient jamais remontées à l'admin ; ce sont les seules données
    // réelles disponibles pour répondre à "combien de tentatives ?"/"depuis
    // quand cet appareil est-il vu ?" dans le dossier détaillé d'une
    // protection.
    const COLONNES_SCOPE = 'device_id, ip_last, state, state_changed_at, blocked_until, block_cycles_24h, last_seen_at, blocked_reason, first_seen_at, attempts_in_window, window_started_at'
    const COLONNES_SCOPE_IP = 'ip, state, state_changed_at, blocked_until, block_cycles_24h, last_seen_at, blocked_reason, first_seen_at, attempts_in_window, window_started_at'

    const [devicesRes, ipsRes, adminDevicesRes, adminIpsRes, eventsRes] = await Promise.all([
      supabaseAdmin
        .from('auth_device_security')
        .select(COLONNES_SCOPE)
        .neq('state', 'normal')
        .order('state_changed_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('auth_ip_security')
        .select(COLONNES_SCOPE_IP)
        .neq('state', 'normal')
        .order('state_changed_at', { ascending: false })
        .limit(50),
      // Isolation Admin (correctif ciblé 30/08/2026, migration
      // 20260830000009) — tables dédiées, jamais mêlées aux compteurs
      // citoyen/institution ci-dessus. Chemin de récupération contrôlé :
      // un admin bloqué sur SON appareil peut être débloqué depuis un
      // autre appareil/session admin encore valide, via ce panneau.
      supabaseAdmin
        .from('auth_admin_device_security')
        .select(COLONNES_SCOPE)
        .neq('state', 'normal')
        .order('state_changed_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('auth_admin_ip_security')
        .select(COLONNES_SCOPE_IP)
        .neq('state', 'normal')
        .order('state_changed_at', { ascending: false })
        .limit(50),
      // 'admin_maintain' ajouté (même refonte) — une décision "maintenir"
      // doit apparaître dans l'historique des décisions au même titre
      // qu'un déblocage. admin_users(nom) : affichage du "Qui" sans round-trip
      // supplémentaire côté client.
      supabaseAdmin
        .from('auth_security_events')
        .select('id, created_at, endpoint_category, event_type, outcome, resulting_state, device_id, ip, identifiant, reason, admin_id, admin_users(nom)')
        .or('resulting_state.eq.blocked,resulting_state.eq.support_only,event_type.eq.admin_unblock,event_type.eq.admin_maintain')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (devicesRes.error) throw devicesRes.error
    if (ipsRes.error) throw ipsRes.error
    if (adminDevicesRes.error) throw adminDevicesRes.error
    if (adminIpsRes.error) throw adminIpsRes.error
    if (eventsRes.error) throw eventsRes.error

    return NextResponse.json({
      devices: devicesRes.data || [],
      ips: ipsRes.data || [],
      adminDevices: adminDevicesRes.data || [],
      adminIps: adminIpsRes.data || [],
      events: eventsRes.data || [],
    })

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
