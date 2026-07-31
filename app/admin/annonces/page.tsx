'use client'

// Page "Annonces" — extraite de l'ancien monolithe app/admin/page.tsx
// (chantier refonte admin 26/07/2026, Lot F). Consomme
// app/api/admin/annonces/route.ts + [id].
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { Annonce, ToastItem } from '@/app/admin/adminTypes'

export default function AnnoncesPage() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const [data, setData] = useState<Annonce[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tous')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [panel, setPanel] = useState<string | null>(null)
  const [selected, setSelected] = useState<Annonce | null>(null)
  const [form, setForm] = useState({ titre: '', contenu: '', type: 'information', statut: 'publiee', date_expiration: '', epingle: false })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '25', page: String(page) })
      if (filter !== 'tous') params.set('statut', filter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/annonces?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [filter, search, page])

  useEffect(() => { load() }, [load])

  async function saveAnnonce() {
    if (!form.titre.trim() || !form.contenu.trim()) { toast('Titre et contenu requis', 'error'); return }
    setSaving(true)
    try {
      const url = selected ? `/api/admin/annonces/${selected.id}` : '/api/admin/annonces'
      const method = selected ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (res.ok) {
        toast(selected ? 'Annonce modifiée' : 'Annonce créée')
        setPanel(null); setSelected(null)
        setForm({ titre: '', contenu: '', type: 'information', statut: 'publiee', date_expiration: '', epingle: false })
        load()
      } else toast('Erreur sauvegarde', 'error')
    } finally { setSaving(false) }
  }

  async function deleteAnnonce(id: string) {
    if (!confirm('Supprimer cette annonce ?')) return
    const res = await fetch(`/api/admin/annonces/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Annonce supprimée'); load() }
    else toast('Erreur suppression', 'error')
  }

  async function togglePin(ann: Annonce) {
    await fetch(`/api/admin/annonces/${ann.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ epingle: !ann.epingle }) })
    load()
  }

  const typeColor: Record<string, { color: string, bg: string }> = {
    information: { color: D.blue,   bg: D.blueDim   },
    urgent:      { color: D.red,    bg: D.redDim    },
    evenement:   { color: D.purple, bg: D.purpleDim },
    alerte:      { color: D.orange, bg: D.orangeDim },
  }

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Annonces</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} annonce(s)</p>
        </div>
        <button onClick={() => { setSelected(null); setForm({ titre:'', contenu:'', type:'information', statut:'publiee', date_expiration:'', epingle:false }); setPanel('form') }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, fontSize: '12px', color: '#000', fontWeight: '700', cursor: 'pointer' }}>
          + Nouvelle annonce
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>{Ic.Search(D.textMuted)}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ width: '100%', padding: '8px 12px 8px 32px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['tous','publiee','archivee'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{ padding: '8px 14px', borderRadius: D.radiusSm, fontSize: '12px', fontWeight: filter === f ? '700' : '400', backgroundColor: filter === f ? D.yellow : D.surface2, color: filter === f ? '#000' : D.textSub, border: `1px solid ${filter === f ? D.yellow : D.border}`, cursor: 'pointer' }}>
              {f === 'tous' ? 'Toutes' : f === 'publiee' ? 'Publiées' : 'Archivées'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Chargement...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Aucune annonce</div>
        ) : (
          <DataTable
            cols={[
              { key: 'titre',  label: 'Titre',       width: '30%' },
              { key: 'type',   label: 'Type',        width: '12%' },
              { key: 'statut', label: 'Statut',      width: '12%' },
              { key: 'vues',   label: 'Vues',        width: '10%' },
              { key: 'epingle',label: 'Épinglée',    width: '10%' },
              { key: 'date',   label: 'Date',        width: '14%' },
              { key: 'actions',label: 'Actions',     width: '12%' },
            ]}
            rows={data.map(ann => {
              const tc = typeColor[ann.type] || { color: D.textMuted, bg: D.surface3 }
              return {
                titre:   <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{ann.titre}</span>,
                type:    <Badge label={ann.type} color={tc.color} bg={tc.bg}/>,
                statut:  <Badge label={ann.statut} color={ann.statut === 'publiee' ? D.green : D.textMuted} bg={ann.statut === 'publiee' ? D.greenDim : D.surface3}/>,
                vues:    <span style={{ color: D.textSub, fontSize: '12px' }}>{ann.nb_vues || 0}</span>,
                epingle: <span style={{ color: ann.epingle ? D.yellow : D.textMuted, cursor: 'pointer' }} onClick={() => togglePin(ann)}>{ann.epingle ? '★' : '☆'}</span>,
                date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(ann.created_at).toLocaleDateString('fr-FR')}</span>,
                actions: (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setSelected(ann); setForm({ titre: ann.titre, contenu: ann.contenu, type: ann.type, statut: ann.statut, date_expiration: ann.date_expiration || '', epingle: ann.epingle }); setPanel('form') }} style={{ padding: '4px 7px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', cursor: 'pointer' }}>
                      Éditer
                    </button>
                    <button onClick={() => deleteAnnonce(ann.id)} style={{ padding: '4px 7px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: '5px', color: D.red, fontSize: '11px', cursor: 'pointer' }}>
                      {Ic.X(D.red)}
                    </button>
                  </div>
                ),
              }
            })}
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

      <SlidePanel open={panel === 'form'} onClose={() => setPanel(null)} title={selected ? "Modifier l'annonce" : 'Nouvelle annonce'} width="500px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Titre *</label>
            <input value={form.titre} onChange={e => setForm(f => ({...f, titre: e.target.value}))} placeholder="Titre de l'annonce" style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Contenu *</label>
            <textarea value={form.contenu} onChange={e => setForm(f => ({...f, contenu: e.target.value}))} rows={5} placeholder="Contenu de l'annonce..." style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, resize: 'vertical', outline: 'none', fontFamily: D.font, boxSizing: 'border-box' }}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}>
                <option value="information">Information</option>
                <option value="urgent">Urgent</option>
                <option value="evenement">Événement</option>
                <option value="alerte">Alerte</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Statut</label>
              <select value={form.statut} onChange={e => setForm(f => ({...f, statut: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}>
                <option value="publiee">Publiée</option>
                <option value="archivee">Archivée</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Date d&apos;expiration (optionnel)</label>
            <input type="date" value={form.date_expiration} onChange={e => setForm(f => ({...f, date_expiration: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.epingle} onChange={e => setForm(f => ({...f, epingle: e.target.checked}))} style={{ width: '16px', height: '16px', cursor: 'pointer' }}/>
            <span style={{ fontSize: '13px', color: D.textSub }}>Épingler en haut</span>
          </label>
          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button onClick={saveAnnonce} disabled={saving} style={{ flex: 1, padding: '11px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, color: '#000', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Sauvegarde...' : selected ? 'Enregistrer' : "Créer l'annonce"}
            </button>
            <button onClick={() => setPanel(null)} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      </SlidePanel>
    </div>
  )
}
