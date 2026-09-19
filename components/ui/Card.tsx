'use client'

// Card partagée admin + institution (mission "Design System partagé Admin →
// Institution", 01/09/2026). N'existait comme composant nulle part — mais
// le motif `backgroundColor: D.surface, border: 1px solid D.border,
// borderRadius: D.radius` est répété tel quel 62 fois dans app/admin/**
// (grep réel, pas une estimation), avec deux variantes : `padding: '18px'`
// pour une carte de contenu, `overflow: 'hidden'` sans padding pour un
// conteneur de tableau/liste. C'est le vrai "Card" implicite de l'Admin,
// jamais nommé — ce composant le rend enfin explicite et partageable, sans
// toucher aux 62 emplacements existants (Admin non modifié par ce fichier).
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

export interface CardTokens {
  surface: string
  border: string
  radius: string
}

export function Card({ tokens, padding = '18px', noPadding, children, style, onClick, className, id, role, tabIndex, ['aria-label']: ariaLabel, onKeyDown }: {
  tokens: CardTokens
  /** Ignoré si `noPadding` est vrai. */
  padding?: string
  /** Variante "conteneur de tableau/liste" (62 occurrences admin) : pas de
   * padding, `overflow: hidden` pour que le contenu (ex. Table) respecte le
   * radius de la carte. */
  noPadding?: boolean
  children: ReactNode
  style?: CSSProperties
  onClick?: () => void
  className?: string
  id?: string
  /** Passthrough clavier/lecteur d'écran pour les cartes cliquables qui ne
   * sont pas de vrais <button> (ex. carte-item ouvrant une fiche détail). */
  role?: string
  tabIndex?: number
  'aria-label'?: string
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      onClick={onClick}
      className={className}
      id={id}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      style={{
        backgroundColor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: tokens.radius,
        padding: noPadding ? undefined : padding,
        overflow: noPadding ? 'hidden' : undefined,
        cursor: onClick ? 'pointer' : undefined,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
