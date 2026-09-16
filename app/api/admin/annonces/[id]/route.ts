import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Liste blanche stricte — jamais institution_id/id/created_at/
// nb_vues/nb_clics/nb_partages via cet endpoint générique (mass-assignment
// audit sécurité 14/09/2026, même classe que le correctif du 19/07/2026 sur
// admin_users). Champs réellement envoyés par app/admin/annonces/page.tsx :
// form complet (titre/contenu/type/statut/date_expiration/epingle) ou
// toggle épinglage (epingle seul).
const CHAMPS_MODIFIABLES = ['titre', 'contenu', 'type', 'statut', 'date_expiration', 'epingle'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'annonces.moderate')
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
      .from('annonces')
      .update(updates)
      .eq('id', id)

    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'MODIFIER_ANNONCE',
      cible_table: 'annonces',
      cible_id: id,
      details: updates,
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
