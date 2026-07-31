'use client'

// Modération des offres partenaires (chantier 26/07/2026) — évolution du
// CRUD d'origine. L'admin ne rédige plus d'offres (elles viennent des
// partenaires via leur dashboard, cf. MesOffresTab.tsx) : ici on approuve,
// refuse, suspend ou supprime.
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'
import { YelenLoader } from '@/components/YelenLoader'
import { OFFRE_GENRE_LABELS } from '@/lib/offresCategories'

type Offre = {
  id: string; titre: string; description_courte: string; description_longue: string;
  categorie: string; genre: string; partenaire_nom: string; partenaire_logo: string | null;
  cta_url: string | null; statut: string; motif_refus: string | null; nb_clics: number;
  created_at: string; institution_id: string;
  faits: { label: string; valeur: string }[]; avantages: string[]; limites: string[];
  institutions: { name: string; logo: string | null; ville: string } | null;
}

const STATUT_FILTERS = [
  { key: 'en_attente_validation', label: 'En attente' },
  { key: 'publiee',               label: 'Publiées' },
  { key: 'refusee',               label: 'Refusées' },
  { key: 'suspendue',             label: 'Suspendues' },
  { key: 'tous',                  label: 'Toutes' },
] as const

const STATUT_INFO: Record<string, { label: string; color: string; bg: string }> = {
  en_attente_validation: { label: 'En attente', color: D.yellow, bg: D.yellowDim },
  publiee:               { label: 'Publiée',    color: D.green,  bg: D.greenDim },
  refusee:               { label: 'Refusée',    color: D.red,    bg: D.redDim },
  suspendue:             { label: 'Suspendue',  color: D.red,    bg: D.redDim },
  brouillon:             { label: 'Brouillon',  color: D.textSub, bg: D.surface2 },
  archivee:              { label: 'Archivée',   color: D.textMuted, bg: D.surface2 },
}

