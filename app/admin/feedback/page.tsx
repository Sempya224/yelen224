'use client'

// Écran admin "Feedback" — réception des retours envoyés par les institutions
// depuis le popover feedback du header dashboard (app/api/institution/feedback,
// app/api/admin/feedback).
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'

type Feedback = {
  id: string; institution_id: string; institution_nom: string;
  type: string; message: string; statut: string; created_at: string;
}

const TYPE_INFO: Record<string, { label: string; color: string; bg: string }> = {
  bug:             { label: 'Bug',             color: D.red,    bg: D.redDim },
  suggestion:      { label: 'Suggestion',      color: D.blue,   bg: D.blueDim },
  ux:              { label: 'UX',              color: D.purple, bg: D.purpleDim },
  fonctionnalite:  { label: 'Fonctionnalité',  color: D.yellow, bg: D.yellowDim },
}

const STATUT_FILTERS = [
  { key: 'nouveau', label: 'Nouveaux' },
  { key: 'lu',      label: 'Lus' },
  { key: 'traite',  label: 'Traités' },
  { key: 'tous',    label: 'Tous' },
] as const

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function FeedbackPage() {
  const [statut, setStatut] = useState<(typeof STATUT_FILTERS)[number]['key']>('nouveau')
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/feedback?statut=${statut}`)
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j ?? []) : [])
    setLoading(false)
  }, [statut])

  useEffect(() => { load() }, [load])

  async function marquerTraite(id: string) {
    setBusyId(id)
    const res = await fetch('/api/admin/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, statut: 'traite' }),
    })
    setBusyId(null)
    if (res.ok) setItems(prev => prev.filter(f => f.id !== id || statut === 'tous').map(f => f.id === id ? { ...f, statut: 'traite' } : f))
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Feedback</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Retours envoyés par les institutions depuis leur dashboard.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {STATUT_FILTERS.map(f => {
          const active = statut === f.key
          return (
            <button
              key={f.key}
              onClick={() => setStatut(f.key)}
              style={{
                background: active ? D.yellowDim : D.surface,
                border: `1px solid ${active ? D.yellow + '40' : D.border}`,
                color: active ? D.yellow : D.textSub,
                fontSize: '12px', fontWeight: active ? '700' : '500',
                padding: '7px 14px', borderRadius: '20px', cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucun feedback pour ce filtre.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(f => {
            const ti = TYPE_INFO[f.type] ?? { label: f.type, color: D.textSub, bg: D.surface2 }
            return (
              <div key={f.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <span style={{ backgroundColor: ti.bg, color: ti.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{ti.label}</span>
                    <span style={{ color: D.text, fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.institution_nom}</span>
                  </div>
                  <span style={{ color: D.textMuted, fontSize: '11px', flexShrink: 0 }}>{timeAgo(f.created_at)}</span>
                </div>
                <p style={{ color: D.textSub, fontSize: '13px', lineHeight: 1.6, margin: '0 0 12px' }}>{f.message}</p>
                {f.statut !== 'traite' && (
                  <button
                    onClick={() => marquerTraite(f.id)}
                    disabled={busyId === f.id}
                    style={{ background: D.greenDim, border: `1px solid ${D.green}30`, color: D.green, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', opacity: busyId === f.id ? 0.6 : 1 }}
                  >
                    {busyId === f.id ? '…' : 'Marquer traité'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
