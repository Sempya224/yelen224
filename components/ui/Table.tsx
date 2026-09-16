'use client'

// Table partagée admin + institution (mission "Design System partagé Admin →
// Institution", 01/09/2026). Extrait de app/admin/adminUiKit.tsx::DataTable
// (chantier refonte admin, 26/07/2026) — desktop STRICTEMENT identique
// (même balisage <table>, mêmes styles, `D` remplacé par `tokens` sans
// changer une seule valeur), pour zéro régression visuelle Admin.
//
// L'ajout réel demandé par le brief ("Table desktop → Cards/rows mobiles",
// point 9) : sous 1024px, les lignes s'affichent en cartes empilées
// (libellé/valeur) plutôt qu'un tableau qui déborderait horizontalement sur
// mobile. Les deux rendus (table desktop + cartes mobile) sont produits en
// même temps dans le DOM, l'affichage bascule par CSS (`@media`, même
// breakpoint 1024px que components/ui/Drawer.tsx et ConfirmModal) — jamais
// un `useMediaQuery` JS, pour éviter tout flash d'hydratation SSR/client.
// Convention déjà observée sur tous les appelants admin réels : une colonne
// `key: 'actions'` en fin de tableau — sur mobile elle s'affiche pleine
// largeur sans libellé (déjà un groupe de boutons), les autres colonnes
// deviennent des lignes libellé/valeur sous le titre (1ère colonne).
export interface TableTokens {
  text: string
  textMuted: string
  border: string
  hoverBg: string
}

export interface TableColumn {
  key: string
  label: string
  width?: string
}

export function DataTable({ cols, rows, onRowClick, tokens }: {
  cols: TableColumn[]
  rows: Record<string, React.ReactNode>[]
  onRowClick?: (row: Record<string, React.ReactNode>) => void
  tokens: TableTokens
}) {
  const [titleCol, ...restCols] = cols
  const valueCols = restCols.filter(c => c.key !== 'actions')
  const actionsCol = restCols.find(c => c.key === 'actions')

  return (
    <div>
      <style>{`
        .yelen-table-desktop{display:none}
        .yelen-table-cards{display:flex;flex-direction:column}
        @media (min-width: 1024px){
          .yelen-table-desktop{display:block}
          .yelen-table-cards{display:none}
        }
      `}</style>

      {/* Desktop — balisage identique à l'ancien DataTable admin */}
      <div className="yelen-table-desktop" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '8px 12px', textAlign: 'left', color: tokens.textMuted, fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: `1px solid ${tokens.border}`, whiteSpace: 'nowrap', width: c.width }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}
                onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = tokens.hoverBg }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent' }}
              >
                {cols.map(c => (
                  <td key={c.key} style={{ padding: '10px 12px', borderBottom: `1px solid ${tokens.border}`, color: tokens.text, verticalAlign: 'middle' }}>
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — cartes empilées : titre (1ère colonne) + libellé/valeur pour
          les autres colonnes + actions pleine largeur en bas, sans libellé. */}
      <div className="yelen-table-cards">
        {rows.map((row, i) => (
          <div
            key={i}
            onClick={() => onRowClick?.(row)}
            style={{ padding: '14px 4px', borderBottom: `1px solid ${tokens.border}`, cursor: onRowClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {titleCol && <div style={{ color: tokens.text, fontSize: '13px' }}>{row[titleCol.key]}</div>}
            {valueCols.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {valueCols.map(c => (
                  <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px' }}>
                    <span style={{ color: tokens.textMuted, flexShrink: 0 }}>{c.label}</span>
                    <span style={{ color: tokens.text, textAlign: 'right' }}>{row[c.key]}</span>
                  </div>
                ))}
              </div>
            )}
            {actionsCol && <div onClick={e => e.stopPropagation()}>{row[actionsCol.key]}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
