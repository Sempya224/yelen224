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
    await authorizeAdmin(request, 'activity.read')

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '30')

    // Récupérer les dernières activités depuis plusieurs tables en parallèle
    const [rdvRes, usersRes, instRes, sigRes, paiRes] = await Promise.allSettled([
      // Derniers RDV
      supabaseAdmin
        .from('rdv')
        .select('id, created_at, statut, institution_id')
        .order('created_at', { ascending: false })
        .limit(10),

      // Dernières inscriptions citoyens
      supabaseAdmin
        .from('users')
        .select('id, created_at, nom, prenom')
        .order('created_at', { ascending: false })
        .limit(10),

      // Dernières institutions inscrites
      supabaseAdmin
        .from('institutions')
        .select('id, created_at, name, statut')
        .order('created_at', { ascending: false })
        .limit(10),

      // Derniers signalements
      supabaseAdmin
        .from('signalements')
        .select('id, created_at, type, statut')
        .order('created_at', { ascending: false })
        .limit(10),

      // Derniers paiements
      supabaseAdmin
        .from('paiements')
        .select('id, created_at, montant, statut')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    // Construire le journal d'activité unifié
    type ActivityItem = { id: string; type: string; message: string; created_at: string; actor?: string }
    const items: ActivityItem[] = []

    // RDV
    const rdvData = rdvRes.status === 'fulfilled' ? rdvRes.value.data || [] : []
    for (const r of rdvData) {
      items.push({ id: 'rdv_' + r.id, type: 'rdv', message: `Nouveau rendez-vous créé — statut : ${r.statut}`, created_at: r.created_at })
    }

    // Citoyens
    const usersData = usersRes.status === 'fulfilled' ? usersRes.value.data || [] : []
    for (const u of usersData) {
      items.push({ id: 'user_' + u.id, type: 'citoyen', message: `Nouveau citoyen inscrit — ${u.prenom || ''} ${u.nom || ''}`.trim(), created_at: u.created_at })
    }

    // Institutions
    const instData = instRes.status === 'fulfilled' ? instRes.value.data || [] : []
    for (const i of instData) {
      items.push({ id: 'inst_' + i.id, type: 'institution', message: `Institution enregistrée — ${i.name} (${i.statut})`, created_at: i.created_at })
    }

    // Signalements
    const sigData = sigRes.status === 'fulfilled' ? sigRes.value.data || [] : []
    for (const s of sigData) {
      items.push({ id: 'sig_' + s.id, type: 'signalement', message: `Signalement reçu — type : ${s.type || 'non spécifié'}`, created_at: s.created_at })
    }

    // Paiements
    const paiData = paiRes.status === 'fulfilled' ? paiRes.value.data || [] : []
    for (const p of paiData) {
      items.push({ id: 'pai_' + p.id, type: 'paiement', message: `Paiement enregistré — ${(p.montant || 0).toLocaleString('fr-FR')} GNF (${p.statut})`, created_at: p.created_at })
    }

    // Trier par date décroissante et limiter
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json(items.slice(0, limit))

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}