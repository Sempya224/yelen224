'use client'

// Écran admin "Récupération de comptes" — file d'attente des demandes
// soumises depuis /recuperation-compte (téléphone perdu/changé). Modèle
// semi-automatique (retour Bryan 25/07/2026) : approuver démarre un délai
// de sécurité de 48h avant activation auto du nouveau numéro (cron
// appliquer_recuperations_dues, voir la migration
// 20260725000006_citoyen_recuperation_compte.sql) ; "Forcer" reste
// disponible à tout moment — jamais un citoyen bloqué sans recours admin.
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'

type Demande = {
  id: string; type: 'numero' | 'totp'; ancien_phone: string; nouveau_phone: string; prenom: string; nom: string;
  document_url: string | null; compte_trouve: boolean; statut: string;
  date_approbation: string | null; date_activation_prevue: string | null; annule_le: string | null;
  notes_admin: string | null; created_at: string;
}

const STATUT_FILTERS = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'approuve', label: 'Approuvées (délai 48h)' },
  { key: 'applique', label: 'Appliquées' },
  { key: 'refuse', label: 'Rejetées' },
  { key: 'annule', label: 'Annulées' },
  { key: 'tous', label: 'Toutes' },
] as const

const STATUT_INFO: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: 'En attente', color: D.yellow, bg: D.yellowDim },
  approuve: { label: 'Approuvée — délai en cours', color: D.blue, bg: D.blueDim },
  applique: { label: 'Appliquée', color: D.green, bg: D.greenDim },
  refuse: { label: 'Rejetée', color: D.red, bg: D.redDim },
  annule: { label: 'Annulée', color: D.textMuted, bg: D.surface2 },
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function RecuperationComptesPage() {
  const [statut, setStatut] = useState<(typeof STATUT_FILTERS)[number]['key']>('en_attente')
  const [items, setItems] = useState<Demande[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/recuperation?statut=${statut}`)
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j ?? []) : [])
    setLoading(false)
  }, [statut])

  useEffect(() => { load() }, [load])

  async function agir(id: string, action: string, notes?: string) {
    setBusyId(id)
    const res = await fetch('/api/admin/recuperation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, notes }),
    })
    setBusyId(null)
    if (res.ok) load()
    else alert("Action impossible — vérifiez qu'un compte est bien associé (bouton Forcer nécessite un compte trouvé).")
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Récupération de comptes</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Demandes soumises par des citoyens ayant perdu l'accès à leur numéro. Approuver démarre un délai de sécurité de 48h avant l'activation automatique du nouveau numéro — "Forcer" applique immédiatement, à utiliser si l'ancien numéro est définitivement inaccessible.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
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
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune demande pour ce filtre.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(d => {
            const si = STATUT_INFO[d.statut] ?? { label: d.statut, color: D.textSub, bg: D.surface2 }
            const busy = busyId === d.id
            return (
              <div key={d.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: si.bg, color: si.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{si.label}</span>
                    <span style={{ backgroundColor: D.surface2, color: D.textSub, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{d.type === 'totp' ? '2FA inaccessible' : 'Changement de numéro'}</span>
                    <span style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{d.prenom} {d.nom}</span>
                    {!d.compte_trouve && (
                      <span style={{ backgroundColor: D.redDim, color: D.red, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>Aucun compte rapproché</span>
                    )}
                  </div>
                  <span style={{ color: D.textMuted, fontSize: '11px' }}>{timeAgo(d.created_at)}</span>
                </div>

                {d.type === 'totp' ? (
                  <div style={{ background: D.surface2, borderRadius: '10px', padding: '8px 12px', marginBottom: '10px' }}>
                    <div style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Numéro du compte</div>
                    <div style={{ color: D.text, fontSize: '13px', fontWeight: '600' }}>{d.ancien_phone}</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ background: D.surface2, borderRadius: '10px', padding: '8px 12px' }}>
                      <div style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Ancien numéro</div>
                      <div style={{ color: D.text, fontSize: '13px', fontWeight: '600' }}>{d.ancien_phone}</div>
                    </div>
                    <div style={{ background: D.surface2, borderRadius: '10px', padding: '8px 12px' }}>
                      <div style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Nouveau numéro</div>
                      <div style={{ color: D.text, fontSize: '13px', fontWeight: '600' }}>{d.nouveau_phone}</div>
                    </div>
                  </div>
                )}

                {d.date_activation_prevue && d.statut === 'approuve' && (
                  <div style={{ color: D.blue, fontSize: '11.5px', fontWeight: '600', marginBottom: '10px' }}>
                    {d.type === 'totp' ? 'Désactivation automatique de la 2FA prévue' : 'Activation automatique du numéro prévue'} le {new Date(d.date_activation_prevue).toLocaleString('fr-FR')}
                  </div>
                )}

                {d.document_url && (
                  <a href={d.document_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: D.blue, fontSize: '12px', fontWeight: '700', textDecoration: 'none', marginBottom: '12px' }}>
                    📄 Voir la pièce d'identité
                  </a>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {d.statut === 'en_attente' && (
                    <>
                      <button onClick={() => agir(d.id, 'approuver')} disabled={busy} style={{ background: D.greenDim, border: `1px solid ${D.green}30`, color: D.green, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                        {busy ? '…' : 'Approuver (délai 48h)'}
                      </button>
                      <button onClick={() => agir(d.id, 'rejeter')} disabled={busy} style={{ background: D.redDim, border: `1px solid ${D.red}30`, color: D.red, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                        Rejeter
                      </button>
                    </>
                  )}
                  {(d.statut === 'en_attente' || d.statut === 'approuve') && (
                    <button onClick={() => agir(d.id, 'forcer')} disabled={busy || !d.compte_trouve} title={!d.compte_trouve ? "Aucun compte rapproché — associer manuellement d'abord" : "Applique le nouveau numéro immédiatement"} style={{ background: D.yellowDim, border: `1px solid ${D.yellow}30`, color: D.yellow, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: !d.compte_trouve ? 'not-allowed' : 'pointer', opacity: busy || !d.compte_trouve ? 0.6 : 1 }}>
                      Forcer maintenant
                    </button>
                  )}
                  {d.statut === 'approuve' && (
                    <button onClick={() => agir(d.id, 'annuler')} disabled={busy} style={{ background: D.surface2, border: `1px solid ${D.border2}`, color: D.textSub, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                      Annuler (citoyen contacté sur l'ancien numéro)
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
