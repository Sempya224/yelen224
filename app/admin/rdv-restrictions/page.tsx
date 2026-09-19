"use client"

// Écran admin "Restrictions de rendez-vous" — surveillance des sanctions
// automatiques no-show (décision CEO 03/09/2026, voir migration
// 20260903000001_citoyen_rdv_restrictions.sql). Structure calquée sur
// app/admin/revisions/page.tsx (filtres, cartes, Accepter/Rejeter via
// ConfirmModal) — seule la ressource change (restrictions vs appels).
import { useEffect, useState, useCallback } from 'react'
import { D, uiTokens } from '@/app/admin/adminTheme'
import { YelenLoader } from '@/components/YelenLoader'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

type Niveau = 'restreint_7j' | 'restreint_30j' | 'clos'
type Restriction = {
  id: string; reference: string; niveau: Niveau; absences_total: number;
  jusqu_au: string | null; statut: 'active' | 'levee'; created_at: string;
  levee_le: string | null; levee_par: 'auto' | 'revision' | null; citoyen_id: string;
  users: { prenom: string | null; nom: string | null; phone: string | null } | { prenom: string | null; nom: string | null; phone: string | null }[] | null;
}
type Appel = {
  id: string; reference: string; message: string; statut: 'en_attente' | 'acceptee' | 'rejetee';
  created_at: string; decision_motif: string | null; decision_le: string | null; citoyen_id: string; restriction_id: string;
  users: { prenom: string | null; nom: string | null; phone: string | null } | { prenom: string | null; nom: string | null; phone: string | null }[] | null;
  citoyen_rdv_restrictions: { reference: string; niveau: Niveau; absences_total: number } | { reference: string; niveau: Niveau; absences_total: number }[] | null;
}

const FILTRES = [
  { key: 'tous', label: 'Tous' },
  { key: 'restreint_7j', label: '7 jours' },
  { key: 'restreint_30j', label: '30 jours' },
  { key: 'clos', label: 'Clôturés' },
  { key: 'appels', label: 'Appels' },
] as const

const NIVEAU_INFO: Record<Niveau, { label: string; color: string; bg: string }> = {
  restreint_7j: { label: 'Restreint 7 jours', color: D.yellow, bg: D.yellowDim },
  restreint_30j: { label: 'Restreint 30 jours', color: D.orange, bg: D.orangeDim },
  clos: { label: 'Clôturé', color: D.red, bg: D.redDim },
}
const APPEL_STATUT_INFO: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: 'En attente', color: D.yellow, bg: D.yellowDim },
  acceptee: { label: 'Acceptée', color: D.green, bg: D.greenDim },
  rejetee: { label: 'Rejetée', color: D.red, bg: D.redDim },
}

