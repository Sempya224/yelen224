'use client'

import { useEffect, useState } from 'react'
import { enrolerCredentialEntreeAdmin } from '@/lib/adminEntryClient'

// Admin Entry Security V2 — Lot 3 + lot dédié gestion (30/08/2026). Sous
// /admin/*, protégée par la garde de session admin déjà en place dans
// proxy.ts (rien à y ajouter pour cette page précise).
// Aucun window.confirm/prompt (règle UX projet, docs/ui/YELEN_UX_RULES.md) —
// renommage en édition inline, révocation en confirmation à 2 clics.
type Credential = { id: string; device_label: string | null; created_at: string; last_used_at: string | null }

export default function AdminSecurityEntree() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [enroling, setEnroling] = useState(false)
  const [message, setMessage] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function charger() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/entry/webauthn/list')
      const data = await res.json()
      if (res.ok) setCredentials(data.credentials || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { charger() }, [])

  async function handleEnroler() {
    setEnroling(true)
    setMessage('')
    const res = await enrolerCredentialEntreeAdmin(deviceLabel.trim() || undefined)
    setEnroling(false)
    if (res.ok) {
      setMessage('Appareil enregistré.')
      setDeviceLabel('')
      charger()
    } else {
      setMessage(res.reason === 'cancelled' ? 'Enregistrement annulé.' : "Erreur lors de l'enregistrement.")
    }
  }

  function commencerRenommer(c: Credential) {
    setEditingId(c.id)
    setEditValue(c.device_label || '')
    setConfirmingRevokeId(null)
  }

  async function confirmerRenommer(id: string) {
    if (!editValue.trim()) return
    setBusyId(id)
    const res = await fetch('/api/admin/entry/webauthn/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, deviceLabel: editValue.trim() }),
    })
    setBusyId(null)
    if (res.ok) {
      setEditingId(null)
      charger()
    } else {
      setMessage('Erreur lors du renommage.')
    }
  }

  async function confirmerRevoquer(id: string) {
    setBusyId(id)
    const res = await fetch('/api/admin/entry/webauthn/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusyId(null)
    setConfirmingRevokeId(null)
    if (res.ok) {
      charger()
    } else {
      setMessage('Erreur lors de la révocation.')
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#fff' }}>Accès rapide administration (WebAuthn)</h1>
      <p style={{ color: '#666', fontSize: 13.5, marginBottom: 24, lineHeight: 1.5 }}>
        Ces appareils peuvent ouvrir /entree-admin sans passer par le lien secret.
        Ils ne remplacent jamais le mot de passe ni la double authentification.
        Au moins 2 appareils fonctionnels sont requis avant de pouvoir retirer
        le lien secret (ADMIN_ENTRY_TOKEN).
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={deviceLabel}
          onChange={e => setDeviceLabel(e.target.value)}
          placeholder="Nom de l'appareil (ex: PC bureau)"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
        />
        <button
          onClick={handleEnroler}
          disabled={enroling}
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#00a37a', color: '#fff', fontWeight: 600, cursor: enroling ? 'not-allowed' : 'pointer' }}
        >
          {enroling ? 'Enregistrement…' : 'Enregistrer cet appareil'}
        </button>
      </div>

      {message && <p style={{ fontSize: 13, marginBottom: 16, color: '#fff' }}>{message}</p>}

      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#fff' }}>Appareils enregistrés ({credentials.length})</h2>
      {loading ? (
        <p style={{ color: '#666', fontSize: 13 }}>Chargement…</p>
      ) : credentials.length === 0 ? (
        <p style={{ color: '#666', fontSize: 13 }}>Aucun appareil enregistré — le lien secret reste l&apos;unique accès.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {credentials.map(c => (
            <li key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #2e2e2e', fontSize: 13 }}>
              {editingId === c.id ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
                  />
                  <button onClick={() => confirmerRenommer(c.id)} disabled={busyId === c.id} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#00a37a', color: '#fff', cursor: 'pointer' }}>Enregistrer</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#999', cursor: 'pointer' }}>Annuler</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <strong style={{ color: '#fff' }}>{c.device_label || 'Sans nom'}</strong>
                    <div style={{ color: '#666' }}>
                      Ajouté le {new Date(c.created_at).toLocaleString('fr-FR')}
                      {c.last_used_at ? ` — dernière utilisation ${new Date(c.last_used_at).toLocaleString('fr-FR')}` : ' — jamais utilisé'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => commencerRenommer(c)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#999', fontSize: 12, cursor: 'pointer' }}>Renommer</button>
                    {confirmingRevokeId === c.id ? (
                      <button onClick={() => confirmerRevoquer(c.id)} disabled={busyId === c.id} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ff6b6b', background: '#2d1515', color: '#ff6b6b', fontSize: 12, cursor: 'pointer' }}>
                        {busyId === c.id ? 'Révocation…' : 'Confirmer la révocation ?'}
                      </button>
                    ) : (
                      <button onClick={() => setConfirmingRevokeId(c.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#999', fontSize: 12, cursor: 'pointer' }}>Révoquer</button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
