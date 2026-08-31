import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdminSession, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyAdminSession(request)

    // Revérification en base à chaque appel (chantier "Sécurité" admin,
    // 24/07/2026) — le JWT seul reste valide jusqu'à ses 8h d'expiration
    // même si le compte est désactivé/verrouillé entre-temps ; cette route
    // est déjà appelée à chaque changement de route par app/admin/layout.tsx,
    // donc la couper ici coupe l'accès immédiatement, pas seulement à
    // l'expiration naturelle du token.
    const { data: admin } = await supabaseAdmin
      .from('admin_users')
      .select('is_active, locked_until, totp_enabled, last_login')
      .eq('id', payload.adminId as string)
      .maybeSingle()

    if (!admin || !admin.is_active || (admin.locked_until && new Date(admin.locked_until) > new Date())) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
    }

    return NextResponse.json({
      admin: {
        id: payload.adminId,
        email: payload.email,
        role: payload.role,
        nom: payload.nom,
        totp_enabled: admin.totp_enabled,
        last_login: admin.last_login,
      }
    })

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}