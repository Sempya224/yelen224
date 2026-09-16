'use client'

// Kit d'UI partagé de l'administration Yelen (chantier refonte admin
// 26/07/2026 — Lot C). Extrait de l'ancien monolithe app/admin/page.tsx
// (helpers utilisés par plusieurs vues) — source unique désormais.
import { useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import type { ToastItem } from '@/app/admin/adminTypes'
import { Drawer } from '@/components/ui/Drawer'
import { ToastContainer as SharedToastContainer, type ToastTokens } from '@/components/ui/Toast'
import { DataTable as SharedDataTable, type TableTokens } from '@/components/ui/Table'
import { StatBadge as SharedStatBadge, type StatBadgeTokens } from '@/components/ui/StatBadge'

export function fmtMoney(n: number) {
  if (n >= 1_000_000_000) return `${(n/1e9).toFixed(2)} Mrd GNF`
  if (n >= 1_000_000)     return `${(n/1e6).toFixed(1)} M GNF`
  if (n >= 1_000)         return `${(n/1e3).toFixed(0)} K GNF`
  return `${n.toLocaleString('fr-FR')} GNF`
}

export function fmtNum(n: number) { return n.toLocaleString('fr-FR') }

export function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1)  return "à l'instant"
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h/24)}j`
}

// Export CSV générique — appelée par Institutions, RDV, Paiements (et
// potentiellement d'autres écrans plus tard) : partagée ici plutôt que
// dupliquée, c'est un pur wrapper fetch+download sans état.
export async function exportCSV(type: string) {
  try {
    const res = await fetch(`/api/admin/export?type=${type}`)
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `yelen224_${type}_${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch { /* silencieux */ }
}

// Déplacé vers components/ui/Badge.tsx (mission "Design System partagé
// Admin → Institution", 01/09/2026) — déjà agnostique de toute couleur,
// donc extrait tel quel. Réexporté ici pour ne pas casser les appelants
// existants (10 pages admin importent `Badge` depuis ce fichier).
export { Badge } from '@/components/ui/Badge'

// Déplacé vers components/ui/StatBadge.tsx (mission "Design System partagé
// Admin → Institution", 01/09/2026) — wrapper conservé pour ne pas casser
// son unique appelant admin.
const statBadgeTokens: StatBadgeTokens = { positiveBg: D.greenDim, positiveText: D.green, negativeBg: D.redDim, negativeText: D.red }
export function StatBadge({ value, positive }: { value: string, positive: boolean }) {
  return <SharedStatBadge value={value} positive={positive} tokens={statBadgeTokens}/>
}

export function Divider() {
  return <div style={{ height: '1px', backgroundColor: D.border, margin: '0' }} />
}

export function SectionHeader({ title, sub, action, onAction }: {
  title: string, sub?: string,
  action?: string, onAction?: () => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: D.text, letterSpacing: '-0.2px' }}>{title}</h2>
        {sub && <p style={{ margin: '2px 0 0', fontSize: '11px', color: D.textMuted }}>{sub}</p>}
      </div>
      {action && onAction && (
        <button onClick={onAction} style={{
          background: 'none', border: 'none', color: D.yellow,
          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
        }}>{action}</button>
      )}
    </div>
  )
}

// Déplacé vers components/ui/Toast.tsx (mission "Design System partagé
// Admin → Institution", 01/09/2026) — wrapper conservé ici pour ne pas
// casser les 8 appelants admin existants. Les 3 couleurs de fond (#14532d/
// #7f1d1d/#1e3a5f) n'étaient déjà pas des tokens `D` — reprises telles
// quelles pour un rendu strictement identique, pas "corrigées" au passage
// (hors périmètre de cette mission, cf. couleurs Admin).
const toastTokens: ToastTokens = {
  text: D.text, textMuted: D.textMuted, radius: D.radius, shadow: D.shadowLg,
  variants: {
    success: { bg: '#14532d', border: D.greenBrd, icon: D.green },
    error: { bg: '#7f1d1d', border: D.redBrd, icon: D.red },
    info: { bg: '#1e3a5f', border: D.blueBrd, icon: D.blue },
  },
}
export function ToastContainer({ toasts, remove }: { toasts: ToastItem[], remove: (id: string) => void }) {
  return <SharedToastContainer toasts={toasts} remove={remove} tokens={toastTokens}/>
}

