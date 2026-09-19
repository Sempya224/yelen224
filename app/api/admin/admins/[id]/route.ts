import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, verifyRecentReauth, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Whitelist stricte — jamais email/password_hash via cet endpoint
// générique (mass-assignment corrigé le 19/07/2026 : .update(body) brut
// permettait auparavant d'injecter n'importe quelle colonne).
const CHAMPS_MODIFIABLES = ['nom', 'prenom', 'role', 'is_active'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin: Awaited<ReturnType<typeof authorizeAdmin>>
  try {
    admin = await authorizeAdmin(request, 'admins.manage')
    // Réauthentification récente obligatoire (Mission Hardening Admin,
    // point 5, 30/08/2026) — cet endpoint modifie notamment `role`,
    // exactement "modifier les permissions d'un autre administrateur".
    await verifyRecentReauth(admin)
  } catch (e) {
    return adminAuthErrorResponse(e)
  }

  try {
    const { id } = await params
    const body = await request.json()

    const updates: Record<string, unknown> = {}
    for (const champ of CHAMPS_MODIFIABLES) {
      if (champ in body) updates[champ] = body[champ]
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ modifiable fourni' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('admin_users')
      .update(updates)
      .eq('id', id)

    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'MODIFIER_ADMIN',
      cible_table: 'admin_users',
      cible_id: id,
      details: updates,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'admins.manage')
    // Réauthentification récente obligatoire (Mission Hardening Admin,
    // point 5, 30/08/2026) — "supprimer un compte" est explicitement listé
    // dans le brief.
    await verifyRecentReauth(admin)
    const { id } = await params

    // Ne pas supprimer son propre compte
    if (id === admin.adminId) {
      return NextResponse.json({ error: 'Impossible de supprimer votre propre compte' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('admin_users').delete().eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'SUPPRIMER_ADMIN',
      cible_table: 'admin_users',
      cible_id: id,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
