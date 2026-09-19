'use client'

// Primitive ConfirmModal partagée admin + institution (chantier gouvernance
// des actions et confirmation, 16/08/2026 — Phase 2). Une seule primitive,
// niveau de risque configurable (1 simple / 2 motif obligatoire / 3
// renforcée) — pas trois composants distincts, sur instruction explicite du
// CEO. Reprend la convention déjà en place (.client-fiche-* sur
// MesClientsTab/EquipeTab) : bottom sheet mobile-first, dialogue centré
// ≥1024px (règles CSS dans app/globals.css, section "PRIMITIVES PARTAGÉES").
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, type ButtonTokens } from './Button'

export type ConfirmLevel = 1 | 2 | 3

export interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  tokens: ButtonTokens
  level: ConfirmLevel
  title: string
  description?: string
  /** "Ce qui va se produire" — liste à puces, conséquence explicite. */
  consequences?: string[]
  reversible?: boolean
  irreversibleNote?: string
  motifValue?: string
  onMotifChange?: (v: string) => void
  motifPlaceholder?: string
  /** Niveau 3 uniquement : mot/texte exact à retaper avant que le bouton de confirmation s'active. */
  confirmWord?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  errorMessage?: string
  /** Emplacement générique pour un contrôle additionnel spécifique à l'appelant
   * (ex. sélecteur de durée) — rendu après motif/confirmWord, avant les boutons.
   * Optionnel, aucun appelant existant n'en a besoin. */
  children?: ReactNode
}

export function ConfirmModal({
  open, onClose, onConfirm, tokens, level, title, description, consequences,
  reversible, irreversibleNote, motifValue, onMotifChange, motifPlaceholder,
  confirmWord, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger, errorMessage, children,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false)
  const [typedWord, setTypedWord] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)

  // Focus management : mémorise l'élément déclencheur, envoie le focus dans
  // le panneau à l'ouverture, le restaure à la fermeture — jamais un focus
  // perdu (piège accessibilité classique des modales).
  useEffect(() => {
    if (open) {
      lastFocused.current = document.activeElement as HTMLElement
      setTypedWord('')
      const t = setTimeout(() => panelRef.current?.focus(), 30)
      return () => clearTimeout(t)
    } else {
      lastFocused.current?.focus?.()
    }
  }, [open])

  // Escape ferme toujours (annuler est une action sans conséquence, à
  // n'importe quel niveau de risque) ; Tab piège le focus dans le panneau.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const motifOk = level < 2 || !!motifValue?.trim()
  const wordOk = !confirmWord || typedWord.trim() === confirmWord.trim()
  const canConfirm = motifOk && wordOk && !busy

  async function handleConfirm() {
    if (!canConfirm) return
    const result = onConfirm()
    if (result instanceof Promise) {
      setBusy(true)
      try { await result } finally { setBusy(false) }
    }
  }

  const accentColor = danger || level === 3 ? tokens.danger : tokens.accent
  // Niveau 3 : le clic sur le fond n'annule pas — évite qu'un misclic
  // referme une modale qu'on était en train de lire/remplir. Échap reste
  // toujours disponible juste au-dessus (annuler ne coûte jamais rien).
  const backdropCloses = level < 3

  return (
    <div
      className="yelen-confirm-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'yelenFadeIn 0.15s ease' }}
      onClick={() => { if (backdropCloses) onClose() }}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="yelen-confirm-title"
        onClick={e => e.stopPropagation()}
        className="yelen-confirm-panel"
        style={{ position: 'relative', backgroundColor: tokens.surface, borderRadius: '20px 20px 0 0', padding: '22px 20px 28px', width: '100%', maxWidth: '440px', maxHeight: '86svh', overflowY: 'auto', border: `1px solid ${tokens.border}`, borderBottom: 'none', animation: 'yelenSlideUp 0.2s ease', outline: 'none', boxSizing: 'border-box' }}
      >
        <div className="yelen-confirm-grip" style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: tokens.textMuted, margin: '0 auto 18px', opacity: 0.5 }} />

        <div id="yelen-confirm-title" style={{ color: tokens.text, fontSize: '17px', fontWeight: 800, marginBottom: description ? '6px' : '14px' }}>{title}</div>
        {description && <div style={{ color: tokens.textMuted, fontSize: '13px', lineHeight: 1.5, marginBottom: '14px' }}>{description}</div>}

        {consequences && consequences.length > 0 && (
          <div style={{ backgroundColor: tokens.border, borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {consequences.map((c, i) => (
              <div key={i} style={{ color: tokens.text, fontSize: '12.5px', lineHeight: 1.5, display: 'flex', gap: '8px' }}>
                <span aria-hidden style={{ color: accentColor, flexShrink: 0 }}>&bull;</span><span>{c}</span>
              </div>
            ))}
          </div>
        )}

        {typeof reversible === 'boolean' && (
          <div style={{ fontSize: '12px', fontWeight: 700, color: reversible ? tokens.textMuted : tokens.danger, marginBottom: '14px' }}>
            {reversible ? 'Cette action est réversible.' : (irreversibleNote || 'Cette action est irréversible.')}
          </div>
        )}

        {level >= 2 && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Motif (obligatoire)</label>
            <textarea
              value={motifValue || ''}
              onChange={e => onMotifChange?.(e.target.value)}
              placeholder={motifPlaceholder || 'Expliquez la raison de cette action...'}
              rows={3}
              style={{ width: '100%', backgroundColor: 'transparent', border: `1px solid ${tokens.border}`, borderRadius: '10px', padding: '10px 12px', fontSize: '13px', color: tokens.text, resize: 'vertical', boxSizing: 'border-box', fontFamily: tokens.font }}
            />
          </div>
        )}

        {level === 3 && confirmWord && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Tapez <strong style={{ color: tokens.text }}>{confirmWord}</strong> pour confirmer
            </label>
            <input
              value={typedWord}
              onChange={e => setTypedWord(e.target.value)}
              placeholder={confirmWord}
              style={{ width: '100%', backgroundColor: 'transparent', border: `1px solid ${tokens.border}`, borderRadius: '10px', padding: '11px 12px', fontSize: '14px', color: tokens.text, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {children}

        {errorMessage && <div style={{ color: tokens.danger, fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>{errorMessage}</div>}

        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <Button tokens={tokens} variant="secondary" size="lg" fullWidth onClick={onClose}>{cancelLabel}</Button>
          <Button
            tokens={tokens}
            variant={danger || level === 3 ? 'danger' : 'primary'}
            size="lg"
            fullWidth
            disabled={!canConfirm}
            loading={busy}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
