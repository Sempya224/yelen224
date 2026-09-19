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

    if (!['gratuit', 'premium'].includes(body.plan)) {
      return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ plan: body.plan })
      .eq('id', id)

    if (error) throw error

    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('name')
      .eq('id', id)
      .single()

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'CHANGER_PLAN',
      cible_table: 'institutions',
      cible_id: id,
      details: { nouveau_plan: body.plan },
    })

    await envoyerNotification({
      destinataireId: id,
      destinataireType: 'institution',
      rdvId: null,
      type: 'institution_plan_modifie',
      titre: salutation(inst?.name || 'votre équipe'),
      message: `Votre abonnement est passé au plan ${body.plan === 'premium' ? 'Premium' : 'Gratuit'}.`,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
