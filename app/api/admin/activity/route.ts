import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

async function verifyToken(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin',
    audience: 'yelen224-admin-dashboard',
  })
  return payload
}

export async function GET(request: NextRequest) {
  try {
    await verifyToken(request)

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '30')

    // Récupérer les dernières activités depuis plusieurs tables en parallèle
    const [rdvRes, usersRes, instRes, sigRes, paiRes] = await Promise.all([
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
        .select('id, created_at, nom, statut')
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
    const items: {
      id: string
      type: string
      message: string
      created_at: string
      actor?: string
    }[] = []

    // RDV
    for (const r of rdvRes.data || []) {
      items.push({
        id: 'rdv_' + r.id,
        type: 'rdv',
        message: `Nouveau rendez-vous créé — statut : ${r.statut}`,
        created_at: r.created_at,
      })
    }

    // Citoyens
    for (const u of usersRes.data || []) {
      items.push({
        id: 'user_' + u.id,
        type: 'citoyen',
        message: `Nouveau citoyen inscrit — ${u.prenom || ''} ${u.nom || ''}`.trim(),
        created_at: u.created_at,
      })
    }

    // Institutions
    for (const i of instRes.data || []) {
      items.push({
        id: 'inst_' + i.id,
        type: 'institution',
        message: `Institution enregistrée — ${i.nom} (${i.statut})`,
        created_at: i.created_at,
      })
    }

    // Signalements
    for (const s of sigRes.data || []) {
      items.push({
        id: 'sig_' + s.id,
        type: 'signalement',
        message: `Signalement reçu — type : ${s.type || 'non spécifié'}`,
        created_at: s.created_at,
      })
    }

    // Paiements
    for (const p of paiRes.data || []) {
      items.push({
        id: 'pai_' + p.id,
        type: 'paiement',
        message: `Paiement enregistré — ${p.montant?.toLocaleString('fr-FR') || 0} GNF (${p.statut})`,
        created_at: p.created_at,
      })
    }

    // Trier par date décroissante et limiter
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json(items.slice(0, limit))

  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}