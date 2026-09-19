'use client'

// EmptyState partagé admin + institution (mission "Design System partagé
// Admin → Institution", 01/09/2026). Deux motifs coexistaient réellement dans
// app/admin/** pour une liste sans résultat : un texte nu sans carte (3
// fichiers, plus ancien) et une carte avec bordure (5 fichiers :
// communaute-demandes, feedback, documents, offres, recuperation-comptes —
// plus récent et majoritaire). Bryan a tranché pour la carte comme référence
// unique (02/09/2026) — motif repris tel quel (`padding: '48px', textAlign:
// 'center', backgroundColor: D.surface, border: 1px solid D.border,
// borderRadius: D.radiusLg`). Extrait sans toucher aux emplacements existants
// (Admin non modifié par ce fichier, y compris les 3 fichiers qui utilisaient
// encore l'ancien motif texte nu).
import type { ReactNode } from 'react'

export interface EmptyStateTokens {
  surface: string
  border: string
  radiusLg: string
  textSub: string
}

export function EmptyState({ text, tokens, icon }: {
  text: ReactNode
  tokens: EmptyStateTokens
  icon?: ReactNode
}) {
  return (
    <div style={{
      padding: '48px', textAlign: 'center',
      backgroundColor: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusLg,
      display: icon ? 'flex' : undefined, flexDirection: icon ? 'column' : undefined, alignItems: icon ? 'center' : undefined, gap: icon ? '10px' : undefined,
    }}>
      {icon}
      <p style={{ margin: 0, color: tokens.textSub, fontSize: '13px' }}>{text}</p>
    </div>
  )
}
