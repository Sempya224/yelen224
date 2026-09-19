'use client'

// Page "Gestion des admins" — extraite de l'ancien monolithe
// app/admin/page.tsx (chantier refonte admin 26/07/2026, Lot D). Écran le
// plus sensible du panel (gère les identifiants des autres admins) —
// gate déjà appliqué côté serveur (app/api/admin/admins/route.ts,
// super_admin uniquement) : un rôle non autorisé reçoit un tableau vide
// et le message "Accès super_admin requis" ci-dessous, pas de redirection
// client nécessaire en plus.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, SlidePanel, ToastContainer, timeAgo } from '@/app/admin/adminUiKit'
import type { AdminUser, ToastItem } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'

export default function AdminsPage() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const [data, setData] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', password: '', nom: '', prenom: '', role: 'support' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/admins')
      if (res.ok) setData(await res.json())
      else setData([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function createAdmin() {
    if (!form.email || !form.password) { toast('Email et mot de passe requis', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/admins', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(form) })
      if (res.ok) { toast('Admin créé'); setPanel(null); setForm({ email:'', password:'', nom:'', prenom:'', role:'support' }); load() }
      else { const d = await res.json(); toast(d.error || 'Erreur', 'error') }
    } finally { setSaving(false) }
  }

  async function toggleActive(id: string, active: boolean) {
    const res = await fetch(`/api/admin/admins/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_active: !active }) })
    if (res.ok) { toast(active ? 'Admin désactivé' : 'Admin réactivé'); load() }
    else toast('Erreur', 'error')
  }

  async function deleteAdmin(id: string) {
    if (!confirm('Supprimer cet admin ?')) return
    const res = await fetch(`/api/admin/admins/${id}`, { method: 'DELETE' })
    if (res.ok) { toast('Admin supprimé'); load() }
    else toast('Erreur suppression', 'error')
  }

  const roleColor: Record<string, { color: string, bg: string }> = {
    super_admin: { color: D.yellow, bg: D.yellowDim },
    admin:       { color: D.blue,   bg: D.blueDim   },
    support:     { color: D.green,  bg: D.greenDim  },
    moderateur:  { color: D.purple, bg: D.purpleDim },
  }

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Gestion des admins</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} compte(s) administrateur</p>
        </div>
        <button onClick={() => setPanel('create')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, fontSize: '12px', color: '#000', fontWeight: '700', cursor: 'pointer' }}>
          + Nouvel admin
        </button>
      </div>

      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24}/></div>
        ) : data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Accès super_admin requis pour lister les admins</div>
        ) : (
          <DataTable
            cols={[
              { key: 'nom',       label: 'Nom',         width: '22%' },
              { key: 'email',     label: 'Email',       width: '25%' },
              { key: 'role',      label: 'Rôle',        width: '15%' },
              { key: 'statut',    label: 'Statut',      width: '12%' },
              { key: 'derniere',  label: 'Dernière connexion', width: '16%' },
              { key: 'actions',   label: 'Actions',     width: '10%' },
            ]}
            rows={data.map(a => {
              const rc = roleColor[a.role] || { color: D.textMuted, bg: D.surface3 }
              return {
                nom:      <div style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{[a.prenom, a.nom].filter(Boolean).join(' ') || '—'}</div>,
                email:    <span style={{ color: D.textSub, fontSize: '12px', fontFamily: 'monospace' }}>{a.email}</span>,
                role:     <Badge label={a.role.replace('_', ' ')} color={rc.color} bg={rc.bg}/>,
                statut:   <Badge label={a.is_active ? 'Actif' : 'Inactif'} color={a.is_active ? D.green : D.red} bg={a.is_active ? D.greenDim : D.redDim}/>,
                derniere: <span style={{ color: D.textMuted, fontSize: '11px' }}>{a.last_login ? timeAgo(a.last_login) : 'Jamais'}</span>,
                actions:  (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleActive(a.id, a.is_active)} style={{ padding: '4px 7px', backgroundColor: a.is_active ? D.redDim : D.greenDim, border: `1px solid ${a.is_active ? D.redBrd : D.greenBrd}`, borderRadius: '5px', color: a.is_active ? D.red : D.green, fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
                      {a.is_active ? 'Désact.' : 'Réact.'}
                    </button>
                    <button onClick={() => deleteAdmin(a.id)} style={{ padding: '4px 6px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: '5px', color: D.textMuted, fontSize: '11px', cursor: 'pointer' }}>
                      {Ic.X(D.textMuted)}
                    </button>
                  </div>
                ),
              }
            })}
          />
        )}
      </div>

      <SlidePanel open={panel === 'create'} onClose={() => setPanel(null)} title="Créer un compte admin" width="460px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ padding: '12px 14px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm }}>
            <p style={{ margin: 0, fontSize: '12px', color: D.red, fontWeight: '600' }}>Accès super_admin requis. Ce formulaire crée un compte avec accès complet au dashboard.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Prénom</label>
              <input value={form.prenom} onChange={e => setForm(f => ({...f, prenom: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Nom</label>
              <input value={form.nom} onChange={e => setForm(f => ({...f, nom: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="admin@yelen224.com" style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Mot de passe *</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Minimum 8 caractères" style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Rôle</label>
            <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}>
              <option value="support">Support</option>
              <option value="moderateur">Modérateur</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button onClick={createAdmin} disabled={saving} style={{ flex: 1, padding: '11px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, color: '#000', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {saving ? <><YelenLoader size={12} color="#000"/>Création…</> : 'Créer le compte'}
            </button>
            <button onClick={() => setPanel(null)} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      </SlidePanel>
    </div>
  )
}
