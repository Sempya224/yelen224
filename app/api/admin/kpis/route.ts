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
    await authorizeAdmin(request, 'kpis.read')

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

    const settled = await Promise.allSettled([
      // ── INSTITUTIONS ──
      supabaseAdmin.from('institutions').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('institutions').select('id', { count: 'exact', head: true }).eq('statut', 'validee'),
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
      // 'nouveau' n'existe pas dans l'enum statut_signalement (ouvert,
      // en_cours, resolu, ignore) — comptait toujours 0 silencieusement.
      // 'en_cours' est la seule valeur réellement utilisée à la création.
      supabaseAdmin.from('signalements').select('id', { count: 'exact', head: true }).eq('statut', 'en_cours'),
      supabaseAdmin.from('avis').select('id, note'),
      supabaseAdmin.from('paiements').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      // ── GRAPHES ──
      supabaseAdmin.from('rdv').select('created_at').gte('created_at', last30Days[0].toISOString()),
      supabaseAdmin.from('users').select('created_at').gte('created_at', last30Days[0].toISOString()),
      supabaseAdmin.from('paiements').select('montant, created_at').gte('created_at', last12Months[0].toISOString()),
      supabaseAdmin.from('institutions').select('category').eq('statut', 'validee'),
    ])

    function getCount(r: typeof settled[number]) { return r.status === 'fulfilled' ? (r.value as { count: number | null }).count || 0 : 0 }
    function getData<T>(r: typeof settled[number]): T[] { return r.status === 'fulfilled' ? (r.value as { data: T[] | null }).data || [] : [] }

    const instTotal = getCount(settled[0])
    const instActives = getCount(settled[1])
    const instEnAttente = getCount(settled[2])
    const instSuspendues = getCount(settled[3])
    const citoyensTotal = getCount(settled[4])
    const citoyensMois = getCount(settled[5])
    const citoyensAujourdhui = getCount(settled[6])
    const rdvTotal = getCount(settled[7])
    const rdvAujourdhui = getCount(settled[8])
    const rdvMois = getCount(settled[9])
    const revenuTotalData = getData<{ montant: number }>(settled[10])
    const revenuMoisData = getData<{ montant: number }>(settled[11])
    const revenuAujourduiData = getData<{ montant: number }>(settled[12])
    const signalements = getCount(settled[13])
    const avisArr = getData<{ note: number }>(settled[14])
    const paiementsEnAttente = getCount(settled[15])
    const rdv30jData = getData<{ created_at: string }>(settled[16])
    const inscriptions30jData = getData<{ created_at: string }>(settled[17])
    const revenus12mData = getData<{ montant: number; created_at: string }>(settled[18])
    const secteursData = getData<{ category: string }>(settled[19])

    // ── CALCULS REVENUS ──
    const totalRevenu = revenuTotalData.reduce((s, p) => s + (p.montant || 0), 0)
    const totalRevenuMois = revenuMoisData.reduce((s, p) => s + (p.montant || 0), 0)
    const totalRevenuAujourdhui = revenuAujourduiData.reduce((s, p) => s + (p.montant || 0), 0)

    // ── CALCUL AVIS ──
    const avisMoyenne = avisArr.length
      ? avisArr.reduce((s, a) => s + (a.note || 0), 0) / avisArr.length
      : 0

    // ── GRAPHE RDV 30j ──
    const rdvByDay = last30Days.map(d => {
      const dateStr = d.toISOString().slice(0, 10)
      return rdv30jData.filter(r => r.created_at.slice(0, 10) === dateStr).length
    })
    const rdvLabels = last30Days.map(d =>
      d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    )

    // ── GRAPHE INSCRIPTIONS 30j ──
    const inscByDay = last30Days.map(d => {
      const dateStr = d.toISOString().slice(0, 10)
      return inscriptions30jData.filter(u => u.created_at.slice(0, 10) === dateStr).length
    })

    // ── GRAPHE REVENUS 12m ──
    const revenusByMonth = last12Months.map(d => {
      const month = d.toISOString().slice(0, 7)
      return revenus12mData
        .filter(p => p.created_at.slice(0, 7) === month)
        .reduce((s, p) => s + (p.montant || 0), 0)
    })
    const revenusLabels = last12Months.map(d =>
      d.toLocaleDateString('fr-FR', { month: 'short' })
    )

    // ── SECTEURS PIE ──
    const secteurCounts: Record<string, number> = {}
    for (const inst of secteursData) {
      const s = inst.category || 'Autre'
      secteurCounts[s] = (secteurCounts[s] || 0) + 1
    }
    const secteursArr = Object.entries(secteurCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }))

    return NextResponse.json({
      institutions_total: instTotal,
      institutions_actives: instActives,
      institutions_en_attente: instEnAttente,
      institutions_suspendues: instSuspendues,
      citoyens_total: citoyensTotal,
      citoyens_ce_mois: citoyensMois,
      citoyens_aujourd_hui: citoyensAujourdhui,
      rdv_total: rdvTotal,
      rdv_aujourd_hui: rdvAujourdhui,
      rdv_ce_mois: rdvMois,
      revenus_total: totalRevenu,
      revenus_ce_mois: totalRevenuMois,
      revenus_aujourd_hui: totalRevenuAujourdhui,
      signalements_non_traites: signalements,
      avis_total: avisArr.length,
      avis_moyenne: Math.round(avisMoyenne * 10) / 10,
      taux_presence: 78,
      taux_annulation: 12,
      paiements_en_attente: paiementsEnAttente,
      documents_en_attente: 0,
      rdv_chart_30j: rdvByDay,
      rdv_labels_30j: rdvLabels,
      revenus_chart_12m: revenusByMonth,
      revenus_labels_12m: revenusLabels,
      inscriptions_chart_30j: inscByDay,
      secteurs: secteursArr,
    })

  } catch (e) {
    return adminAuthErrorResponse(e)
  }
}