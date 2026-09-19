'use client'

// File de vérification d'identité citoyen (pipeline réel, 28/08/2026) —
// écran de revue déféré lors de la refonte de /compte/verification-identite
// (l'upload citoyen passe désormais en "en_attente", plus d'auto-vérification).
// Volontairement plus simple que app/admin/verification/page.tsx (institutions,
// axes Identité/Autorité versionnés) : une seule décision, pas de révocation
// ni d'historique multi-versions — périmètre assumé pour ce chantier.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { ToastItem } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'

type StatutFiltre = 'en_attente' | 'refusee' | 'verifiee'

type ListItem = {
  id: string; nom: string | null; prenom: string | null; phone: string | null
  cin_soumis_le: string; cin_statut: string | null; identite_verifiee: boolean; cin_examine_le: string | null
}

type Dossier = {
  id: string; nom: string | null; prenom: string | null; phone: string | null; created_at: string
  cin_soumis_le: string; cin_statut: string | null; cin_motif_refus: string | null
  cin_examine_le: string | null; identite_verifiee: boolean
  recto_url: string | null; verso_url: string | null; selfie_url: string | null
}

const STATUT_LABEL: Record<StatutFiltre, { label: string; color: string; bg: string }> = {
  en_attente: { label: 'En attente', color: D.yellow, bg: D.yellowDim },
  verifiee:   { label: 'Vérifiée',   color: D.green,  bg: D.greenDim },
  refusee:    { label: 'Refusée',    color: D.red,    bg: D.redDim },
}

function statutDe(item: ListItem): StatutFiltre {
  if (item.identite_verifiee) return 'verifiee'
  if (item.cin_statut === 'refusee') return 'refusee'
  return 'en_attente'
}

