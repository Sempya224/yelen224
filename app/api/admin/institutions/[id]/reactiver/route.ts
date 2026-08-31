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
    const admin = await authorizeAdmin(request, 'institutions.manage')
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ statut: 'validee' })
      .eq('id', id)

    if (error) throw error

    // Clôture la suspension active correspondante (décision CEO 17/08/2026,
    // voir migration 20260817000001) — si aucune ligne active n'existe
    // (institution suspendue avant ce chantier, jamais tracée dans
    // institution_suspensions), ce update ne touche simplement aucune ligne.
    await supabaseAdmin
      .from('institution_suspensions')
      .update({ statut: 'levee', levee_par: 'admin', levee_admin_id: admin.adminId as string, levee_le: new Date().toISOString() })
      .eq('institution_id', id)
      .eq('statut', 'active')

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'REACTIVER_INSTITUTION',
      cible_table: 'institutions',
      cible_id: id,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