export function KPICard({ label, value, sub, accent, delta, deltaPos, onClick, urgent, icon }: {
  label: string, value: string | number, sub?: string,
  accent: string, delta?: string, deltaPos?: boolean,
  onClick?: () => void, urgent?: boolean,
  icon: React.ReactNode,
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        backgroundColor: hov ? D.surface2 : D.surface,
        border: `1px solid ${urgent ? D.red + '50' : hov ? accent + '50' : D.border}`,
        borderRadius: D.radius, padding: '18px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        boxShadow: hov ? D.shadowMd : D.shadow,
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', backgroundColor: urgent ? D.red : accent, opacity: hov || urgent ? 1 : 0.4, transition: 'opacity 0.15s' }} />
      {urgent && (
        <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
          {Ic.Dot(D.red)}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <p style={{ margin: 0, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>{label}</p>
        <div style={{ color: accent, opacity: 0.7 }}>{icon}</div>
      </div>
      <p style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: '700', color: urgent ? D.red : D.text, letterSpacing: '-1px', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: '4px 0 0', fontSize: '11px', color: D.textMuted }}>{sub}</p>}
      {delta && (
        <div style={{ marginTop: '8px' }}>
          <StatBadge value={delta} positive={deltaPos ?? true} />
        </div>
      )}
    </div>
  )
}

export function LineChart({ data, color, height = 70 }: { data: number[], color: string, height?: number }) {
  if (!data.length) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted, fontSize: '11px' }}>Données insuffisantes</div>
  const max = Math.max(...data, 1), min = Math.min(...data)
  const W = 400, H = height
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / (max - min || 1)) * (H - 8) - 4
    return `${x},${y}`
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`M 0,${H} L ${pts.join(' L ')} L ${W},${H} Z`} fill={`url(#g${color.replace('#','')})`}/>
      <path d={`M ${pts.join(' L ')}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function BarChart({ data, color, labels }: { data: number[], color: string, labels: string[] }) {
  const max = Math.max(...data, 1)
  const W = 400, H = 70, bw = W / data.length - 3
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {data.map((v, i) => {
        const bh = (v / max) * (H - 14)
        const x = i * (W / data.length) + 1.5
        return (
          <g key={i}>
            <rect x={x} y={H - bh - 12} width={bw} height={bh} fill={color} rx="2" opacity="0.8"/>
            <text x={x + bw/2} y={H - 2} textAnchor="middle" fontSize="6" fill={D.textMuted}>{labels[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function PieChart({ data }: { data: { label: string, value: number, color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let angle = -Math.PI / 2
  const R = 38, cx = 45, cy = 45
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <svg viewBox="0 0 90 90" style={{ width: '90px', height: '90px', flexShrink: 0 }}>
        {data.map((d, i) => {
          const slice = (d.value / total) * 2 * Math.PI
          const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle)
          angle += slice
          const x2 = cx + R * Math.cos(angle), y2 = cy + R * Math.sin(angle)
          return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${slice > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`} fill={d.color} stroke={D.bg} strokeWidth="1.5"/>
        })}
        <circle cx={cx} cy={cy} r="18" fill={D.surface}/>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {data.slice(0, 5).map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '2px', backgroundColor: d.color, flexShrink: 0 }}/>
            <span style={{ fontSize: '11px', color: D.textSub, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: D.text }}>{Math.round(d.value/total*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Déplacé vers components/ui/Drawer.tsx (mission "Design System partagé
// Admin → Institution", 01/09/2026) — comportement desktop identique
// (panneau latéral droit inchangé), ajout d'un mode bottom-sheet mobile qui
// n'existait pas avant. Wrapper conservé ici pour ne pas casser les 8
// appelants admin existants (aucun n'a besoin de changer sa palette : `D`
// est injecté automatiquement, exactement comme avant).
const slidePanelTokens = { surface: D.surface, border: D.border, text: D.text, textMuted: D.textMuted, shadow: D.shadowLg }
export function SlidePanel({ open, onClose, title, width, children }: {
  open: boolean, onClose: () => void, title: string, width?: string, children: React.ReactNode
}) {
  return <Drawer open={open} onClose={onClose} title={title} width={width} tokens={slidePanelTokens}>{children}</Drawer>
}

// Déplacé vers components/ui/Table.tsx (mission "Design System partagé
// Admin → Institution", 01/09/2026) — rendu desktop strictement identique
// (mêmes valeurs D injectées via tokens), ajout d'un fallback cartes mobile
// qui n'existait pas avant (masqué par défaut sur desktop via CSS, aucun
// changement pour les 12 appelants admin existants).
const tableTokens: TableTokens = { text: D.text, textMuted: D.textMuted, border: D.border, hoverBg: D.surface2 }
export function DataTable({ cols, rows, onRowClick }: {
  cols: { key: string, label: string, width?: string }[]
  rows: Record<string, React.ReactNode>[]
  onRowClick?: (row: Record<string, React.ReactNode>) => void
}) {
  return <SharedDataTable cols={cols} rows={rows} onRowClick={onRowClick} tokens={tableTokens}/>
}
