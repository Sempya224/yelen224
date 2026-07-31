import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function verifyAdminToken(request: NextRequest) {
  const token = request.cookies.get('yelen224_admin_session')?.value
  if (!token) throw new Error('NO_TOKEN')
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: 'yelen224-admin',
    audience: 'yelen224-admin-dashboard',
  })
  return payload
}

// Centre de notifications admin — chantier refonte admin 26/07/2026, Lot B.
// Agrégat live des 8 files d'attente réelles (aucune ligne persistée par
// événement, le compteur EST l'état "à traiter" : il descend dès que
// l'admin agit sur l'élément sous-jacent). Même idiome que
// app/api/admin/kpis/route.ts (Promise.allSettled + count exact head).
export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request)

    const settled = await Promise.allSettled([
      supabaseAdmin.from('institutions').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      supabaseAdmin.from('signalements').select('id', { count: 'exact', head: true }).eq('statut', 'en_cours'),
      supabaseAdmin.from('paiements').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      supabaseAdmin.from('institution_partenariat_demandes').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      supabaseAdmin.from('offres').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente_validation'),
      supabaseAdmin.from('citoyen_demandes_recuperation').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      supabaseAdmin.from('institution_deletion_requests').select('id', { count: 'exact', head: true }).is('cancelled_at', null).is('purged_at', null),
      supabaseAdmin.from('feedback').select('id', { count: 'exact', head: true }).eq('statut', 'nouveau'),
      supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente_validation'),
    ])

    function getCount(r: (typeof settled)[number]): number {
      return r.status === 'fulfilled' ? (r.value as { count: number | null }).count || 0 : 0
    }

    const categories = [
      { key: 'institutions',  label: 'Institutions en attente',   count: getCount(settled[0]), href: '/admin/institutions' },
      { key: 'signalements',  label: 'Signalements ouverts',      count: getCount(settled[1]), href: '/admin/moderation' },
      { key: 'paiements',     label: 'Paiements en attente',      count: getCount(settled[2]), href: '/admin/paiements' },
      { key: 'partenariats',  label: 'Demandes de partenariat',   count: getCount(settled[3]), href: '/admin/partenariats' },
      { key: 'offres',        label: 'Offres à valider',          count: getCount(settled[4]), href: '/admin/offres' },
      { key: 'recuperation',  label: 'Récupérations de compte',   count: getCount(settled[5]), href: '/admin/recuperation-comptes' },
      // Aucune page dédiée n'existe encore pour cette file — lien le plus
      // proche en attendant un écran dédié (hors périmètre de ce chantier).
      { key: 'suppressions',  label: 'Suppressions de compte',    count: getCount(settled[6]), href: '/admin/institutions' },
      { key: 'feedback',      label: 'Nouveau feedback',          count: getCount(settled[7]), href: '/admin/feedback' },
      { key: 'posts',         label: 'Publications à valider',    count: getCount(settled[8]), href: '/admin/posts' },
    ]

    return NextResponse.json({ categories, total: categories.reduce((s, c) => s + c.count, 0) })
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}
