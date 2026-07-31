'use client'

// Page "Modération" (signalements) — extraite de l'ancien monolithe
// app/admin/page.tsx (chantier refonte admin 26/07/2026, Lot C). Autonome,
// consomme app/api/admin/signalements/route.ts + [id]/resoudre|ignorer.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { Signalement, ToastItem } from '@/app/admin/adminTypes'

export default function ModerationPage() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const [signalements, setSignalements] = useState<Signalement[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Signalement | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/signalements?statut=tous&limit=30')
      if (res.ok) setSignalements(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function resolveAction(id: string, endpoint: string) {
    setActionLoading(id + endpoint)
    try {
      const res = await fetch(`/api/admin/signalements/${id}/${endpoint}`, { method: 'POST' })
      if (res.ok) {
        toast(endpoint === 'resoudre' ? 'Signalement résolu' : 'Signalement ignoré', 'success')
        setSignalements(prev => prev.filter(s => s.id !== id))
        setSelected(null)
      } else toast('Erreur', 'error')
    } catch { toast('Erreur réseau', 'error') }
    finally { setActionLoading(null) }
  }

  const statusColor: Record<string, { color: string, bg: string, label: string }> = {
    nouveau:    { color: D.red,    bg: D.redDim,    label: 'Nouveau'    },
    en_cours:   { color: D.orange, bg: D.orangeDim, label: 'En cours'   },
    resolu:     { color: D.green,  bg: D.greenDim,  label: 'Résolu'     },
    ignore:     { color: D.textMuted, bg: D.surface3, label: 'Ignoré'   },
  }

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Modération</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{signalements.length} signalement(s)</p>
      </div>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
        ) : signalements.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucun signalement</div>
        ) : (
          <DataTable
            cols={[
              { key: 'type',    label: 'Type',        width: '18%' },
              { key: 'desc',    label: 'Description', width: '32%' },
              { key: 'statut',  label: 'Statut',      width: '14%' },
              { key: 'date',    label: 'Date',         width: '16%' },
              { key: 'actions', label: 'Actions',      width: '20%' },
            ]}
            rows={signalements.map(sig => {
              const s = statusColor[sig.statut] || { color: D.textMuted, bg: D.surface3, label: sig.statut }
              return {
                type:    <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{sig.type || 'Non spécifié'}</span>,
                desc:    <span style={{ color: D.textSub, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '200px' }}>{sig.description || '—'}</span>,
                statut:  <Badge label={s.label} color={s.color} bg={s.bg}/>,
                date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(sig.created_at).toLocaleDateString('fr-FR')}</span>,
                actions: (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelected(sig)} style={{ padding: '4px 8px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Voir</button>
                    {sig.statut === 'nouveau' && (
                      <>
                        <button onClick={() => resolveAction(sig.id, 'resoudre')} disabled={actionLoading === sig.id + 'resoudre'} style={{ padding: '4px 8px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', color: D.green, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                          {Ic.Check(D.green)}
                        </button>
                        <button onClick={() => resolveAction(sig.id, 'ignorer')} disabled={actionLoading === sig.id + 'ignorer'} style={{ padding: '4px 8px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: '5px', color: D.textMuted, fontSize: '11px', cursor: 'pointer' }}>
                          {Ic.X(D.textMuted)}
                        </button>
                      </>
                    )}
                  </div>
                ),
              }
            })}
          />
        )}
      </div>

      <SlidePanel open={!!selected} onClose={() => setSelected(null)} title="Détail signalement">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
              {[
                ['Type', selected.type || '—'],
                ['Statut', selected.statut],
                ['Priorité', selected.priorite || 'Normale'],
                ['Cible', selected.cible_type || '—'],
                ['Date', new Date(selected.created_at).toLocaleDateString('fr-FR')],
              ].map(([l, v], i, arr) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                  <span style={{ fontSize: '12px', color: D.textMuted }}>{l}</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: D.text }}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Description</p>
              <p style={{ margin: 0, fontSize: '13px', color: D.text, lineHeight: 1.6, padding: '12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                {selected.description || 'Aucune description'}
              </p>
            </div>
            {selected.statut === 'nouveau' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => resolveAction(selected.id, 'resoudre')} style={{ flex: 1, padding: '11px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  Marquer résolu
                </button>
                <button onClick={() => resolveAction(selected.id, 'ignorer')} style={{ flex: 1, padding: '11px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  Ignorer
                </button>
              </div>
            )}
          </div>
        )}
      </SlidePanel>
    </div>
  )
}
