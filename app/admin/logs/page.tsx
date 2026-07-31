'use client'

// Page "Logs système" — extraite de l'ancien monolithe app/admin/page.tsx
// (chantier refonte admin 26/07/2026, Lot F). Consomme
// app/api/admin/logs/route.ts.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { DataTable } from '@/app/admin/adminUiKit'

export default function LogsPage() {
  const [data, setData] = useState<{id:string,action:string,created_at:string,admin_id:string,cible_table:string,cible_id:string,details:Record<string,unknown>}[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/logs?limit=30&page=${page}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  const actionColor: Record<string, string> = {
    LOGIN: D.green, LOGOUT: D.textMuted,
    VALIDER_INSTITUTION: D.green, SUSPENDRE_INSTITUTION: D.red,
    REFUSER_INSTITUTION: D.orange, BROADCAST_NOTIFICATION: D.blue,
    EXPORT_CSV: D.yellow, RESOUDRE_SIGNALEMENT: D.green,
    IGNORER_SIGNALEMENT: D.textMuted,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Logs système</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>Toutes les actions administrateurs</p>
        </div>
        <button onClick={() => load()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
          {Ic.Refresh(D.textSub)} Actualiser
        </button>
      </div>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
        ) : (
          <DataTable
            cols={[
              { key: 'action',  label: 'Action',    width: '25%' },
              { key: 'cible',   label: 'Cible',     width: '20%' },
              { key: 'details', label: 'Détails',   width: '30%' },
              { key: 'date',    label: 'Date',       width: '25%' },
            ]}
            rows={data.map(log => ({
              action:  <span style={{ fontWeight: '700', fontSize: '11px', color: actionColor[log.action] || D.textSub, fontFamily: 'monospace' }}>{log.action}</span>,
              cible:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{log.cible_table || '—'} {log.cible_id ? `· ${log.cible_id.slice(0,8)}` : ''}</span>,
              details: <span style={{ color: D.textMuted, fontSize: '11px', fontFamily: 'monospace' }}>{log.details ? JSON.stringify(log.details).slice(0, 60) : '—'}</span>,
              date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(log.created_at).toLocaleString('fr-FR')}</span>,
            }))}
          />
        )}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>Préc</button>
            <button onClick={() => setPage(p => p+1)} disabled={data.length < 30} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 30 ? 0.4 : 1 }}>Suiv</button>
          </div>
        </div>
      </div>
    </div>
  )
}
