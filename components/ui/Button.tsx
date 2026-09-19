'use client'

// Primitive Button partagée admin + institution (chantier gouvernance des
// actions et confirmation, 16/08/2026 — Phase 2). Aucune couleur/police en
// dur ici : le composant est théoriquement agnostique, chaque appelant lui
// fournit ses propres tokens (D côté admin, C côté institution) — c'est la
// palette qui varie, pas le comportement (tailles, états, clavier, focus,
// anti-double-soumission).
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { YelenLoader } from '@/components/YelenLoader'

export interface ButtonTokens {
  accent: string
  accentText: string
  surface: string
  border: string
  text: string
  textMuted: string
  danger: string
  dangerBg: string
  dangerBorder: string
  radius: string
  radiusSm: string
  font?: string
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

type StyleWithVars = CSSProperties & { [key: `--${string}`]: string | number }

interface ButtonProps {
  tokens: ButtonTokens
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  type?: 'button' | 'submit'
  onClick?: () => void | Promise<void>
  children: ReactNode
  title?: string
  ariaLabel?: string
  style?: CSSProperties
  className?: string
  /** Couleur du YelenLoader pendant `loading` — sinon dérivée de la variante
   * (ex. noir pour primary). À fournir quand `style` recolore le fond d'une
   * façon que la variante ne prévoit pas (ex. succès vert plein sur variant
   * primary/secondary), sinon le spinner reste dans la couleur de texte de
   * la variante d'origine et peut se fondre dans le nouveau fond. */
  loadingColor?: string
}

const SIZE: Record<ButtonSize, { h: string; padX: string; font: string; gap: string; radiusKey: 'radius' | 'radiusSm' }> = {
  sm: { h: '32px', padX: '12px', font: '12px', gap: '6px', radiusKey: 'radiusSm' },
  md: { h: '40px', padX: '16px', font: '13px', gap: '7px', radiusKey: 'radius' },
  lg: { h: '48px', padX: '20px', font: '14px', gap: '8px', radiusKey: 'radius' },
}

// Prévention du double-clic/double-soumission : si onClick renvoie une
// Promise, le bouton se désactive (busy) jusqu'à sa résolution — un
// deuxième clic pendant ce laps de temps n'atteint jamais le handler
// puisqu'un <button disabled> ne reçoit plus d'événement click natif.
export function Button({
  tokens, variant = 'primary', size = 'md', loading: loadingProp, disabled,
  fullWidth, icon, iconPosition = 'left', type = 'button', onClick, children,
  title, ariaLabel, style, className, loadingColor,
}: ButtonProps) {
  const [busy, setBusy] = useState(false)
  const loading = loadingProp ?? busy
  const isDisabled = !!disabled || loading

  const handleClick = useCallback(async () => {
    if (!onClick || isDisabled) return
    const result = onClick()
    if (result instanceof Promise) {
      setBusy(true)
      try { await result } finally { setBusy(false) }
    }
  }, [onClick, isDisabled])

  const s = SIZE[size]
  const radius = tokens[s.radiusKey]

  let bg = tokens.surface, fg = tokens.text, border = tokens.border
  if (variant === 'primary') { bg = tokens.accent; fg = tokens.accentText; border = tokens.accent }
  else if (variant === 'secondary') { bg = tokens.surface; fg = tokens.text; border = tokens.border }
  else if (variant === 'ghost') { bg = 'transparent'; fg = tokens.text; border = 'transparent' }
  else if (variant === 'danger') { bg = tokens.dangerBg; fg = tokens.danger; border = tokens.dangerBorder }
  else if (variant === 'danger-ghost') { bg = 'transparent'; fg = tokens.danger; border = 'transparent' }

  const btnStyle: StyleWithVars = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
    height: s.h, padding: `0 ${s.padX}`, width: fullWidth ? '100%' : undefined,
    backgroundColor: bg, color: fg, border: `1px solid ${border}`,
    borderRadius: radius, fontSize: s.font, fontWeight: 700,
    fontFamily: tokens.font, cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: disabled && !loading ? 0.5 : 1,
    transition: 'background-color 0.15s ease, opacity 0.15s ease',
    boxSizing: 'border-box', whiteSpace: 'nowrap',
    '--yelen-focus': tokens.accent,
    ...style,
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={isDisabled}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading}
      className={className ? `yelen-focus-ring ${className}` : "yelen-focus-ring"}
      style={btnStyle}
    >
      {loading ? (
        // Un seul indicateur de chargement dans toute l'app — YelenLoader
        // (logo Yelen qui tourne), jamais un spinner générique (retour
        // Bryan 17/08/2026, cercle radar trouvé ici par erreur).
        <YelenLoader size={size === 'sm' ? 12 : 14} color={loadingColor ?? fg} />
      ) : (
        icon && iconPosition === 'left' ? icon : null
      )}
      <span style={{ opacity: loading ? 0.75 : 1 }}>{children}</span>
      {!loading && icon && iconPosition === 'right' ? icon : null}
    </button>
  )
}
