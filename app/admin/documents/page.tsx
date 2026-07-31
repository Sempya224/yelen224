'use client'

// Écran admin "Documents citoyens" — supervision plateforme du flux
// documents demandé/envoyé entre institutions et citoyens (Lot C, chantier
// "Activités passées"). Lecture seule + téléchargement : la création/
// gestion reste la responsabilité opérationnelle de l'institution
// (app/institution/[id]/dashboard/components/DocumentsClientsTab.tsx).
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'

type DocumentCitoyen = {
  id: string; institution_nom: string; citoyen_nom: string;
  sens: 'demande' | 'envoi'; type: string; label: string;
  statut: 'en_attente' | 'televerse' | 'envoye' | 'annule';
  taille: number | null; created_at: string; traite_le: string | null;
}

const STATUT_INFO: Record<DocumentCitoyen['statut'], { label: string; color: string; bg: string }> = {
  en_attente: { label: 'En attente', color: D.yellow, bg: D.yellowDim },
  televerse:  { label: 'Reçu',       color: D.green,  bg: D.greenDim },
  envoye:     { label: 'Envoyé',     color: D.blue,   bg: D.blueDim },
  annule:     { label: 'Annulé',     color: D.red,    bg: D.redDim },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatTaille(o: number | null) {
  if (!o) return ''
  return o < 1024 * 1024 ? `${Math.round(o / 1024)} Ko` : `${(o / (1024 * 1024)).toFixed(1)} Mo`
}

export default function DocumentsCitoyenAdminPage() {
  const [items, setItems] = useState<DocumentCitoyen[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/documents-citoyen')
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j?.documents ?? []) : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function telecharger(id: string) {
    const res = await fetch(`/api/admin/documents-citoyen?download=${id}`)
    const j = await res.json().catch(() => null)
    if (!res.ok) return
    window.open(j.url, '_blank')
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Documents citoyens</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Supervision des documents demandés/envoyés entre institutions et citoyens, toutes institutions confondues. La sécurité et la confidentialité de ces documents relèvent de la responsabilité de chaque institution.
      </p>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucun document échangé pour l'instant.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(d => {
            const si = STATUT_INFO[d.statut]
            return (
              <div key={d.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ backgroundColor: si.bg, color: si.color, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px' }}>{si.label}</span>
                    <span style={{ color: D.textMuted, fontSize: '10.5px' }}>{d.sens === 'demande' ? 'Demande' : 'Envoi'}</span>
                    <span style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{d.label}</span>
                  </div>
                  <div style={{ color: D.textSub, fontSize: '12px' }}>
                    {d.institution_nom} → {d.citoyen_nom}{d.taille ? ` · ${formatTaille(d.taille)}` : ''} · {formatDate(d.created_at)}
                  </div>
                </div>
                {(d.statut === 'televerse' || d.statut === 'envoye') && (
                  <button onClick={() => telecharger(d.id)} style={{ background: D.surface2, border: `1px solid ${D.border2}`, color: D.textSub, fontSize: '12px', fontWeight: '700', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0 }}>
                    Télécharger
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
