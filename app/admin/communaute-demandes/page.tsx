'use client'

// File de modération des demandes d'adhésion à Yelen Community
// (institutions, 23/08/2026). Gabarit calqué sur
// app/admin/partenariats/page.tsx — même flux (soumission institution →
// file admin → approuver/refuser avec motif).
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'
import { YelenLoader } from '@/components/YelenLoader'

type Demande = {
  id: string; institution_id: string; intention: string;
  contact_nom: string; contact_email: string; contact_telephone: string | null;
  statut: string; motif_refus: string | null; created_at: string;
  institutions: { name: string; logo: string | null; ville: string; secteur: string } | null;
}

const STATUT_FILTERS = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'approuve',   label: 'Approuvées' },
  { key: 'refuse',     label: 'Refusées' },
  { key: 'tous',       label: 'Toutes' },
] as const

export default function CommunauteDemandesPage() {
  const [statut, setStatut] = useState<(typeof STATUT_FILTERS)[number]['key']>('en_attente')
  const [items, setItems] = useState<Demande[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [motifId, setMotifId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/communaute-demandes?statut=${statut}`)
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j ?? []) : [])
    setLoading(false)
  }, [statut])

  useEffect(() => { load() }, [load])

  async function valider(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/admin/communaute-demandes/${id}/valider`, { method: 'POST' })
    setBusyId(null)
    if (res.ok) load()
  }

  async function refuser(id: string) {
    if (!motif.trim()) return
    setBusyId(id)
    const res = await fetch(`/api/admin/communaute-demandes/${id}/refuser`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motif }),
    })
    setBusyId(null)
    if (res.ok) { setMotifId(null); setMotif(''); load() }
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Demandes d&apos;adhésion à Yelen Community</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Institutions souhaitant publier dans le fil communautaire des citoyens Yelen.
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
        <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={26}/></div>
      ) : items.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune demande pour ce filtre.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(d => (
            <div key={d.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ color: D.text, fontSize: '14px', fontWeight: 700 }}>{d.institutions?.name ?? '—'}</span>
                <span style={{ color: D.textMuted, fontSize: '12px' }}>{d.institutions?.ville}</span>
              </div>
              <p style={{ color: D.textSub, fontSize: '13px', lineHeight: 1.6, margin: '0 0 8px' }}><strong style={{ color: D.text }}>Intention : </strong>{d.intention}</p>
              <p style={{ color: D.textSub, fontSize: '13px', lineHeight: 1.6, margin: '0 0 12px' }}><strong style={{ color: D.text }}>Contact : </strong>{d.contact_nom} — {d.contact_email}{d.contact_telephone ? ` — ${d.contact_telephone}` : ''}</p>

              {d.statut === 'refuse' && d.motif_refus && (
                <p style={{ color: D.red, fontSize: '12.5px', marginBottom: '12px' }}>Motif du refus : {d.motif_refus}</p>
              )}

              {d.statut === 'en_attente' && (
                <>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: motifId === d.id ? '10px' : 0 }}>
                    <button
                      onClick={() => valider(d.id)}
                      disabled={busyId === d.id}
                      style={{ background: D.greenDim, border: `1px solid ${D.green}30`, color: D.green, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: busyId === d.id ? 'default' : 'pointer', opacity: busyId === d.id ? 0.75 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {busyId === d.id ? <YelenLoader size={13} color={D.green}/> : 'Approuver'}
                    </button>
                    <button
                      onClick={() => setMotifId(motifId === d.id ? null : d.id)}
                      style={{ background: D.redDim, border: `1px solid ${D.red}30`, color: D.red, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer' }}
                    >
                      Refuser
                    </button>
                  </div>
                  {motifId === d.id && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        value={motif}
                        onChange={e => setMotif(e.target.value)}
                        placeholder="Motif du refus (requis)"
                        style={{ flex: 1, background: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '8px 12px', color: D.text, fontSize: '12.5px' }}
                      />
                      <button
                        onClick={() => refuser(d.id)}
                        disabled={busyId === d.id || !motif.trim()}
                        style={{ background: D.red, border: 'none', color: '#fff', fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: (busyId === d.id || !motif.trim()) ? 'default' : 'pointer', opacity: (busyId === d.id || !motif.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {busyId === d.id ? <YelenLoader size={13} color="#fff"/> : 'Confirmer'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
