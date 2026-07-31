'use client'

// Page "Institutions" — extraite de l'ancien monolithe app/admin/page.tsx
// (chantier refonte admin 26/07/2026, Lot C). Autonome : gère son propre
// toast, consomme app/api/admin/institutions/route.ts +
// [id]/valider|refuser|suspendre|reactiver|badge|plan.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, SlidePanel, ToastContainer, exportCSV } from '@/app/admin/adminUiKit'
import type { Institution, ToastItem } from '@/app/admin/adminTypes'

export default function InstitutionsPage() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const [data, setData] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tous')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Institution | null>(null)
  const [panel, setPanel] = useState<string | null>(null)
  const [motif, setMotif] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ statut: filter, limit: '25', page: String(page) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/institutions?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [filter, search, page])

  useEffect(() => { load() }, [load])

  async function action(id: string, endpoint: string, body?: object) {
    setActionLoading(id + endpoint)
    try {
      let url = `/api/admin/institutions/${id}/${endpoint}`
      let reqBody = body
      if (endpoint === 'badge_accorder') { url = `/api/admin/institutions/${id}/badge`; reqBody = { badge_verifie: true } }
      if (endpoint === 'badge_retirer')  { url = `/api/admin/institutions/${id}/badge`; reqBody = { badge_verifie: false } }
      if (endpoint === 'plan_premium')   { url = `/api/admin/institutions/${id}/plan`;  reqBody = { plan: 'premium' } }
      if (endpoint === 'plan_gratuit')   { url = `/api/admin/institutions/${id}/plan`;  reqBody = { plan: 'gratuit' } }

      const res = await fetch(url, {
        method: 'POST',
        headers: reqBody ? { 'Content-Type': 'application/json' } : {},
        body: reqBody ? JSON.stringify(reqBody) : undefined,
      })
      if (res.ok) {
        const messages: Record<string, string> = {
          valider: 'Institution validée',
          suspendre: 'Institution suspendue',
          refuser: 'Institution refusée',
          reactiver: 'Institution réactivée',
          avertir: 'Avertissement ajouté',
          badge_accorder: 'Badge accordé',
          badge_retirer: 'Badge retiré',
          plan_premium: 'Plan mis à Premium',
          plan_gratuit: 'Plan remis à Gratuit',
        }
        toast(messages[endpoint] || 'Action effectuée')
        load()
        setPanel(null)
        setMotif('')
      } else toast('Erreur action', 'error')
    } catch { toast('Erreur réseau', 'error') }
    finally { setActionLoading(null) }
  }

  const statusColor: Record<string, { color: string, bg: string, label: string }> = {
    validee:    { color: D.green,  bg: D.greenDim,  label: 'Validée'     },
    en_attente: { color: D.yellow, bg: D.yellowDim, label: 'En attente'  },
    suspendue:  { color: D.red,    bg: D.redDim,    label: 'Suspendue'   },
    refusee:    { color: D.orange, bg: D.orangeDim, label: 'Refusée'     },
  }

  const FILTERS = ['tous', 'en_attente', 'validee', 'suspendue']

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Institutions</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} résultats</p>
        </div>
        <button onClick={() => exportCSV('institutions')} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', backgroundColor: D.surface2,
          border: `1px solid ${D.border}`, borderRadius: D.radiusSm,
          fontSize: '12px', color: D.textSub, cursor: 'pointer',
        }}>
          {Ic.Download(D.textSub)} Exporter
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>
            {Ic.Search(D.textMuted)}
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom..."
            style={{
              width: '100%', padding: '8px 12px 8px 32px',
              backgroundColor: D.surface2, border: `1px solid ${D.border}`,
              borderRadius: D.radiusSm, fontSize: '13px', color: D.text,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{
              padding: '8px 14px', borderRadius: D.radiusSm, fontSize: '12px',
              fontWeight: filter === f ? '700' : '400',
              backgroundColor: filter === f ? D.yellow : D.surface2,
              color: filter === f ? '#000' : D.textSub,
              border: `1px solid ${filter === f ? D.yellow : D.border}`,
              cursor: 'pointer', transition: 'all 0.12s',
            }}>
              {f === 'tous' ? 'Tous' : f === 'en_attente' ? 'En attente' : f === 'validee' ? 'Validées' : 'Suspendues'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucune institution trouvée</div>
        ) : (
          <DataTable
            cols={[
              { key: 'nom',     label: 'Nom',     width: '28%' },
              { key: 'secteur', label: 'Secteur', width: '18%' },
              { key: 'ville',   label: 'Ville',   width: '14%' },
              { key: 'statut',  label: 'Statut',  width: '14%' },
              { key: 'date',    label: 'Inscrite', width: '14%' },
              { key: 'actions', label: 'Actions', width: '12%' },
            ]}
            rows={data.map(inst => {
              const s = statusColor[inst.statut] || { color: D.textMuted, bg: D.surface3, label: inst.statut }
              return {
                nom:     <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  {inst.badge_verifie && <span title="Badge vérifié" style={{ color: D.blue, fontSize: '11px' }}>{Ic.Check(D.blue)}</span>}
                  <span style={{ fontWeight: '600', color: D.text }}>{inst.name}</span>
                  {inst.plan === 'premium' && <Badge label="PRO" color={D.yellow} bg={D.yellowDim}/>}
                  {(inst.avertissements || 0) > 0 && <span title={`${inst.avertissements} avertissement(s)`} style={{ color: D.red, fontSize: '10px', fontWeight: '700' }}>⚠{inst.avertissements}</span>}
                </div>,
                secteur: <span style={{ color: D.textSub }}>{inst.category || '—'}</span>,
                ville:   <span style={{ color: D.textSub }}>{inst.ville || '—'}</span>,
                statut:  <Badge label={s.label} color={s.color} bg={s.bg}/>,
                date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(inst.created_at).toLocaleDateString('fr-FR')}</span>,
                actions: (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setSelected(inst); setPanel('detail') }} style={{ padding: '4px 8px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                      Voir
                    </button>
                    {inst.statut === 'en_attente' && (
                      <button onClick={() => action(inst.id, 'valider')} disabled={actionLoading === inst.id + 'valider'} style={{ padding: '4px 8px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', color: D.green, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                        {actionLoading === inst.id + 'valider' ? '...' : Ic.Check(D.green)}
                      </button>
                    )}
                    {inst.statut === 'suspendue' ? (
                      <button onClick={() => action(inst.id, 'reactiver')} style={{ padding: '4px 8px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', color: D.green, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                        Réactiver
                      </button>
                    ) : (
                      <button onClick={() => { setSelected(inst); setPanel('suspendre') }} style={{ padding: '4px 8px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: '5px', color: D.red, fontSize: '11px', cursor: 'pointer' }}>
                        {Ic.Ban(D.red)}
                      </button>
                    )}
                  </div>
                ),
              }
            })}
          />
        )}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>
              {Ic.ChevL(D.textSub)} Préc
            </button>
            <button onClick={() => setPage(p => p+1)} disabled={data.length < 25} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 25 ? 0.4 : 1 }}>
              Suiv {Ic.ChevR(D.textSub)}
            </button>
          </div>
        </div>
      </div>

      <SlidePanel open={panel === 'detail'} onClose={() => setPanel(null)} title={selected?.name || 'Détail'} width="520px">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `linear-gradient(135deg, ${D.yellow}, #b8860b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '800', color: '#000', flexShrink: 0, overflow: 'hidden' }}>
                {selected.logo ? <img src={selected.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : (selected.name?.slice(0,2) || '?').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '700', color: D.text, fontSize: '14px' }}>{selected.name}</span>
                  {selected.badge_verifie && <span title="Badge vérifié" style={{ color: D.blue }}>{Ic.Check(D.blue)}</span>}
                  {selected.plan === 'premium' && <Badge label="PREMIUM" color={D.yellow} bg={D.yellowDim}/>}
                </div>
                <div style={{ color: D.textMuted, fontSize: '11px' }}>{selected.category} · {selected.ville}</div>
              </div>
            </div>

            <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
              {([
                ['Catégorie', selected.category || '—'],
                ['Ville / Quartier', [selected.ville, selected.quartier].filter(Boolean).join(', ') || '—'],
                ['Adresse', selected.adresse || '—'],
                ['Email', selected.email || '—'],
                ['Téléphone', selected.phone || '—'],
                ['WhatsApp', selected.whatsapp || '—'],
                ['Site web', selected.website || '—'],
                ['Statut', selected.statut],
                ['Plan', selected.plan || 'gratuit'],
                ['Avertissements', String(selected.avertissements || 0)],
                ['Note moyenne', selected.moyenne_avis ? `${selected.moyenne_avis.toFixed(1)} / 5 (${selected.nb_avis} avis)` : '—'],
                ['Document officiel', selected.document_officiel ? 'Fourni' : 'Non fourni'],
                ['Inscrite le', new Date(selected.created_at).toLocaleDateString('fr-FR')],
              ] as [string, string][]).map(([l, v], i, arr) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                  <span style={{ fontSize: '11px', color: D.textMuted }}>{l}</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: l === 'Avertissements' && parseInt(v) > 0 ? D.red : D.text, maxWidth: '240px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>

            {selected.description && (
              <div style={{ padding: '10px 12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: D.textMuted, letterSpacing: '0.6px' }}>Description</p>
                <p style={{ margin: 0, fontSize: '12px', color: D.textSub, lineHeight: 1.5 }}>{selected.description}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: D.textMuted, letterSpacing: '0.6px' }}>Actions</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {selected.statut === 'en_attente' && (
                  <button onClick={() => action(selected.id, 'valider')} style={{ padding: '9px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12px', fontWeight: '600', cursor: 'pointer', gridColumn: '1/-1' }}>
                    Valider l&apos;institution
                  </button>
                )}
                {selected.statut === 'suspendue' ? (
                  <button onClick={() => action(selected.id, 'reactiver')} style={{ padding: '9px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12px', fontWeight: '600', cursor: 'pointer', gridColumn: '1/-1' }}>
                    Réactiver le compte
                  </button>
                ) : (
                  <button onClick={() => action(selected.id, 'suspendre')} style={{ padding: '9px', backgroundColor: D.orangeDim, border: `1px solid ${D.orangeBrd}`, borderRadius: D.radiusSm, color: D.orange, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    Suspendre
                  </button>
                )}
                <button onClick={() => setPanel('refus')} style={{ padding: '9px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, color: D.red, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  Refuser
                </button>
                <button onClick={() => action(selected.id, 'avertir')} style={{ padding: '9px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  + Avertissement
                </button>
                <button onClick={() => action(selected.id, selected.badge_verifie ? 'badge_retirer' : 'badge_accorder')} style={{ padding: '9px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: D.radiusSm, color: D.blue, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  {selected.badge_verifie ? 'Retirer badge' : 'Accorder badge'}
                </button>
                <button onClick={() => action(selected.id, selected.plan === 'premium' ? 'plan_gratuit' : 'plan_premium')} style={{ padding: '9px', backgroundColor: D.purpleDim, border: `1px solid ${D.purpleBrd}`, borderRadius: D.radiusSm, color: D.purple, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  {selected.plan === 'premium' ? 'Passer gratuit' : 'Passer premium'}
                </button>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>

      <SlidePanel open={panel === 'refus'} onClose={() => setPanel(null)} title="Motif de refus">
        <p style={{ fontSize: '13px', color: D.textSub, marginBottom: '14px' }}>L&apos;institution sera notifiée avec ce motif.</p>
        <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Indiquez le motif..." rows={5}
          style={{ width: '100%', padding: '10px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, resize: 'vertical', outline: 'none', fontFamily: D.font, boxSizing: 'border-box', marginBottom: '12px' }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => selected && action(selected.id, 'refuser', { motif })} disabled={!motif.trim() || !!actionLoading}
            style={{ flex: 1, padding: '11px', backgroundColor: D.red, border: 'none', borderRadius: D.radiusSm, color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', opacity: !motif.trim() ? 0.5 : 1 }}>
            Confirmer le refus
          </button>
          <button onClick={() => setPanel('detail')} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>
            Retour
          </button>
        </div>
      </SlidePanel>
    </div>
  )
}
