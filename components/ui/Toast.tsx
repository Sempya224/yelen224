'use client'

// Toast partagé admin + institution (mission "Design System partagé Admin →
// Institution", 01/09/2026). Extrait de app/admin/adminUiKit.tsx::ToastContainer
// (chantier refonte admin, 26/07/2026) — hardcodait le thème `D` (et même des
// couleurs de fond en dur, hors du système de tokens D) en interne, refactor
// tokens même principe que components/ui/Button.tsx. Icônes réécrites en SVG
// inline plutôt que dépendantes de app/admin/adminIcons.tsx (Ic), qui
// n'existe pas côté institution — un composant partagé ne doit dépendre
// d'aucun kit d'icônes propre à une seule app.
export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

export interface ToastTokens {
  text: string
  textMuted: string
  radius: string
  shadow: string
  variants: Record<ToastType, { bg: string; border: string; icon: string }>
}

const ICONS: Record<ToastType, (color: string) => React.ReactNode> = {
  success: (c) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  error: (c) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  info: (c) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
}

export function ToastContainer({ toasts, remove, tokens }: {
  toasts: ToastItem[]
  remove: (id: string) => void
  tokens: ToastTokens
}) {
  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <style>{`@keyframes yelenToastSlideIn { from { transform: translateX(60px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
      {toasts.map(t => {
        const v = tokens.variants[t.type]
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '11px 16px', minWidth: '260px',
            backgroundColor: v.bg, border: `1px solid ${v.border}`,
            borderRadius: tokens.radius, boxShadow: tokens.shadow,
            fontSize: '13px', color: tokens.text, fontWeight: 500,
            animation: 'yelenToastSlideIn 0.2s ease',
          }}>
            <span style={{ color: v.icon, flexShrink: 0, display: 'flex' }}>{ICONS[t.type](v.icon)}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button onClick={() => remove(t.id)} aria-label="Fermer" style={{ background: 'none', border: 'none', color: tokens.textMuted, cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
