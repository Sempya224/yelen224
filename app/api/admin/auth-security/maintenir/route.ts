import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Refonte opérationnelle Protection Auth (décision CEO 03/09/2026) — jusqu'ici
// seul le déblocage produisait une trace ; un agent qui examinait un dossier
// et choisissait de NE RIEN changer ne laissait aucune preuve d'avoir été
// revu. Symétrique de .../unblock/route.ts mais n'écrit jamais dans
// auth_device_security/auth_ip_security/auth_admin_device_security/
// auth_admin_ip_security — la protection reste exactement telle quelle,
// seul un événement d'audit 'admin_maintain' est ajouté (voir migration
// 20260903000002_auth_security_admin_maintain.sql).
export async function POST(request: NextRequest) {
  try {
    const session = await authorizeAdmin(request, 'auth_security.manage')

    const body = await request.json().catch(() => null)
    const scope = body?.scope
    const value = body?.value
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    const SCOPES = ['device', 'ip', 'admin_device', 'admin_ip'] as const
    if (!SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'scope invalide (device, ip, admin_device ou admin_ip attendu)', code: 'INVALID_SCOPE' }, { status: 400 })
    }
    if (typeof value !== 'string' || !value.trim()) {
      return NextResponse.json({ error: 'value requise', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    const colonne = scope === 'ip' || scope === 'admin_ip' ? 'ip' : 'device_id'
    const TABLES: Record<string, string> = {
      device: 'auth_device_security', ip: 'auth_ip_security',
      admin_device: 'auth_admin_device_security', admin_ip: 'auth_admin_ip_security',
    }
    // resulting_state = état actuel relu juste avant l'écriture — "maintenir"
    // ne le modifie jamais, seule la trace de ce qu'il était au moment de la
    // décision est utile (brief : "état avant/après").
    const { data: etatActuel } = await supabaseAdmin.from(TABLES[scope]).select('state').eq(colonne, value).maybeSingle()

    await supabaseAdmin.from('auth_security_events').insert({
      event_type: 'admin_maintain',
      resulting_state: etatActuel?.state ?? null,
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
