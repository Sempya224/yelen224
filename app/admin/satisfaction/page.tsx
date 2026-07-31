'use client'

// Écran admin "Satisfaction" — réception du widget citoyen "Comment on
// s'en sort ?" (app/institution/[id]/page.tsx, table enquete_satisfaction
// via app/api/admin/satisfaction). Évalue Yelen en général, pas une
// institution précise. Mêmes tokens de couleur que app/admin/feedback/page.tsx
// (pas de module de thème admin partagé pour l'instant).
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'

type Item = {
  id: string; citoyen_id: string; reponse: string; commentaire: string | null;
  institution_id: string | null; institution_nom: string | null; created_at: string;
}
type Resume = {
  total: number; moyenne: number;
  comptes: { accord_total: number; accord: number; neutre: number; desaccord: number; desaccord_total: number };
}

const REPONSE_LABELS: Record<string, string> = {
  accord_total: "Tout à fait d'accord",
  accord: "D'accord",
  neutre: 'Neutre',
  desaccord: "Pas d'accord",
  desaccord_total: "Pas du tout d'accord",
}
const REPONSE_ORDRE = ['accord_total', 'accord', 'neutre', 'desaccord', 'desaccord_total'] as const

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function SatisfactionPage() {
  const [items, setItems] = useState<Item[]>([])
  const [resume, setResume] = useState<Resume | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/satisfaction')
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j?.items ?? []) : [])
    setResume(res.ok ? (j?.resume ?? null) : null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Satisfaction</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Réponses au widget "Comment on s'en sort ?" — évalue Yelen en général, affiché aux citoyens connectés sur les fiches institution.
      </p>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement…</div>
      ) : !resume || resume.total === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucune réponse pour le moment.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '18px 22px', minWidth: '140px' }}>
              <div style={{ color: D.yellow, fontSize: '28px', fontWeight: '900', lineHeight: 1 }}>{resume.moyenne.toFixed(1)}<span style={{ fontSize: '14px', color: D.textMuted, fontWeight: '600' }}>/5</span></div>
              <div style={{ color: D.textSub, fontSize: '11px', marginTop: '6px' }}>Moyenne sur {resume.total} réponse{resume.total > 1 ? 's' : ''}</div>
            </div>

            <div style={{ flex: 1, minWidth: '260px', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px 20px' }}>
              {REPONSE_ORDRE.map(key => {
                const count = resume.comptes[key]
                const pct = resume.total > 0 ? (count / resume.total) * 100 : 0
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
                    <span style={{ color: D.textSub, fontSize: '11.5px', width: '130px', flexShrink: 0 }}>{REPONSE_LABELS[key]}</span>
                    <div style={{ flex: 1, height: '7px', borderRadius: '4px', backgroundColor: D.surface2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: key === 'accord_total' || key === 'accord' ? D.green : key === 'neutre' ? D.yellow : D.red, borderRadius: '4px', transition: 'width 0.4s ease' }}/>
                    </div>
                    <span style={{ color: D.textMuted, fontSize: '11px', width: '28px', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <h2 style={{ color: D.text, fontSize: '15px', fontWeight: '700', margin: '0 0 12px' }}>Commentaires libres</h2>
          {items.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
              <p style={{ color: D.textSub, fontSize: '13px' }}>Aucun commentaire libre pour le moment.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map(it => (
                <div key={it.id} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '10px' }}>
                    <span style={{ backgroundColor: D.blueDim, color: D.blue, fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{REPONSE_LABELS[it.reponse] ?? it.reponse}</span>
                    <span style={{ color: D.textMuted, fontSize: '11px', flexShrink: 0 }}>{timeAgo(it.created_at)}</span>
                  </div>
                  <p style={{ color: D.textSub, fontSize: '13px', lineHeight: 1.6, margin: '0 0 6px' }}>{it.commentaire}</p>
                  {it.institution_nom && (
                    <p style={{ color: D.textMuted, fontSize: '11px', margin: 0 }}>Vu sur la fiche : {it.institution_nom}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
