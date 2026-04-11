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

export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    // Générer les 30 derniers jours
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      return d
    })

    // Générer les 12 derniers mois
    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date()
      d.setMonth(d.getMonth() - (11 - i))
      return d
    })

    const [
      instTotal, instActives, instEnAttente, instSuspendues,
      citoyensTotal, citoyensMois, citoyensAujourdhui,
      rdvTotal, rdvAujourdhui, rdvMois,
      revenuTotal, revenuMois, revenuAujourdhui,
      signalements, avisData, paiementsEnAttente,
      rdv30j, inscriptions30j, revenus12m, secteurs,
    ] = await Promise.all([

      // ── INSTITUTIONS ──
      supabaseAdmin.from('institutions').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('institutions').select('id', { count: 'exact', head: true }).eq('statut', 'active'),
      supabaseAdmin.from('institutions').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      supabaseAdmin.from('institutions').select('id', { count: 'exact', head: true }).eq('statut', 'suspendue'),

      // ── CITOYENS ──
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),

      // ── RDV ──
      supabaseAdmin.from('rdv').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('rdv').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
      supabaseAdmin.from('rdv').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),

      // ── REVENUS ──
      supabaseAdmin.from('paiements').select('montant'),
      supabaseAdmin.from('paiements').select('montant').gte('created_at', startOfMonth),
      supabaseAdmin.from('paiements').select('montant').gte('created_at', startOfDay),

      // ── SIGNALEMENTS + AVIS ──
      supabaseAdmin.from('signalements').select('id', { count: 'exact', head: true }).eq('statut', 'nouveau'),
      supabaseAdmin.from('avis').select('id, note'),
      supabaseAdmin.from('paiements').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente'),

      // ── GRAPHES ──
      // RDV 30 jours
      supabaseAdmin.from('rdv').select('created_at')
        .gte('created_at', last30Days[0].toISOString()),

      // Inscriptions 30 jours
      supabaseAdmin.from('users').select('created_at')
        .gte('created_at', last30Days[0].toISOString()),

      // Revenus 12 mois
      supabaseAdmin.from('paiements').select('montant, created_at')
        .gte('created_at', last12Months[0].toISOString()),

      // Secteurs institutions
      supabaseAdmin.from('institutions').select('secteur').eq('statut', 'active'),
    ])

    // ── CALCULS REVENUS ──
    const totalRevenu = (revenuTotal.data || []).reduce((s, p) => s + (p.montant || 0), 0)
    const totalRevenuMois = (revenuMois.data || []).reduce((s, p) => s + (p.montant || 0), 0)
    const totalRevenuAujourdhui = (revenuAujourdhui.data || []).reduce((s, p) => s + (p.montant || 0), 0)

    // ── CALCUL AVIS ──
    const avisArr = avisData.data || []
    const avisMoyenne = avisArr.length
      ? avisArr.reduce((s, a) => s + (a.note || 0), 0) / avisArr.length
      : 0

    // ── GRAPHE RDV 30j ──
    const rdvByDay = last30Days.map(d => {
      const dateStr = d.toISOString().slice(0, 10)
      return (rdv30j.data || []).filter(r => r.created_at.slice(0, 10) === dateStr).length
    })
    const rdvLabels = last30Days.map(d =>
      d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    )

    // ── GRAPHE INSCRIPTIONS 30j ──
    const inscByDay = last30Days.map(d => {
      const dateStr = d.toISOString().slice(0, 10)
      return (inscriptions30j.data || []).filter(u => u.created_at.slice(0, 10) === dateStr).length
    })

    // ── GRAPHE REVENUS 12m ──
    const revenusByMonth = last12Months.map(d => {
      const month = d.toISOString().slice(0, 7)
      return (revenus12m.data || [])
        .filter(p => p.created_at.slice(0, 7) === month)
        .reduce((s, p) => s + (p.montant || 0), 0)
    })
    const revenusLabels = last12Months.map(d =>
      d.toLocaleDateString('fr-FR', { month: 'short' })
    )

    // ── SECTEURS PIE ──
    const secteurCounts: Record<string, number> = {}
    for (const inst of secteurs.data || []) {
      const s = inst.secteur || 'Autre'
      secteurCounts[s] = (secteurCounts[s] || 0) + 1
    }
    const secteursArr = Object.entries(secteurCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }))

    return NextResponse.json({
      // KPIs
      institutions_total: instTotal.count || 0,
      institutions_actives: instActives.count || 0,
      institutions_en_attente: instEnAttente.count || 0,
      institutions_suspendues: instSuspendues.count || 0,
      citoyens_total: citoyensTotal.count || 0,
      citoyens_ce_mois: citoyensMois.count || 0,
      citoyens_aujourd_hui: citoyensAujourdhui.count || 0,
      rdv_total: rdvTotal.count || 0,
      rdv_aujourd_hui: rdvAujourdhui.count || 0,
      rdv_ce_mois: rdvMois.count || 0,
      revenus_total: totalRevenu,
      revenus_ce_mois: totalRevenuMois,
      revenus_aujourd_hui: totalRevenuAujourdhui,
      signalements_non_traites: signalements.count || 0,
      avis_total: avisArr.length,
      avis_moyenne: Math.round(avisMoyenne * 10) / 10,
      taux_presence: 78,
      taux_annulation: 12,
      paiements_en_attente: paiementsEnAttente.count || 0,
      documents_en_attente: 0,

      // Graphes
      rdv_chart_30j: rdvByDay,
      rdv_labels_30j: rdvLabels,
      revenus_chart_12m: revenusByMonth,
      revenus_labels_12m: revenusLabels,
      inscriptions_chart_30j: inscByDay,
      secteurs: secteursArr,
    })

  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
}