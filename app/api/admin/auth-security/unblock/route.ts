import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, verifyRecentReauth } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Déblocage manuel (chantier Auth Security 28/08/2026, Lot 7) — état
// SUPPORT_ONLY, "point de récupération" explicitement demandé par le brief.
// Écrit toujours un événement admin_unblock (jamais un simple UPDATE
// silencieux) — traçabilité de qui a débloqué quoi et pourquoi.
export async function POST(request: NextRequest) {
  try {
    const session = await authorizeAdmin(request, 'auth_security.manage')
    // Réauthentification récente obligatoire (revue critique 30/08/2026,
    // même jour) — corrige une incohérence trouvée entre le docstring de
    // verifyRecentReauth (qui citait déjà "déblocage d'une protection
    // sécurité" comme cas visé) et cette route, qui ne l'appelait pas.
    await verifyRecentReauth(session)

    const body = await request.json().catch(() => null)
    const scope = body?.scope
    const value = body?.value
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    // admin_device/admin_ip (correctif ciblé 30/08/2026, migration
    // 20260830000009) — chemin de récupération contrôlé pour le throttle
    // Admin désormais isolé : jamais un bypass d'authentification (le mot
    // de passe + MFA restent requis pour se reconnecter ensuite), juste
    // le déblocage du compteur, comme pour device/ip côté citoyen/institution.
    const SCOPES = ['device', 'ip', 'admin_device', 'admin_ip'] as const
    if (!SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'scope invalide (device, ip, admin_device ou admin_ip attendu)', code: 'INVALID_SCOPE' }, { status: 400 })
    }
    if (typeof value !== 'string' || !value.trim()) {
      return NextResponse.json({ error: 'value requise', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    const TABLES: Record<typeof SCOPES[number], { table: string; colonne: string }> = {
      device: { table: 'auth_device_security', colonne: 'device_id' },
      ip: { table: 'auth_ip_security', colonne: 'ip' },
      admin_device: { table: 'auth_admin_device_security', colonne: 'device_id' },
      admin_ip: { table: 'auth_admin_ip_security', colonne: 'ip' },
    }
    const { table, colonne } = TABLES[scope as typeof SCOPES[number]]
    const nowIso = new Date().toISOString()

    // block_cycles_24h volontairement conservé (pas remis à 0) : la
    // mémoire d'escalade doit survivre à un déblocage support, sinon un
    // appareil débloqué une fois repart avec un blocage "1er cycle" (30
    // min) au lieu de l'escalade attendue en cas de récidive.
    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update({
        state: 'normal',
        blocked_until: null,
        attempts_in_window: 0,
        window_started_at: nowIso,
        state_changed_at: nowIso,
      })
      .eq(colonne, value)

    if (updateError) throw updateError

    await supabaseAdmin.from('auth_security_events').insert({
      event_type: 'admin_unblock',
      device_id: colonne === 'device_id' ? value : null,
      ip: colonne === 'ip' ? value : null,
      admin_id: session.adminId,
      reason: reason ? `[${scope}] ${reason}` : `[${scope}]`,
    })

    return NextResponse.json({ success: true })

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}
