import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'annonces.moderate')
    const { id } = await params
    const body = await request.json()

    const { error } = await supabaseAdmin
      .from('annonces')
      .update(body)
      .eq('id', id)

    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'MODIFIER_ANNONCE',
      cible_table: 'annonces',
      cible_id: id,
      details: body,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'annonces.moderate')
    const { id } = await params

    const { error } = await supabaseAdmin.from('annonces').delete().eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'SUPPRIMER_ANNONCE',
      cible_table: 'annonces',
      cible_id: id,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
