import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdminSession } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    try {
      const session = await verifyAdminSession(request)

      // admin_sessions (Mission Hardening Admin, point 7, 30/08/2026) —
      // révoque UNIQUEMENT la session courante (par sid), jamais les
      // autres appareils du même compte : un logout normal n'a jamais eu
      // vocation à déconnecter ailleurs, contrairement à change-password/
      // 2fa-disable. Possible maintenant que chaque session a sa propre
      // ligne — avant (GAP-04-04), un seul timestamp par compte rendait
      // cette distinction impossible.
      await supabaseAdmin
        .from('admin_sessions')
        .update({ revoked_at: new Date().toISOString(), revoked_reason: 'logout' })
        .eq('id', session.sid)

      // Log de déconnexion
      await supabaseAdmin.from('admin_logs').insert({
        admin_id: session.adminId,
        action: 'LOGOUT',
        details: { timestamp: new Date().toISOString() },
      })
    } catch {
      // Pas de session / token invalide → on logout quand même
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete('yelen224_admin_session')
    return response

  } catch {
    const response = NextResponse.json({ success: true })
    response.cookies.delete('yelen224_admin_session')
    return response
  }
}