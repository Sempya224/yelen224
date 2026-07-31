'use client'

// Page "Citoyens" — extraite de l'ancien monolithe app/admin/page.tsx
// (chantier refonte admin 26/07/2026, Lot D). Consomme
// app/api/admin/citoyens/route.ts.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { DataTable, exportCSV } from '@/app/admin/adminUiKit'

export default function CitoyensPage() {
  const [data, setData] = useState<{id:string,nom:string,prenom:string,phone:string,email:string,created_at:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '25', page: String(page) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/citoyens?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [search, page])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Citoyens</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} résultats</p>
        </div>
        <button onClick={() => exportCSV('citoyens')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
          {Ic.Download(D.textSub)} Exporter
        </button>
      </div>
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>{Ic.Search(D.textMuted)}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, prénom, téléphone..."
          style={{ width: '100%', padding: '9px 12px 9px 32px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
        ) : (
          <DataTable
            cols={[
              { key: 'nom',     label: 'Nom complet', width: '30%' },
              { key: 'phone',   label: 'Téléphone',   width: '20%' },
              { key: 'email',   label: 'Email',        width: '25%' },
              { key: 'date',    label: 'Inscrit le',   width: '15%' },
              { key: 'actions', label: 'Actions',      width: '10%' },
            ]}
            rows={data.map(u => ({
              nom:     <span style={{ fontWeight: '600', color: D.text }}>{u.prenom} {u.nom}</span>,
              phone:   <span style={{ color: D.textSub, fontFamily: 'monospace', fontSize: '12px' }}>{u.phone || '—'}</span>,
              email:   <span style={{ color: D.textMuted, fontSize: '12px' }}>{u.email || '—'}</span>,
              date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</span>,
              actions: (
                <button style={{ padding: '4px 8px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                  Voir
                </button>
              ),
            }))}
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
