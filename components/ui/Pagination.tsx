'use client'

// Pagination partagée admin + institution (mission "Design System partagé
// Admin → Institution", 01/09/2026). Motif "Page {n} / Préc / Suiv" répété à
// l'identique dans 6 fichiers app/admin/** (institutions, citoyens, annonces,
// paiements, rdv, logs) — seule `institutions/page.tsx` ajoute des chevrons
// autour du texte, repris ici via `prevLabel`/`nextLabel` optionnels plutôt
// que forcés, pour ne rien changer visuellement aux 5 autres appelants le
// jour où ils migreront. Extrait sans toucher aux emplacements existants
// (Admin non modifié par ce fichier).
import type { ReactNode } from 'react'

export interface PaginationTokens {
  border: string
  surface2: string
  textMuted: string
  textSub: string
  radiusSm: string
}

export function Pagination({ page, onPrev, onNext, hasNext, tokens, prevLabel = 'Préc', nextLabel = 'Suiv' }: {
  /** Index de page 0-based, affiché en `Page {page + 1}`. */
  page: number
  onPrev: () => void
  onNext: () => void
  /** Fausse quand la page courante contient moins que la taille de lot demandée. */
  hasNext: boolean
  tokens: PaginationTokens
  prevLabel?: ReactNode
  nextLabel?: ReactNode
}) {
  const btnStyle = (disabled: boolean) => ({
    padding: '5px 10px',
    backgroundColor: tokens.surface2,
    border: `1px solid ${tokens.border}`,
    borderRadius: tokens.radiusSm,
    color: tokens.textSub,
    cursor: 'pointer' as const,
    fontSize: '12px',
    opacity: disabled ? 0.4 : 1,
  })
  return (
    <div style={{ padding: '12px 16px', borderTop: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '11px', color: tokens.textMuted }}>Page {page + 1}</span>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onPrev} disabled={page === 0} style={btnStyle(page === 0)}>{prevLabel}</button>
        <button onClick={onNext} disabled={!hasNext} style={btnStyle(!hasNext)}>{nextLabel}</button>
      </div>
    </div>
  )
}
