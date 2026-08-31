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

    // Chantier Taxonomie des activités (Phase 4, 20/08/2026, spec §3ter.1,
    // "règle non négociable") — extension du gate existant, pas un nouveau
    // mécanisme de statut : une organisation étrangère ne peut jamais être
    // publiée avant qu'une décision verification_decisions favorable
    // ('accordee') existe sur l'axe 'identite'. Institutions guinéennes :
    // ce fichier reste inchangé, zéro régression sur le flux actuel.
    const { data: instOrigine } = await supabaseAdmin
      .from('institutions')
      .select('origine_type')
      .eq('id', id)
      .maybeSingle()

    if (instOrigine?.origine_type === 'etrangere') {
      const { data: derniereDecisionIdentite } = await supabaseAdmin
        .from('verification_decisions')
        .select('type_decision')
        .eq('institution_id', id)
        .eq('axe', 'identite')
        .order('decide_le', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (derniereDecisionIdentite?.type_decision !== 'accordee') {
        return NextResponse.json(
          { error: "Organisation étrangère : l'axe Identité (identité internationale) doit être vérifié et accordé avant toute publication. Voir le dossier de vérification." },
          { status: 400 }
        )
      }
    }

    const { error } = await supabaseAdmin
      .from('institutions')
      .update({ statut: 'validee' })
      .eq('id', id)

    if (error) throw error

    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('name')
      .eq('id', id)
      .single()

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'VALIDER_INSTITUTION',
      cible_table: 'institutions',
      cible_id: id,
      details: { name: inst?.name },
    })

    await envoyerNotification({
      destinataireId: id,
      destinataireType: 'institution',
      rdvId: null,
      type: 'institution_validee',
      titre: salutation(inst?.name || 'votre équipe'),
      message: "Votre établissement a été validé par l'équipe Yelen224. Vous êtes désormais visible par les citoyens et pouvez recevoir des rendez-vous.",
    })

    return NextResponse.json({ success: true })

  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}