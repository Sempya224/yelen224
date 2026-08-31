import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerNotification, salutation } from '@/lib/notificationEngine'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await authorizeAdmin(request, 'institutions.manage')
    const { id } = await params
    const body = await request.json()
    const { motif } = body

    if (!motif?.trim()) {
      return NextResponse.json(
        { error: 'Motif de refus requis' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ statut: 'refusee' })
      .eq('id', id)

    if (error) throw error

    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('name')
      .eq('id', id)
      .single()

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'REFUSER_INSTITUTION',
      cible_table: 'institutions',
      cible_id: id,
      details: { name: inst?.name, motif: motif.trim() },
    })

    await envoyerNotification({
      destinataireId: id,
      destinataireType: 'institution',
      rdvId: null,
      type: 'institution_refusee',
      titre: salutation(inst?.name || 'votre équipe'),
      message: `Votre demande d'inscription a été refusée. Motif : « ${motif.trim()} ». Vous pouvez corriger les éléments concernés et soumettre une nouvelle demande.`,
    })

    return NextResponse.json({ success: true })

  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}