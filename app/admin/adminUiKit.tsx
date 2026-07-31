'use client'

// Kit d'UI partagé de l'administration Yelen (chantier refonte admin
// 26/07/2026 — Lot C). Extrait de l'ancien monolithe app/admin/page.tsx
// (helpers utilisés par plusieurs vues) — source unique désormais.
import { useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import type { ToastItem } from '@/app/admin/adminTypes'

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

export function Badge({ label, color, bg }: { label: string, color: string, bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '20px',
      backgroundColor: bg, color,
      fontSize: '10px', fontWeight: '700', letterSpacing: '0.3px',
    }}>{label}</span>
  )
}

export function StatBadge({ value, positive }: { value: string, positive: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '20px',
      backgroundColor: positive ? D.greenDim : D.redDim,
      color: positive ? D.green : D.red,
      fontSize: '10px', fontWeight: '700',
    }}>
      {positive ? Ic.TrendUp(D.green) : Ic.TrendDn(D.red)} {value}
    </span>
  )
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

export function ToastContainer({ toasts, remove }: { toasts: ToastItem[], remove: (id: string) => void }) {
  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(60px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '11px 16px', minWidth: '260px',
          backgroundColor: t.type === 'success' ? '#14532d' : t.type === 'error' ? '#7f1d1d' : '#1e3a5f',
          border: `1px solid ${t.type === 'success' ? D.greenBrd : t.type === 'error' ? D.redBrd : D.blueBrd}`,
          borderRadius: D.radius, boxShadow: D.shadowLg,
          fontSize: '13px', color: D.text, fontWeight: '500',
          animation: 'slideInRight 0.2s ease',
        }}>
          <span style={{ color: t.type === 'success' ? D.green : t.type === 'error' ? D.red : D.blue, flexShrink: 0 }}>
            {t.type === 'success' ? Ic.Check(D.green) : t.type === 'error' ? Ic.X(D.red) : Ic.Bell(D.blue)}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', color: D.textMuted, cursor: 'pointer', padding: '0', lineHeight: 1 }}>
            {Ic.X(D.textMuted)}
          </button>
        </div>
      ))}
    </div>
  )
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

export function SlidePanel({ open, onClose, title, width = '480px', children }: {
  open: boolean, onClose: () => void, title: string, width?: string, children: React.ReactNode
}) {
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(2px)' }}/>}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width,
        backgroundColor: D.surface, borderLeft: `1px solid ${D.border}`,
        boxShadow: D.shadowLg, zIndex: 201,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: D.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textMuted, display: 'flex', padding: '4px' }}>
            {Ic.X(D.textMuted)}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>{children}</div>
      </div>
    </>
  )
}

export function DataTable({ cols, rows, onRowClick }: {
  cols: { key: string, label: string, width?: string }[]
  rows: Record<string, React.ReactNode>[]
  onRowClick?: (row: Record<string, React.ReactNode>) => void
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{ padding: '8px 12px', textAlign: 'left', color: D.textMuted, fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: `1px solid ${D.border}`, whiteSpace: 'nowrap', width: c.width }}>
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
              onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = D.surface2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent' }}
            >
              {cols.map(c => (
                <td key={c.key} style={{ padding: '10px 12px', borderBottom: `1px solid ${D.border}`, color: D.text, verticalAlign: 'middle' }}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