function un<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}
function nomCitoyen(u: { prenom: string | null; nom: string | null; phone: string | null } | null): string {
  if (!u) return 'Citoyen inconnu'
  return [u.prenom, u.nom].filter(Boolean).join(' ') || u.phone || 'Citoyen inconnu'
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function RdvRestrictionsPage() {
  const [filtre, setFiltre] = useState<(typeof FILTRES)[number]['key']>('tous')
  const [restrictions, setRestrictions] = useState<Restriction[]>([])
  const [appels, setAppels] = useState<Appel[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmAccepter, setConfirmAccepter] = useState<Appel | null>(null)
  const [confirmRejeter, setConfirmRejeter] = useState<Appel | null>(null)
  const [motifRejet, setMotifRejet] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/rdv-restrictions?filtre=${filtre}${filtre === 'appels' ? '&statut=tous' : ''}`)
    const j = await res.json().catch(() => null)
    if (filtre === 'appels') setAppels(res.ok ? (j ?? []) : [])
    else setRestrictions(res.ok ? (j ?? []) : [])
    setLoading(false)
  }, [filtre])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function agir(id: string, action: 'accepter' | 'rejeter', motif?: string) {
    setBusyId(id)
    const res = await fetch('/api/admin/rdv-restrictions/appel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, motif }),
    })
    setBusyId(null)
    if (res.ok) load()
    else alert("Action impossible — cette demande a peut-être déjà été traitée.")
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Restrictions de rendez-vous</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Sanctions automatiques déclenchées par les rendez-vous marqués « Absent » (3 → 7 jours, 5 → 30 jours, 10 → clôture définitive).
        Ne concerne que la prise de rendez-vous — jamais le reste du compte citoyen.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {FILTRES.map(f => {
          const active = filtre === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFiltre(f.key)}
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
      ) : filtre === 'appels' ? (
        appels.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
            <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune demande d&apos;appel.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {appels.map(a => {
              const si = APPEL_STATUT_INFO[a.statut] ?? { label: a.statut, color: D.textSub, bg: D.surface2 }
              const u = un(a.users)
              const restriction = un(a.citoyen_rdv_restrictions)
              const busy = busyId === a.id
              return (
                <div key={a.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ backgroundColor: si.bg, color: si.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{si.label}</span>
                      <span style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{nomCitoyen(u)}</span>
                      <span style={{ color: D.textMuted, fontSize: '11px', fontFamily: 'monospace' }}>{a.reference}</span>
                    </div>
                    <span style={{ color: D.textMuted, fontSize: '11px' }}>{fmtDate(a.created_at)}</span>
                  </div>

                  {restriction && (
                    <div style={{ background: D.surface2, borderRadius: '10px', padding: '8px 12px', marginBottom: '10px' }}>
                      <div style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Clôture concernée ({restriction.reference})</div>
                      <div style={{ color: D.text, fontSize: '13px', fontWeight: '600' }}>{restriction.absences_total} rendez-vous non honorés</div>
                    </div>
                  )}

                  <div style={{ background: D.surface2, borderRadius: '10px', padding: '8px 12px', marginBottom: '10px' }}>
                    <div style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Message du citoyen</div>
                    <div style={{ color: D.text, fontSize: '13px', fontWeight: '600', whiteSpace: 'pre-wrap' }}>{a.message}</div>
                  </div>

                  {a.statut === 'rejetee' && a.decision_motif && (
                    <div style={{ background: D.redDim, borderRadius: '10px', padding: '8px 12px', marginBottom: '10px' }}>
                      <div style={{ color: D.red, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Motif du refus</div>
                      <div style={{ color: D.text, fontSize: '13px', fontWeight: '600' }}>{a.decision_motif}</div>
                    </div>
                  )}

                  {a.statut === 'en_attente' && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Button tokens={uiTokens} variant="primary" size="sm" disabled={busy} onClick={() => setConfirmAccepter(a)}>
                        Accepter — réactiver
                      </Button>
                      <Button tokens={uiTokens} variant="danger" size="sm" disabled={busy} onClick={() => { setConfirmRejeter(a); setMotifRejet('') }}>
                        Rejeter
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : restrictions.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune restriction pour ce filtre.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {restrictions.map(r => {
            const ni = NIVEAU_INFO[r.niveau]
            const u = un(r.users)
            return (
              <div key={r.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: ni.bg, color: ni.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{ni.label}</span>
                    <span style={{ color: r.statut === 'active' ? D.text : D.textMuted, fontSize: '10px', fontWeight: '700' }}>{r.statut === 'active' ? 'ACTIVE' : `LEVÉE (${r.levee_par})`}</span>
                    <span style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{nomCitoyen(u)}</span>
                    <span style={{ color: D.textMuted, fontSize: '11px', fontFamily: 'monospace' }}>{r.reference}</span>
                  </div>
                  <span style={{ color: D.textMuted, fontSize: '11px' }}>{fmtDate(r.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div><span style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Absences</span><div style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{r.absences_total}</div></div>
                  <div><span style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Début</span><div style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{fmtDate(r.created_at)}</div></div>
                  <div><span style={{ color: D.textMuted, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Fin</span><div style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{r.niveau === 'clos' ? 'Définitive' : fmtDate(r.jusqu_au)}</div></div>
                </div>
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
        title="Accepter cet appel ?"
        description={confirmAccepter ? `${nomCitoyen(un(confirmAccepter.users))} retrouvera immédiatement l'accès aux rendez-vous et réservations.` : undefined}
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
        title="Rejeter cet appel ?"
        description={confirmRejeter ? `${nomCitoyen(un(confirmRejeter.users))} reste sans accès aux rendez-vous. Le motif ci-dessous lui sera transmis.` : undefined}
        reversible
        motifValue={motifRejet}
        onMotifChange={setMotifRejet}
        motifPlaceholder="Raison du refus — transmise au citoyen..."
        confirmLabel="Rejeter"
      />
    </div>
  )
}
