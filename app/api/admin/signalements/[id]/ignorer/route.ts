import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from '@/lib/adminAuth'
import { changerStatut } from '@/lib/signalements'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Signalements — Lot 1 (case management, 08/08/2026). 'ignore' n'existe
// plus dans le nouveau lifecycle (voir migration
// 20260808000004_signalements_lifecycle_core.sql, backfill 'ignore' →
// 'rejete') — 'rejete' en est l'équivalent sémantique (cas non-actionnable,
// écarté). Passe par changerStatut() au lieu d'un update brut pour générer
// un événement d'audit (acteur_type:'admin_yelen').
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await authorizeAdmin(request, 'signalements.moderate')
    const { id } = await params

    // Garde-fou (15/08/2026) : voir le même garde-fou dans resoudre/route.ts.
    const { data: cible } = await supabaseAdmin.from('signalements').select('type_signaleur').eq('id', id).maybeSingle()
    if (cible?.type_signaleur) return NextResponse.json({ error: 'Ce dossier doit être traité depuis l’onglet "Cas institution ↔ citoyen".' }, { status: 400 })

    const resultat = await changerStatut({
      signalementId: id,
      nouveauStatut: 'rejete',
      acteur: { type: 'admin_yelen', id: admin.adminId as string, nom: admin.nom },
      bypassTransitionCheck: true,
      req: request,
    })
    if (!resultat.ok) return NextResponse.json({ error: resultat.error }, { status: 400 })

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: admin.adminId as string,
      action: 'IGNORER_SIGNALEMENT',
      cible_table: 'signalements',
      cible_id: id,
    })

    return NextResponse.json({ success: true })

  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
