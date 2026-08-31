import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeAdmin, adminAuthErrorResponse } from '@/lib/adminAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, 'signalements.moderate')

    const { searchParams } = new URL(request.url)
    // 'nouveau' n'est pas une valeur réelle de l'enum statut_signalement
    // (ouvert, en_cours, resolu, ignore) — dérive du fait qu'aucun insert
    // réel n'utilise jamais 'ouvert', seul 'en_cours' est utilisé en
    // pratique (citoyen, alerte système réputation).
    const statut = searchParams.get('statut') || 'en_cours'
    const limit = parseInt(searchParams.get('limit') || '20')
    const page = parseInt(searchParams.get('page') || '0')

    // `signalements` sert aussi au case management institution/citoyen
    // (Lot 1, 08/08/2026) — colonnes différentes (motif, type_signaleur,
    // rdv_id...), lifecycle différent (voir app/api/admin/signalements-cas/).
    // Ces lignes ont toujours type_signaleur renseigné ('institution' ou
    // 'citoyen'), jamais les signalements Communauté de cet écran — filtre
    // corrigé le 15/08/2026 après audit : sans lui, "Marquer résolu"/
    // "Ignorer" pouvaient corrompre un dossier institution/citoyen en
    // contournant son graphe de transition (bypassTransitionCheck).
    let query = supabaseAdmin
      .from('signalements')
      .select('id, type, description, statut, created_at, priorite, cible_type, cible_id, auteur_id')
      .is('type_signaleur', null)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (statut !== 'tous') query = query.eq('statut', statut)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data || [])

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}