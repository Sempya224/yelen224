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
    const body = await request.json().catch(() => ({}))

    // Incrémenter le compteur d'avertissements
    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('avertissements, name')
      .eq('id', id)
      .single()

    const nouveauNb = (inst?.avertissements || 0) + 1
    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ avertissements: nouveauNb })
      .eq('id', id)

    if (error) throw error

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'AVERTIR_INSTITUTION',
      cible_table: 'institutions',
      cible_id: id,
      details: { raison: body.raison || 'Non spécifiée', avertissements_total: nouveauNb },
    })

    await envoyerNotification({
      destinataireId: id,
      destinataireType: 'institution',
      rdvId: null,
      type: 'institution_avertissement',
      titre: salutation(inst?.name || 'votre équipe'),
      message: `Un avertissement a été enregistré sur votre compte (${nouveauNb} au total). Motif : ${body.raison || 'non spécifié'}. Des avertissements répétés peuvent entraîner une suspension.`,
    })

    return NextResponse.json({ ok: true, avertissements: nouveauNb })
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
