import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin', audience: 'yelen224-admin-dashboard',
  })
  if (payload.role !== 'super_admin') throw new Error('FORBIDDEN')
  return payload
}

// Whitelist stricte — jamais email/password_hash via cet endpoint
// générique (mass-assignment corrigé le 19/07/2026 : .update(body) brut
// permettait auparavant d'injecter n'importe quelle colonne).
const CHAMPS_MODIFIABLES = ['nom', 'prenom', 'role', 'is_active'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin: Awaited<ReturnType<typeof verifyAdmin>>
  try {
    admin = await verifyAdmin(request)
  } catch (e) {
    const code = e instanceof Error && e.message === 'NO_TOKEN' ? 401 : 403
    return NextResponse.json({ error: 'Non autorisé' }, { status: code })
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
    const admin = await verifyAdmin(request)
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
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
