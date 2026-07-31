'use client'

// Page "Paiements" — extraite de l'ancien monolithe app/admin/page.tsx
// (chantier refonte admin 26/07/2026, Lot E). Aucune API dédiée n'existe
// pour les paiements — réutilise app/api/admin/export?type=paiements
// (vérification d'accès) + app/api/admin/rdv (affichage), comme
// l'ancienne vue.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, exportCSV } from '@/app/admin/adminUiKit'

export default function PaiementsPage() {
  const [data, setData] = useState<{id:string,statut:string,created_at:string,date_rdv:string,heure_rdv:string,institution_id:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tous')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/export?type=paiements`)
      if (!res.ok) { setError('Table paiements inaccessible ou inexistante'); setData([]); return }
      const r2 = await fetch(`/api/admin/rdv?limit=25&page=${page}`)
      if (r2.ok) setData(await r2.json())
    } catch { setError('Erreur chargement') }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  const statusColor: Record<string, { color: string, bg: string, label: string }> = {
    confirme:   { color: D.green,  bg: D.greenDim,  label: 'Confirmé'   },
    en_attente: { color: D.yellow, bg: D.yellowDim, label: 'En attente' },
    annule:     { color: D.red,    bg: D.redDim,    label: 'Annulé'     },
    termine:    { color: D.blue,   bg: D.blueDim,   label: 'Terminé'    },
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Rendez-vous & Paiements</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>Suivi des RDV et transactions</p>
        </div>
        <button onClick={() => exportCSV('rdv')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
          {Ic.Download(D.textSub)} Exporter CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['tous','confirme','en_attente','annule','termine'].map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{ padding: '7px 14px', borderRadius: D.radiusSm, fontSize: '12px', fontWeight: filter === f ? '700' : '400', backgroundColor: filter === f ? D.yellow : D.surface2, color: filter === f ? '#000' : D.textSub, border: `1px solid ${filter === f ? D.yellow : D.border}`, cursor: 'pointer' }}>
            {f === 'tous' ? 'Tous' : statusColor[f]?.label || f}
          </button>
        ))}
      </div>

      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Chargement...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>{error}</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Aucun résultat</div>
        ) : (
          <DataTable
            cols={[
              { key: 'id',     label: 'ID',         width: '10%' },
              { key: 'statut', label: 'Statut',     width: '15%' },
              { key: 'date',   label: 'Date RDV',   width: '18%' },
              { key: 'heure',  label: 'Heure',      width: '12%' },
              { key: 'inst',   label: 'Institution',width: '25%' },
              { key: 'cree',   label: 'Créé le',    width: '20%' },
            ]}
            rows={data.map(r => {
              const s = statusColor[r.statut] || { color: D.textMuted, bg: D.surface3, label: r.statut }
              return {
                id:     <span style={{ fontFamily: 'monospace', fontSize: '10px', color: D.textMuted }}>{r.id.slice(0,8)}…</span>,
                statut: <Badge label={s.label} color={s.color} bg={s.bg}/>,
                date:   <span style={{ color: D.textSub, fontSize: '12px' }}>{r.date_rdv || '—'}</span>,
                heure:  <span style={{ color: D.textSub, fontSize: '12px' }}>{r.heure_rdv || '—'}</span>,
                inst:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{r.institution_id?.slice(0,12) || '—'}…</span>,
                cree:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(r.created_at).toLocaleDateString('fr-FR')}</span>,
              }
            })}
          />
        )}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>Préc</button>
            <button onClick={() => setPage(p => p+1)} disabled={data.length < 25} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 25 ? 0.4 : 1 }}>Suiv</button>
          </div>
        </div>
      </div>
    </div>
  )
}