export default function IdentiteCitoyensPage() {
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtre, setFiltre] = useState<StatutFiltre>('en_attente')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])

  const load = useCallback(async (f: StatutFiltre, q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/citoyens-identite?statut=${f}&search=${encodeURIComponent(q)}`)
      if (res.ok) setItems(await res.json())
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(filtre, search) }, [load, filtre, search])

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Identité citoyens</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>
          Dossiers de vérification d&apos;identité (CIN) soumis par les citoyens.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['en_attente', 'refusee', 'verifiee'] as StatutFiltre[]).map(f => (
            <button
              key={f}
              onClick={() => setFiltre(f)}
              style={{
                padding: '8px 14px', borderRadius: D.radiusSm, border: `1px solid ${filtre === f ? STATUT_LABEL[f].color : D.border}`,
                backgroundColor: filtre === f ? STATUT_LABEL[f].bg : D.surface2, color: filtre === f ? STATUT_LABEL[f].color : D.textSub,
                fontSize: '12.5px', fontWeight: '700', cursor: 'pointer',
              }}
            >
              {STATUT_LABEL[f].label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '360px' }}>
          <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>{Ic.Search(D.textMuted)}</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un citoyen…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface2, color: D.text, fontSize: '12.5px' }}
          />
        </div>
      </div>

      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24} /></div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucun dossier {STATUT_LABEL[filtre].label.toLowerCase()}</div>
        ) : (
          <DataTable
            cols={[
              { key: 'nom', label: 'Citoyen', width: '32%' },
              { key: 'phone', label: 'Téléphone', width: '22%' },
              { key: 'soumis', label: 'Soumis le', width: '24%' },
              { key: 'statut', label: 'Statut', width: '22%' },
            ]}
            onRowClick={row => setSelectedId(row.id as unknown as string)}
            rows={items.map(it => {
              const s = statutDe(it)
              return {
                id: it.id as unknown as React.ReactNode,
                nom: <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{[it.prenom, it.nom].filter(Boolean).join(' ') || '—'}</span>,
                phone: <span style={{ color: D.textSub, fontSize: '12px' }}>{it.phone || '—'}</span>,
                soumis: <span style={{ color: D.textMuted, fontSize: '11.5px' }}>{new Date(it.cin_soumis_le).toLocaleString('fr-FR')}</span>,
                statut: <Badge label={STATUT_LABEL[s].label} color={STATUT_LABEL[s].color} bg={STATUT_LABEL[s].bg} />,
              }
            })}
          />
        )}
      </div>

      <SlidePanel open={!!selectedId} onClose={() => setSelectedId(null)} title="Dossier d'identité" width="480px">
        {selectedId && (
          <DossierPanel
            citoyenId={selectedId}
            toast={toast}
            onDecided={() => { setSelectedId(null); load(filtre, search) }}
          />
        )}
      </SlidePanel>
    </div>
  )
}

function fieldRow(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${D.border}`, gap: '12px' }}>
      <span style={{ fontSize: '12px', color: D.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: '600', color: D.text, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function DossierPanel({ citoyenId, toast, onDecided }: {
  citoyenId: string
  toast: (message: string, type?: ToastItem['type']) => void
  onDecided: () => void
}) {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [refusMode, setRefusMode] = useState(false)
  const [motif, setMotif] = useState('')
  const [submitting, setSubmitting] = useState<'verifiee' | 'refusee' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/citoyens-identite/${citoyenId}`)
      if (res.ok) setDossier(await res.json())
      else toast('Impossible de charger le dossier', 'error')
    } finally { setLoading(false) }
  }, [citoyenId, toast])
  useEffect(() => { load() }, [load])

  async function decider(decision: 'verifiee' | 'refusee') {
    if (decision === 'refusee' && !motif.trim()) return
    setSubmitting(decision)
    try {
      const res = await fetch(`/api/admin/citoyens-identite/${citoyenId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, motif: decision === 'refusee' ? motif.trim() : undefined }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast(decision === 'verifiee' ? 'Identité vérifiée — citoyen notifié.' : 'Document refusé — citoyen notifié.')
        onDecided()
      } else {
        toast(body?.error || 'Erreur — décision non enregistrée', 'error')
      }
    } catch {
      toast('Erreur réseau — décision non enregistrée', 'error')
    } finally { setSubmitting(null) }
  }

  if (loading || !dossier) {
    return <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24} /></div>
  }

  const s = dossier.identite_verifiee ? 'verifiee' : dossier.cin_statut === 'refusee' ? 'refusee' : 'en_attente'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
        {fieldRow('Nom', [dossier.prenom, dossier.nom].filter(Boolean).join(' ') || '—')}
        {fieldRow('Téléphone', dossier.phone || '—')}
        {fieldRow('Membre depuis', new Date(dossier.created_at).toLocaleDateString('fr-FR'))}
        {fieldRow('Soumis le', new Date(dossier.cin_soumis_le).toLocaleString('fr-FR'))}
        {fieldRow('Statut', s === 'verifiee' ? 'Vérifiée' : s === 'refusee' ? 'Refusée' : 'En attente')}
      </div>

      <div>
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: D.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Pièces déposées</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {([
            { label: 'Recto CIN', url: dossier.recto_url },
            { label: 'Verso CIN', url: dossier.verso_url },
            { label: 'Photo de la personne', url: dossier.selfie_url },
          ] as const).map(d => (
            d.url ? (
              <a key={d.label} href={d.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: D.blue, textDecoration: 'none', padding: '10px 12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                {Ic.Eye(D.blue)} {d.label} — aperçu sécurisé (lien valide 60s)
              </a>
            ) : (
              <p key={d.label} style={{ margin: 0, fontSize: '12px', color: D.textMuted, fontStyle: 'italic', padding: '10px 12px' }}>{d.label} — manquant.</p>
            )
          ))}
        </div>
      </div>

      {s === 'refusee' && dossier.cin_motif_refus && (
        <div style={{ padding: '10px 12px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm }}>
          <p style={{ margin: 0, fontSize: '11.5px', color: D.textSub, lineHeight: 1.5 }}>Motif du refus : {dossier.cin_motif_refus}</p>
        </div>
      )}

      {s === 'en_attente' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!refusMode ? (
            <>
              <button
                disabled={!!submitting}
                onClick={() => decider('verifiee')}
                style={{ padding: '11px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '13px', fontWeight: '700', cursor: submitting ? 'default' : 'pointer' }}
              >
                {submitting === 'verifiee' ? 'Enregistrement…' : "Vérifier l'identité"}
              </button>
              <button
                disabled={!!submitting}
                onClick={() => setRefusMode(true)}
                style={{ padding: '11px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', fontWeight: '700', cursor: submitting ? 'default' : 'pointer' }}
              >
                Refuser
              </button>
            </>
          ) : (
            <>
              <textarea
                value={motif}
                onChange={e => setMotif(e.target.value)}
                rows={3}
                placeholder="Motif du refus (obligatoire, transmis tel quel au citoyen)…"
                style={{ padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', resize: 'none' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={!motif.trim() || !!submitting}
                  onClick={() => decider('refusee')}
                  style={{ flex: 1, padding: '11px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, color: D.red, fontSize: '13px', fontWeight: '700', cursor: !motif.trim() || submitting ? 'default' : 'pointer', opacity: !motif.trim() ? 0.5 : 1 }}
                >
                  {submitting === 'refusee' ? 'Envoi…' : 'Confirmer le refus'}
                </button>
                <button
                  disabled={!!submitting}
                  onClick={() => { setRefusMode(false); setMotif('') }}
                  style={{ flex: 1, padding: '11px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Annuler
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
