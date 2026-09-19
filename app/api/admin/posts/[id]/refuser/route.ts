import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(request, 'posts.moderate')
    const { id } = await params
    const body = await request.json().catch(() => null)
    const motif = body?.motif
    if (!motif || typeof motif !== 'string' || !motif.trim()) {
      return NextResponse.json({ error: 'Un motif est requis' }, { status: 400 })
    }

    const { data: current } = await supabaseAdmin.from('posts').select('statut').eq('id', id).maybeSingle()
    if (!current) return NextResponse.json({ error: 'Publication introuvable' }, { status: 404 })
    if (current.statut !== 'en_attente_validation') {
      return NextResponse.json({ error: 'Seule une publication en attente de validation peut être refusée' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('posts')
      .update({ statut: 'refusee', motif_refus: motif })
      .eq('id', id)
    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'REFUSER_POST',
      cible_table: 'posts',
      cible_id: id,
      details: { motif },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
