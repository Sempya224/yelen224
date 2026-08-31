'use client'

// Écran admin "Révisions de suspension" — boîte de réception des demandes
// "Demander une révision" soumises depuis l'écran institution "Espace
// suspendu" (décision CEO 17/08/2026). Structure calquée sur
// app/admin/recuperation-comptes/page.tsx (filtres de statut, cartes,
// action PATCH accepter/rejeter) ; Accepter/Rejeter réutilisent
// components/ui/Button + ConfirmModal (chantier gouvernance des actions,
// niveau 1 pour Accepter, niveau 2 motif obligatoire pour Rejeter).
import { useEffect, useState, useCallback } from 'react'
import { D, uiTokens } from '@/app/admin/adminTheme'
import { YelenLoader } from '@/components/YelenLoader'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

type Revision = {
  id: string; reference: string; message: string; statut: 'en_attente' | 'acceptee' | 'rejetee';
  created_at: string; decision_motif: string | null; decision_le: string | null;
  institutions: { name: string } | { name: string }[] | null;
  institution_suspensions: { motif: string; reference: string; created_at: string } | { motif: string; reference: string; created_at: string }[] | null;
}

const STATUT_FILTERS = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'acceptee', label: 'Acceptées' },
  { key: 'rejetee', label: 'Rejetées' },
  { key: 'tous', label: 'Toutes' },
] as const

const STATUT_INFO: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: 'En attente', color: D.yellow, bg: D.yellowDim },
  acceptee: { label: 'Acceptée', color: D.green, bg: D.greenDim },
  rejetee: { label: 'Rejetée', color: D.red, bg: D.redDim },
}

function un<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function RevisionsPage() {
  const [statut, setStatut] = useState<(typeof STATUT_FILTERS)[number]['key']>('en_attente')
  const [items, setItems] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmAccepter, setConfirmAccepter] = useState<Revision | null>(null)
  const [confirmRejeter, setConfirmRejeter] = useState<Revision | null>(null)
  const [motifRejet, setMotifRejet] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/suspension-revisions?statut=${statut}`)
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j ?? []) : [])
    setLoading(false)
  }, [statut])

  // Pattern fetch-on-mount/on-filter-change identique à
  // app/admin/recuperation-comptes/page.tsx (même chantier gouvernance
  // 16/08/2026) : setLoading(true) au début de `load` est le spinner
  // attendu, pas une cascade de rendus accidentelle. Règle expérimentale
  // (React Compiler-era, eslint-config-next) qui flague ce pattern de
  // data-fetching standard comme une erreur ; `next build` ne l'applique
  // pas (vérifié : ce fichier compile et build sans erreur), seul
  // `npx eslint` isolé la relève.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function agir(id: string, action: 'accepter' | 'rejeter', motif?: string) {
    setBusyId(id)
    const res = await fetch('/api/admin/suspension-revisions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, motif }),
    })
    setBusyId(null)
    if (res.ok) load()
    else alert("Action impossible — cette révision a peut-être déjà été traitée.")
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Révisions de suspension</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Demandes de révision soumises par des institutions suspendues depuis leur écran &quot;Espace suspendu&quot;. Accepter réactive immédiatement l&apos;établissement ; refuser nécessite un motif transmis à l&apos;institution.
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
        <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={26}/></div>
      ) : items.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune révision pour ce filtre.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(r => {
            const si = STATUT_INFO[r.statut] ?? { label: r.statut, color: D.textSub, bg: D.surface2 }
            const inst = un(r.institutions)
            const suspension = un(r.institution_suspensions)
            const busy = busyId === r.id
            return (
              <div key={r.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: si.bg, color: si.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{si.label}</span>
                    <span style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{inst?.name || 'Institution inconnue'}</span>
                    <span style={{ color: D.textMuted, fontSize: '11px', fontFamily: 'monospace' }}>{r.reference}</span>
                  </div>
                  <span style={{ color: D.textMuted, fontSize: '11px' }}>{timeAgo(r.created_at)}</span>
                </div>

                {suspension && (
                  <div style={{ background: D.surface2, borderRadius: '10px', padding: '8px 12px', marginBottom: '10px' }}>
                    <div style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Motif de la suspension ({suspension.reference})</div>
                    <div style={{ color: D.text, fontSize: '13px', fontWeight: '600' }}>{suspension.motif}</div>
                  </div>
                )}

                <div style={{ background: D.surface2, borderRadius: '10px', padding: '8px 12px', marginBottom: '10px' }}>
                  <div style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Message de l&apos;institution</div>
                  <div style={{ color: D.text, fontSize: '13px', fontWeight: '600', whiteSpace: 'pre-wrap' }}>{r.message}</div>
                </div>

                {r.statut === 'rejetee' && r.decision_motif && (
                  <div style={{ background: D.redDim, borderRadius: '10px', padding: '8px 12px', marginBottom: '10px' }}>
                    <div style={{ color: D.red, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Motif du refus</div>
                    <div style={{ color: D.text, fontSize: '13px', fontWeight: '600' }}>{r.decision_motif}</div>
                  </div>
                )}

                {r.statut === 'en_attente' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button tokens={uiTokens} variant="primary" size="sm" disabled={busy} onClick={() => setConfirmAccepter(r)}>
                      Accepter — réactiver
                    </Button>
                    <Button tokens={uiTokens} variant="danger" size="sm" disabled={busy} onClick={() => { setConfirmRejeter(r); setMotifRejet('') }}>
                      Rejeter
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={!!confirmAccepter}
        onClose={() => setConfirmAccepter(null)}
        onConfirm={async () => { if (confirmAccepter) { await agir(confirmAccepter.id, 'accepter'); setConfirmAccepter(null) } }}
        tokens={uiTokens}
        level={1}
        title="Accepter cette révision ?"
        description={confirmAccepter ? `${un(confirmAccepter.institutions)?.name || 'Cette institution'} sera réactivée immédiatement et redevient visible des citoyens.` : undefined}
        reversible
        confirmLabel="Accepter et réactiver"
      />

      <ConfirmModal
        open={!!confirmRejeter}
        onClose={() => { setConfirmRejeter(null); setMotifRejet('') }}
        onConfirm={async () => { if (confirmRejeter) { await agir(confirmRejeter.id, 'rejeter', motifRejet); setConfirmRejeter(null); setMotifRejet('') } }}
        tokens={uiTokens}
        level={2}
        danger
        title="Rejeter cette révision ?"
        description={confirmRejeter ? `${un(confirmRejeter.institutions)?.name || 'Cette institution'} reste suspendue. Le motif ci-dessous lui sera transmis.` : undefined}
        reversible
        motifValue={motifRejet}
        onMotifChange={setMotifRejet}
        motifPlaceholder="Raison du refus — transmise à l'institution..."
        confirmLabel="Rejeter"
      />
    </div>
  )
}
