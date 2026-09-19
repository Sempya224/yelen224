'use client'

// Page "Modération" (signalements) — extraite de l'ancien monolithe
// app/admin/page.tsx (chantier refonte admin 26/07/2026, Lot C). Onglet
// "Cas institution <-> citoyen" ajouté au chantier arbitrage Yelen
// (15/08/2026) : ces dossiers ont désormais leur propre file d'attente,
// distincte des signalements Communauté — Yelen est seul juge des deux,
// mais ce sont deux workflows différents (voir
// app/api/admin/signalements-cas/ pour le second).
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { Signalement, SignalementCas, ToastItem } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'
import {
  SIGNALEMENT_STATUTS_OUVERTS, SIGNALEMENT_STATUT_LABELS, SIGNALEMENT_TRANSITIONS,
  SIGNALEMENT_RESOLUTION_ACTIONS, SIGNALEMENT_RESOLUTION_ACTION_LABELS, SIGNALEMENT_PRIORITES, SIGNALEMENT_PRIORITE_LABELS,
  type SignalementStatut, type SignalementResolutionAction, type SignalementPriorite,
} from '@/lib/signalementsConstants'

export default function ModerationPage() {
  const [tab, setTab] = useState<'communaute' | 'cas'>('communaute')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Signalements</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>Communauté Yelen et dossiers institution ↔ citoyen — Yelen est seul juge des deux.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {([['communaute', 'Communauté'], ['cas', 'Cas institution ↔ citoyen']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
            border: `1px solid ${tab === k ? D.blueBrd : D.border}`,
            backgroundColor: tab === k ? D.blueDim : D.surface,
            color: tab === k ? D.blue : D.textSub,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'communaute' ? <CommunauteTab toast={toast}/> : <CasTab toast={toast}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// COMMUNAUTÉ — contenu d'origine, inchangé
// ═══════════════════════════════════════════════════════════════════════
function CommunauteTab({ toast }: { toast: (message: string, type?: ToastItem['type']) => void }) {
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
    <>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24}/></div>
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
                    {(SIGNALEMENT_STATUTS_OUVERTS as readonly string[]).includes(sig.statut) && (
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
            {(SIGNALEMENT_STATUTS_OUVERTS as readonly string[]).includes(selected.statut) && (
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
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CAS INSTITUTION <-> CITOYEN — arbitrage Yelen (nouveau, 15/08/2026)
// ═══════════════════════════════════════════════════════════════════════
const STATUT_COLOR: Record<string, { color: string, bg: string }> = {
  nouveau: { color: D.red, bg: D.redDim }, a_traiter: { color: D.orange, bg: D.orangeDim },
  en_cours: { color: D.orange, bg: D.orangeDim }, en_attente: { color: D.orange, bg: D.orangeDim },
  resolu: { color: D.green, bg: D.greenDim }, cloture: { color: D.textMuted, bg: D.surface3 },
  rejete: { color: D.textMuted, bg: D.surface3 }, doublon: { color: D.textMuted, bg: D.surface3 },
}

function CasTab({ toast }: { toast: (message: string, type?: ToastItem['type']) => void }) {
  const [cas, setCas] = useState<SignalementCas[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    signalement: SignalementCas
    events: { id: string; audit_id: string; type: string; acteur_type: string; membre_nom: string; commentaire: string | null; created_at: string }[]
    notes: { id: string; auteur_nom: string; contenu: string; created_at: string }[]
    attachments: { id: string; nom_original: string; taille: number; url: string | null }[]
  } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [resolutionAction, setResolutionAction] = useState<SignalementResolutionAction | ''>('')
  const [resolutionTexte, setResolutionTexte] = useState('')
  const [raisonReouverture, setRaisonReouverture] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/signalements-cas')
      if (res.ok) setCas(await res.json())
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/signalements-cas/${id}`)
      if (res.ok) setDetail(await res.json())
    } finally { setLoadingDetail(false) }
  }, [])
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setResolutionAction(''); setResolutionTexte(''); setRaisonReouverture('')
    loadDetail(selectedId)
  }, [selectedId, loadDetail])

  async function agir(action: string, payload: Record<string, unknown> = {}) {
    if (!selectedId) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/signalements-cas/${selectedId}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.ok) {
        toast('Décision enregistrée')
        loadDetail(selectedId)
        load()
      } else toast(json?.error || 'Erreur', 'error')
    } catch { toast('Erreur réseau', 'error') }
    finally { setActionLoading(false) }
  }

  return (
    <>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24}/></div>
        ) : cas.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucun dossier</div>
        ) : (
          <DataTable
            cols={[
              { key: 'motif',  label: 'Motif',   width: '22%' },
              { key: 'sens',   label: 'Sens',     width: '30%' },
              { key: 'statut', label: 'Statut',   width: '16%' },
              { key: 'prio',   label: 'Priorité', width: '14%' },
              { key: 'date',   label: 'Date',      width: '18%' },
            ]}
            onRowClick={row => setSelectedId(row.id as unknown as string)}
            rows={cas.map(c => {
              const s = STATUT_COLOR[c.statut] || { color: D.textMuted, bg: D.surface3 }
              const sens = c.type_signaleur === 'institution' ? `${c.institution_name} → ${c.citoyen_name}` : `${c.citoyen_name} → ${c.institution_name}`
              return {
                id: c.id as unknown as React.ReactNode,
                motif:  <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{c.motif}</span>,
                sens:   <span style={{ color: D.textSub, fontSize: '12px' }}>{sens}</span>,
                statut: <Badge label={SIGNALEMENT_STATUT_LABELS[c.statut as SignalementStatut] || c.statut} color={s.color} bg={s.bg}/>,
                prio:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{SIGNALEMENT_PRIORITE_LABELS[c.priorite as SignalementPriorite] || c.priorite}</span>,
                date:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(c.created_at).toLocaleDateString('fr-FR')}</span>,
              }
            })}
          />
        )}
      </div>

      <SlidePanel open={!!selectedId} onClose={() => setSelectedId(null)} title="Dossier institution ↔ citoyen" width="560px">
        {loadingDetail || !detail ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24}/></div>
        ) : (() => {
          const sig = detail.signalement
          const transitions = SIGNALEMENT_TRANSITIONS[sig.statut as SignalementStatut] ?? []
          const estTerminal = transitions.length === 0
          const sens = sig.type_signaleur === 'institution' ? `${sig.institution_name} a signalé ${sig.citoyen_name}` : `${sig.citoyen_name} a signalé ${sig.institution_name}`
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
                {[
                  ['Référence', sig.numero_public],
                  ['Sens', sens],
                  ['Motif', sig.motif],
                  ['Priorité', SIGNALEMENT_PRIORITE_LABELS[sig.priorite as SignalementPriorite] || sig.priorite],
                  ['Date', new Date(sig.created_at).toLocaleDateString('fr-FR')],
                ].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${D.border}` : 'none' }}>
                    <span style={{ fontSize: '12px', color: D.textMuted }}>{l}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: D.text, textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>

              <div>
                <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Description</p>
                <p style={{ margin: 0, fontSize: '13px', color: D.text, lineHeight: 1.6, padding: '12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                  {sig.description || 'Aucune description'}
                </p>
              </div>

              {detail.attachments.length > 0 && (
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Pièces jointes</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {detail.attachments.map(a => (
                      <a key={a.id} href={a.url || undefined} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: D.blue, textDecoration: 'none' }}>{a.nom_original} ({Math.round(a.taille / 1024)} Ko)</a>
                    ))}
                  </div>
                </div>
              )}

              {detail.notes.length > 0 && (
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Notes internes de l&apos;institution</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {detail.notes.map(n => (
                      <div key={n.id} style={{ fontSize: '12px', color: D.textSub, padding: '8px 10px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                        <strong style={{ color: D.text }}>{n.auteur_nom}</strong> — {n.contenu}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Historique</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {detail.events.map(e => (
                    <div key={e.id} style={{ fontSize: '11px', color: D.textMuted }}>
                      {new Date(e.created_at).toLocaleString('fr-FR')} — {e.membre_nom} ({e.type}){e.commentaire ? ` : ${e.commentaire}` : ''}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Priorité — Yelen seul juge, l'institution ne peut plus la modifier ── */}
              <div>
                <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Priorité</p>
                <select value={sig.priorite} disabled={actionLoading} onChange={e => agir('changer_priorite', { priorite: e.target.value })} style={{ width: '100%', padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface2, color: D.text, fontSize: '12.5px' }}>
                  {SIGNALEMENT_PRIORITES.map(p => <option key={p} value={p}>{SIGNALEMENT_PRIORITE_LABELS[p]}</option>)}
                </select>
              </div>

              {/* ── Décision — seule Yelen peut agir ici (chantier arbitrage 15/08/2026) ── */}
              {!estTerminal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: D.text }}>Décision Yelen</p>
                  {transitions.includes('en_cours') && sig.statut !== 'en_cours' && (
                    <button onClick={() => agir('changer_statut', { statut: 'en_cours' })} disabled={actionLoading} style={{ padding: '9px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: D.radiusSm, color: D.blue, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Marquer en cours d&apos;examen</button>
                  )}
                  {transitions.includes('resolu') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <select value={resolutionAction} onChange={e => setResolutionAction(e.target.value as SignalementResolutionAction)} style={{ padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface, color: D.text, fontSize: '12.5px' }}>
                        <option value="">Choisir une décision…</option>
                        {SIGNALEMENT_RESOLUTION_ACTIONS.map(a => <option key={a} value={a}>{SIGNALEMENT_RESOLUTION_ACTION_LABELS[a]}</option>)}
                      </select>
                      <textarea value={resolutionTexte} onChange={e => setResolutionTexte(e.target.value)} rows={3} placeholder="Explication transmise aux deux parties…" style={{ padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', resize: 'none' }}/>
                      <button onClick={() => agir('resoudre', { resolutionAction, resolutionExplication: resolutionTexte })} disabled={actionLoading || !resolutionAction || !resolutionTexte.trim()} style={{ padding: '10px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '13px', fontWeight: '600', cursor: actionLoading ? 'default' : 'pointer', opacity: !resolutionAction || !resolutionTexte.trim() ? 0.5 : 1 }}>Résoudre — notifie les 2 parties</button>
                    </div>
                  )}
                  {transitions.includes('rejete') && (
                    <button onClick={() => agir('changer_statut', { statut: 'rejete' })} disabled={actionLoading} style={{ padding: '9px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Rejeter — notifie les 2 parties</button>
                  )}
                  {sig.statut === 'resolu' && (
                    <button onClick={() => agir('cloturer')} disabled={actionLoading} style={{ padding: '9px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Clôturer — notifie les 2 parties</button>
                  )}
                </div>
              )}

              {estTerminal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: D.text }}>Dossier clos — réouverture possible</p>
                  <textarea value={raisonReouverture} onChange={e => setRaisonReouverture(e.target.value)} rows={2} placeholder="Raison de la réouverture (obligatoire)…" style={{ padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', resize: 'none' }}/>
                  <button onClick={() => agir('reouvrir', { raison: raisonReouverture })} disabled={actionLoading || !raisonReouverture.trim()} style={{ padding: '10px', backgroundColor: D.orangeDim, border: `1px solid ${D.orangeBrd}`, borderRadius: D.radiusSm, color: D.orange, fontSize: '13px', fontWeight: '600', cursor: actionLoading ? 'default' : 'pointer', opacity: !raisonReouverture.trim() ? 0.5 : 1 }}>Rouvrir — notifie les 2 parties</button>
                </div>
              )}
            </div>
          )
        })()}
      </SlidePanel>
    </>
  )
}
