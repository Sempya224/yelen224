import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'
import { resoudreSignalement } from '@/lib/signalements'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Signalements — Lot 1 (case management, 08/08/2026). Implémentation
// interne réécrite pour passer par resoudreSignalement() (lib/
// signalements.ts) au lieu d'un update brut, afin que cette action admin
// génère aussi un événement d'audit (acteur_type:'admin_yelen') — sinon le
// journal aurait un trou pour tout cas traité par un admin Yelen plutôt
// qu'un membre institution. L'écran admin n'est pas redessiné dans ce
// lot : aucun formulaire de résolution structurée n'existe encore ici,
// donc une résolution système par défaut est utilisée pour satisfaire le
// CHECK de complétude (statut='resolu' exige resolution_action +
// resolution_explication) — limitation assumée, à remplacer si/quand
// l'écran admin est refondu.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await authorizeAdmin(request, 'signalements.moderate')
    const { id } = await params

    // Garde-fou (15/08/2026) : cette route "résolution rapide" n'a de sens
    // que pour un signalement Communauté (type_signaleur IS NULL) — un
    // dossier institution/citoyen doit passer par la vraie fiche
    // d'arbitrage (/api/admin/signalements-cas/[id]/actions), qui exige un
    // resolution_action/explication réels au lieu du texte générique
    // ci-dessous.
    const { data: cible } = await supabaseAdmin.from('signalements').select('type_signaleur').eq('id', id).maybeSingle()
    if (cible?.type_signaleur) return NextResponse.json({ error: 'Ce dossier doit être traité depuis l’onglet "Cas institution ↔ citoyen".' }, { status: 400 })

    const resultat = await resoudreSignalement({
      signalementId: id,
      resolutionAction: 'autre',
      resolutionExplication: 'Résolu depuis la modération admin Yelen (résolution rapide, sans formulaire dédié).',
      parMembre: { id: admin.adminId as string, nom: admin.nom, isAdminYelen: true },
      req: request,
    })
    if (!resultat.ok) return NextResponse.json({ error: resultat.error }, { status: 400 })

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'RESOUDRE_SIGNALEMENT',
      cible_table: 'signalements',
      cible_id: id,
    })

    return NextResponse.json({ success: true })

  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
