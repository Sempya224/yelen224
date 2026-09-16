'use client'

// Input partagé admin + institution (mission "Design System partagé Admin →
// Institution", 01/09/2026). N'existait comme composant nulle part — mais le
// motif `padding: '9px 12px', backgroundColor: D.surface2, border: 1px solid
// D.border, borderRadius: D.radiusSm, fontSize: '13px', color: D.text,
// outline: 'none', boxSizing: 'border-box', width: '100%'` est répété tel
// quel dans 15+ fichiers app/admin/** (grep réel sur `<input`). Ce composant
// le rend enfin explicite et partageable, sans toucher aux emplacements
// existants (Admin non modifié par ce fichier).
import type { InputHTMLAttributes } from 'react'

export interface InputTokens {
  surface: string
  border: string
  radiusSm: string
  text: string
}

export function Input({ tokens, style, ...props }: {
  tokens: InputTokens
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '9px 12px',
        backgroundColor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: tokens.radiusSm,
        fontSize: '13px',
        color: tokens.text,
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        ...style,
      }}
    />
  )
}
