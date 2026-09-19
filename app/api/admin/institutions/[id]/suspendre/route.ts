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
    const body = await request.json().catch(() => ({}))
    const { motif, dureeJours } = body as { motif?: string; dureeJours?: number }

    if (!motif?.trim()) {
      return NextResponse.json(
        { error: 'Motif de suspension requis' },
        { status: 400 }
      )
    }

    // Durée optionnelle (décision CEO 17/08/2026) — NULL/absente = suspension
    // indéfinie (comportement historique, toujours le défaut). Bornée à 365j,
    // même logique de garde-fou que les autres champs numériques admin.
    let jusquAu: string | null = null
    if (dureeJours !== undefined) {
      if (!Number.isInteger(dureeJours) || dureeJours < 1 || dureeJours > 365) {
        return NextResponse.json({ error: 'Durée invalide (1 à 365 jours)' }, { status: 400 })
      }
      jusquAu = new Date(Date.now() + dureeJours * 24 * 60 * 60 * 1000).toISOString()
    }

    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ statut: 'suspendue' })
      .eq('id', id)

    if (error) throw error

    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('name')
      .eq('id', id)
      .single()

    const { data: suspension, error: suspErr } = await supabaseAdmin
      .from('institution_suspensions')
      .insert({
        institution_id: id,
        motif: motif.trim(),
        duree_jours: dureeJours ?? null,
        jusqu_au: jusquAu,
        admin_id: admin.adminId as string,
      })
      .select('reference')
      .single()
    if (suspErr) throw suspErr

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'SUSPENDRE_INSTITUTION',
      cible_table: 'institutions',
      cible_id: id,
      details: { name: inst?.name, motif: motif.trim(), reference: suspension?.reference, jusqu_au: jusquAu },
    })

    const finTexte = jusquAu
      ? ` jusqu'au ${new Date(jusquAu).toLocaleDateString('fr-FR')}`
      : ' jusqu\'à nouvel ordre'
    await envoyerNotification({
      destinataireId: id,
      destinataireType: 'institution',
      rdvId: null,
      type: 'institution_suspendue',
      titre: salutation(inst?.name || 'votre équipe'),
      message: `Votre établissement a été suspendu par l'équipe Yelen224${finTexte}. Motif : « ${motif.trim()} ». Vous n'êtes plus visible par les citoyens tant que cette suspension n'est pas levée. Référence : ${suspension?.reference ?? 'N/A'}. Contactez le support ou demandez une révision depuis votre espace pour plus d'informations.`,
    })

    return NextResponse.json({ success: true, reference: suspension?.reference })

  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}