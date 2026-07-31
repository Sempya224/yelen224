'use client'

// Modération des publications "Yelen Community" (chantier 26/07/2026) —
// mirroring exact de app/admin/offres/page.tsx. Les citoyens publient
// depuis /communaute, jamais l'admin : ici on approuve ou refuse.
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'
import { YelenLoader } from '@/components/YelenLoader'
import { POST_CATEGORIE_LABELS, type PostCategorie } from '@/lib/communauteCategories'

type Post = {
  id: string; auteur_id: string; categorie: string; author_nom: string; author_photo_url: string | null;
  author_verifie: boolean; author_membre_depuis: string;
  contenu: string | null; images: string[] | null;
  statut: string; motif_refus: string | null; soumis_le: string; valide_le: string | null;
  nb_partages: number; created_at: string;
}

const STATUT_FILTERS = [
  { key: 'en_attente_validation', label: 'En attente' },
  { key: 'publiee',               label: 'Publiées' },
  { key: 'refusee',               label: 'Refusées' },
  { key: 'tous',                  label: 'Toutes' },
] as const

const STATUT_INFO: Record<string, { label: string; color: string; bg: string }> = {
  en_attente_validation: { label: 'En attente', color: D.yellow, bg: D.yellowDim },
  publiee:               { label: 'Publiée',    color: D.green,  bg: D.greenDim },
  refusee:               { label: 'Refusée',    color: D.red,    bg: D.redDim },
}

export default function PostsModerationPage() {
  const [statut, setStatut] = useState<(typeof STATUT_FILTERS)[number]['key']>('en_attente_validation')
  const [items, setItems] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [motifId, setMotifId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/posts?statut=${statut}&limit=100`)
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j ?? []) : [])
    setLoading(false)
  }, [statut])

  useEffect(() => { load() }, [load])

  async function approuver(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/admin/posts/${id}/approuver`, { method: 'POST' })
    setBusyId(null)
    if (res.ok) load()
  }

  async function refuser(id: string) {
    if (!motif.trim()) return
    setBusyId(id)
    const res = await fetch(`/api/admin/posts/${id}/refuser`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motif }),
    })
    setBusyId(null)
    if (res.ok) { setMotifId(null); setMotif(''); load() }
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Modération de la Communauté</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Publications soumises par des membres vérifiés — vérifiez la conformité avant publication.
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
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune publication pour ce filtre.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(o => {
            const si = STATUT_INFO[o.statut] ?? { label: o.statut, color: D.textSub, bg: D.surface2 }
            return (
              <div key={o.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ backgroundColor: si.bg, color: si.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{si.label}</span>
                  <span style={{ backgroundColor: D.surface2, color: D.textSub, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{POST_CATEGORIE_LABELS[o.categorie as PostCategorie] || o.categorie}</span>
                  <span style={{ color: D.text, fontSize: '13px', fontWeight: 600 }}>{o.author_nom}</span>
                  <span style={{ color: D.textMuted, fontSize: '12px' }}>{o.nb_partages} partage{o.nb_partages > 1 ? 's' : ''}</span>
                </div>
                {o.contenu && <p style={{ color: D.text, fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{o.contenu}</p>}
                {o.images && o.images.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 8px' }}>
                    {o.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${D.border}` }} />
                    ))}
                  </div>
                )}
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
