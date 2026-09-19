'use client'

// Select partagé admin + institution (mission "Design System partagé Admin →
// Institution", 01/09/2026). Mêmes tokens que components/ui/Input.tsx — le
// motif est le même (`padding: '9px 12px', backgroundColor: D.surface2,
// border: 1px solid D.border, borderRadius: D.radiusSm, fontSize: '13px',
// color: D.text, outline: 'none', boxSizing: 'border-box'`) répété tel quel
// sur les <select> de 7+ fichiers app/admin/**. Extrait sans toucher aux
// emplacements existants (Admin non modifié par ce fichier).
import type { SelectHTMLAttributes } from 'react'
import type { InputTokens } from '@/components/ui/Input'

export function Select({ tokens, style, children, ...props }: {
  tokens: InputTokens
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
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
    >
      {children}
    </select>
  )
}
