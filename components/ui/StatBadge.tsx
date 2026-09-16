// StatBadge partagé admin + institution (mission "Design System partagé
// Admin → Institution", 01/09/2026). Extrait de app/admin/adminUiKit.tsx
// (chantier refonte admin, 26/07/2026) — hardcodait `D` et dépendait de
// app/admin/adminIcons.tsx (Ic), inexistant côté institution ; refactor
// tokens + icônes de tendance réécrites en SVG inline.
export interface StatBadgeTokens {
  positiveBg: string
  positiveText: string
  negativeBg: string
  negativeText: string
}

export function StatBadge({ value, positive, tokens }: { value: string; positive: boolean; tokens: StatBadgeTokens }) {
  const color = positive ? tokens.positiveText : tokens.negativeText
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '20px',
      backgroundColor: positive ? tokens.positiveBg : tokens.negativeBg,
      color, fontSize: '10px', fontWeight: 700,
    }}>
      {positive
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
      }
      {value}
    </span>
  )
}
