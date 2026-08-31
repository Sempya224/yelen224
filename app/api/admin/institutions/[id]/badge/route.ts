import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerNotification, salutation } from '@/lib/notificationEngine'
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
    const body = await request.json()

    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ badge_verifie: body.badge_verifie })
      .eq('id', id)

    if (error) throw error

    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('name')
      .eq('id', id)
      .single()

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: body.badge_verifie ? 'BADGE_ACCORDE' : 'BADGE_RETIRE',
      cible_table: 'institutions',
      cible_id: id,
    })

    await envoyerNotification({
      destinataireId: id,
      destinataireType: 'institution',
      rdvId: null,
      type: body.badge_verifie ? 'institution_badge_accorde' : 'institution_badge_retire',
      titre: salutation(inst?.name || 'votre équipe'),
      message: body.badge_verifie
        ? 'Le badge vérifié a été accordé à votre établissement.'
        : 'Le badge vérifié a été retiré de votre établissement.',
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