export default function OffresModerationPage() {
  const [statut, setStatut] = useState<(typeof STATUT_FILTERS)[number]['key']>('en_attente_validation')
  const [items, setItems] = useState<Offre[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [motifId, setMotifId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/offres?statut=${statut}&limit=100`)
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j ?? []) : [])
    setLoading(false)
  }, [statut])

  useEffect(() => { load() }, [load])

  async function approuver(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/admin/offres/${id}/approuver`, { method: 'POST' })
    setBusyId(null)
    if (res.ok) load()
  }

  async function refuser(id: string) {
    if (!motif.trim()) return
    setBusyId(id)
    const res = await fetch(`/api/admin/offres/${id}/refuser`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motif }),
    })
    setBusyId(null)
    if (res.ok) { setMotifId(null); setMotif(''); load() }
  }

  async function suspendre(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/admin/offres/${id}/suspendre`, { method: 'POST' })
    setBusyId(null)
    if (res.ok) load()
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer définitivement cette offre ?')) return
    setBusyId(id)
    const res = await fetch(`/api/admin/offres/${id}`, { method: 'DELETE' })
    setBusyId(null)
    if (res.ok) setItems(prev => prev.filter(o => o.id !== id))
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Modération des offres</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Offres soumises par les partenaires approuvés — vérifiez la conformité avant publication.
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
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune offre pour ce filtre.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(o => {
            const si = STATUT_INFO[o.statut] ?? { label: o.statut, color: D.textSub, bg: D.surface2 }
            return (
              <div key={o.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ backgroundColor: si.bg, color: si.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{si.label}</span>
                  <span style={{ backgroundColor: D.surface2, color: D.textSub, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{OFFRE_GENRE_LABELS[o.genre as keyof typeof OFFRE_GENRE_LABELS] || o.genre}</span>
                  <span style={{ color: D.text, fontSize: '13px', fontWeight: 600 }}>{o.institutions?.name ?? o.partenaire_nom}</span>
                  <span style={{ color: D.textMuted, fontSize: '12px' }}>{o.nb_clics} clic{o.nb_clics > 1 ? 's' : ''}</span>
                </div>
                <div style={{ color: D.text, fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{o.titre}</div>
                <p style={{ color: D.textSub, fontSize: '13px', lineHeight: 1.6, margin: '0 0 6px' }}>{o.description_longue}</p>
                {o.faits?.length > 0 && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '0 0 8px' }}>
                    {o.faits.map((f, i) => (
                      <span key={i} style={{ fontSize: '11.5px', color: D.textSub, background: D.surface2, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '3px 8px' }}>
                        <strong style={{ color: D.text }}>{f.label}</strong> : {f.valeur}
                      </span>
                    ))}
                  </div>
                )}
                {(o.avantages?.length > 0 || o.limites?.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '0 0 8px' }}>
                    {o.avantages?.length > 0 && (
                      <div>
                        <div style={{ color: D.green, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Avantages</div>
                        {o.avantages.map((a, i) => <div key={i} style={{ color: D.textSub, fontSize: '12px' }}>• {a}</div>)}
                      </div>
                    )}
                    {o.limites?.length > 0 && (
                      <div>
                        <div style={{ color: D.orange, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Limites</div>
                        {o.limites.map((l, i) => <div key={i} style={{ color: D.textSub, fontSize: '12px' }}>• {l}</div>)}
                      </div>
                    )}
                  </div>
                )}
                {o.cta_url && <a href={o.cta_url} target="_blank" rel="noopener noreferrer" style={{ color: D.blue, fontSize: '12px' }}>{o.cta_url}</a>}
                {o.statut === 'refusee' && o.motif_refus && (
                  <p style={{ color: D.red, fontSize: '12.5px', margin: '8px 0 0' }}>Motif du refus : {o.motif_refus}</p>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {o.statut === 'en_attente_validation' && (
                    <>
                      <button onClick={() => approuver(o.id)} disabled={busyId === o.id} style={{ background: D.greenDim, border: `1px solid ${D.green}30`, color: D.green, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: busyId === o.id ? 'default' : 'pointer', opacity: busyId === o.id ? 0.75 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>{busyId === o.id ? <YelenLoader size={13} color={D.green}/> : 'Approuver'}</button>
                      <button onClick={() => setMotifId(motifId === o.id ? null : o.id)} style={{ background: D.redDim, border: `1px solid ${D.red}30`, color: D.red, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer' }}>Refuser</button>
                    </>
                  )}
                  {o.statut === 'publiee' && (
                    <button onClick={() => suspendre(o.id)} disabled={busyId === o.id} style={{ background: D.redDim, border: `1px solid ${D.red}30`, color: D.red, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: busyId === o.id ? 'default' : 'pointer', opacity: busyId === o.id ? 0.75 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>{busyId === o.id ? <YelenLoader size={13} color={D.red}/> : 'Suspendre'}</button>
                  )}
                  <button onClick={() => supprimer(o.id)} disabled={busyId === o.id} style={{ background: D.surface2, border: `1px solid ${D.border2}`, color: D.textSub, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: busyId === o.id ? 'default' : 'pointer', opacity: busyId === o.id ? 0.75 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>{busyId === o.id ? <YelenLoader size={13} color={D.textSub}/> : 'Supprimer'}</button>
                </div>

                {motifId === o.id && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <input
                      value={motif}
                      onChange={e => setMotif(e.target.value)}
                      placeholder="Motif du refus (requis)"
                      style={{ flex: 1, background: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '8px 12px', color: D.text, fontSize: '12.5px' }}
                    />
                    <button
                      onClick={() => refuser(o.id)}
                      disabled={busyId === o.id || !motif.trim()}
                      style={{ background: D.red, border: 'none', color: '#fff', fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: (busyId === o.id || !motif.trim()) ? 'default' : 'pointer', opacity: (busyId === o.id || !motif.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {busyId === o.id ? <YelenLoader size={13} color="#fff"/> : 'Confirmer'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
