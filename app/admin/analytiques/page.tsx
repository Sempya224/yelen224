'use client'

// Page "Analytiques" — extraite de l'ancien monolithe app/admin/page.tsx
// (chantier refonte admin 26/07/2026, Lot F). Différence par rapport à
// l'ancienne vue : recevait `kpis` en prop du parent, cette page autonome
// fait son propre fetch de app/api/admin/kpis au montage.
import { useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, LineChart, BarChart, PieChart, StatBadge, fmtMoney, fmtNum } from '@/app/admin/adminUiKit'
import type { KPIs } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'

export default function AnalytiquesPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null)

  useEffect(() => {
    fetch('/api/admin/kpis').then(r => r.ok ? r.json() : null).then(d => { if (d) setKpis(d) })
  }, [])

  const SECT_COLORS = [D.yellow, D.blue, D.green, D.orange, D.purple, D.red, '#06b6d4', '#ec4899']

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Analytiques</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>Données 30 derniers jours</p>
      </div>
      {!kpis ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24}/></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>RDV — 30 jours</p>
              <p style={{ margin: '0 0 14px', fontSize: '24px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>{(kpis.rdv_ce_mois).toLocaleString('fr-FR')}</p>
              <LineChart data={kpis.rdv_chart_30j} color={D.orange} height={70}/>
            </div>
            <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Revenus — 12 mois</p>
              <p style={{ margin: '0 0 14px', fontSize: '24px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>{fmtMoney(kpis.revenus_total)}</p>
              <BarChart data={kpis.revenus_chart_12m} color={D.green} labels={kpis.revenus_labels_12m}/>
            </div>
            <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
              <p style={{ margin: '0 0 14px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Secteurs institutions</p>
              {kpis.secteurs.length > 0
                ? <PieChart data={kpis.secteurs.map((s, i) => ({ ...s, color: SECT_COLORS[i % SECT_COLORS.length] }))}/>
                : <div style={{ color: D.textMuted, fontSize: '12px' }}>Aucune donnée</div>
              }
            </div>
          </div>

          <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <p style={{ margin: 0, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Inscriptions citoyens — 30 jours</p>
                <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>+{kpis.citoyens_ce_mois.toLocaleString('fr-FR')}</p>
              </div>
              <StatBadge value={`+${kpis.citoyens_aujourd_hui} aujourd'hui`} positive={true}/>
            </div>
            <LineChart data={kpis.inscriptions_chart_30j} color={D.blue} height={60}/>
          </div>

          <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.border}` }}>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Indicateurs de performance</p>
            </div>
            <DataTable
              cols={[
                { key: 'metric', label: 'Indicateur', width: '50%' },
                { key: 'value',  label: 'Valeur',     width: '25%' },
                { key: 'status', label: 'Statut',     width: '25%' },
              ]}
              rows={[
                { metric: 'Taux de présence moyen',       value: `${kpis.taux_presence}%`,   status: <StatBadge value={`${kpis.taux_presence}%`} positive={kpis.taux_presence > 60}/> },
                { metric: "Taux d'annulation",            value: `${kpis.taux_annulation}%`, status: <StatBadge value={`${kpis.taux_annulation}%`} positive={kpis.taux_annulation < 20}/> },
                { metric: 'Satisfaction moyenne',         value: kpis.avis_moyenne > 0 ? `${kpis.avis_moyenne.toFixed(1)} / 5` : '—', status: <div style={{ display: 'flex', gap: '2px' }}>{Array.from({length:5}).map((_,i) => <span key={i} style={{ color: i < Math.round(kpis.avis_moyenne) ? D.yellow : D.surface3 }}>{Ic.Star(i < Math.round(kpis.avis_moyenne) ? D.yellow : D.surface3)}</span>)}</div> },
                { metric: 'Institutions actives / total', value: `${kpis.institutions_actives} / ${kpis.institutions_total}`, status: <StatBadge value={`${Math.round(kpis.institutions_actives/Math.max(kpis.institutions_total,1)*100)}%`} positive={true}/> },
                { metric: 'Signalements ouverts',         value: fmtNum(kpis.signalements_non_traites), status: <Badge label={kpis.signalements_non_traites === 0 ? 'Aucun' : 'Attention'} color={kpis.signalements_non_traites === 0 ? D.green : D.red} bg={kpis.signalements_non_traites === 0 ? D.greenDim : D.redDim}/> },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
