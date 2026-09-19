'use client'

// Drawer partagé admin + institution (mission "Design System partagé Admin →
// Institution", 01/09/2026). Extrait de app/admin/adminUiKit.tsx::SlidePanel
// (chantier refonte admin, 26/07/2026), qui hardcodait le thème admin `D` en
// interne — refactor tokens, même principe que components/ui/Button.tsx.
//
// Le comportement desktop (panneau latéral droit, largeur fixe) est celui
// déjà validé côté Admin — INCHANGÉ. L'ajout réel de ce composant est le mode
// mobile (<1024px) : plein écran en bottom sheet plutôt qu'un panneau étroit
// collé à droite, qui n'existait nulle part avant. Même breakpoint et même
// convention que components/ui/ConfirmModal.tsx (voir app/globals.css,
// ".yelen-confirm-*") — un seul système de recouvrement mobile-first dans
// tout le produit, pas un deuxième pattern parallèle.
import type { ReactNode } from 'react'

export interface DrawerTokens {
  surface: string
  border: string
  text: string
  textMuted: string
  shadow: string
}

export function Drawer({ open, onClose, title, width = '480px', tokens, children }: {
  open: boolean
  onClose: () => void
  title: string
  width?: string
  tokens: DrawerTokens
  children: ReactNode
}) {
  return (
    <>
      <style>{`
        .yelen-drawer-overlay{position:fixed;inset:0;background-color:rgba(0,0,0,0.6);z-index:200;backdrop-filter:blur(2px)}
        .yelen-drawer-panel{
          position:fixed;left:0;right:0;bottom:0;top:auto;max-height:85svh;width:100%;
          border-radius:20px 20px 0 0;border-top:1px solid ${tokens.border};
          transform:translateY(100%);transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);
        }
        .yelen-drawer-panel.open{transform:translateY(0)}
        @media (min-width: 1024px){
          .yelen-drawer-panel{
            left:auto;top:0;bottom:0;max-height:none;border-radius:0;width:var(--drawer-width);
            border-top:none;border-left:1px solid ${tokens.border};
            transform:translateX(100%);
          }
          .yelen-drawer-panel.open{transform:translateX(0)}
        }
      `}</style>
      {open && <div className="yelen-drawer-overlay" onClick={onClose}/>}
      <div
        className={`yelen-drawer-panel${open ? ' open' : ''}`}
        style={{
          '--drawer-width': width, backgroundColor: tokens.surface, boxShadow: tokens.shadow,
          zIndex: 201, display: 'flex', flexDirection: 'column',
        } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: tokens.text }}>{title}</h3>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: tokens.textMuted, display: 'flex', padding: '4px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>{children}</div>
      </div>
    </>
  )
}
