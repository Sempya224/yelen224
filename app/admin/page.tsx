'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ═══════════════════════════════════════════════════════
// DESIGN SYSTEM — DARK FORCÉ
// ═══════════════════════════════════════════════════════
const D = {
  bg:        '#0f0f0f',
  surface:   '#161616',
  surface2:  '#1e1e1e',
  surface3:  '#262626',
  border:    '#2a2a2a',
  border2:   '#333333',
  text:      '#f0f0f0',
  textSub:   '#a0a0a0',
  textMuted: '#606060',
  yellow:    '#d4a017',
  yellowDim: 'rgba(212,160,23,0.12)',
  yellowBrd: 'rgba(212,160,23,0.25)',
  green:     '#22c55e',
  greenDim:  'rgba(34,197,94,0.10)',
  greenBrd:  'rgba(34,197,94,0.20)',
  red:       '#ef4444',
  redDim:    'rgba(239,68,68,0.10)',
  redBrd:    'rgba(239,68,68,0.20)',
  blue:      '#3b82f6',
  blueDim:   'rgba(59,130,246,0.10)',
  blueBrd:   'rgba(59,130,246,0.20)',
  orange:    '#f97316',
  orangeDim: 'rgba(249,115,22,0.10)',
  orangeBrd: 'rgba(249,115,22,0.20)',
  purple:    '#a855f7',
  purpleDim: 'rgba(168,85,247,0.10)',
  purpleBrd: 'rgba(168,85,247,0.20)',
  shadow:    '0 1px 3px rgba(0,0,0,0.4)',
  shadowMd:  '0 4px 16px rgba(0,0,0,0.5)',
  shadowLg:  '0 8px 32px rgba(0,0,0,0.6)',
  radius:    '10px',
  radiusSm:  '7px',
  radiusLg:  '14px',
  font:      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
}

// ═══════════════════════════════════════════════════════
// SVG ICONS — PAS D'EMOJIS
// ═══════════════════════════════════════════════════════
const P = { pointerEvents: 'none' as const }

const Ic = {
  Grid:     (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  Building: (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  Users:    (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Calendar: (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  CreditCard:(c='currentColor')=> <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Shield:   (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Megaphone:(c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>,
  BarChart: (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Key:      (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Logs:     (c='currentColor') => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  Search:   (c='currentColor') => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Refresh:  (c='currentColor') => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Bell:     (c='currentColor') => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Check:    (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X:        (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  ChevR:    (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  ChevL:    (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>,
  Warn:     (c='currentColor') => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Logout:   (c='currentColor') => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Upload:   (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  Send:     (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Clock:    (c='currentColor') => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Dot:      (c='currentColor') => <svg style={P} width="8" height="8" viewBox="0 0 24 24" fill={c}><circle cx="12" cy="12" r="12"/></svg>,
  Tool:     (c='currentColor') => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Star:     (c='currentColor') => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  TrendUp:  (c='currentColor') => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  TrendDn:  (c='currentColor') => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
  Filter:   (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Download: (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Eye:      (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Ban:      (c='currentColor') => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
}

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
type View = 'overview' | 'institutions' | 'citoyens' | 'rdv' | 'paiements' | 'moderation' | 'analytiques' | 'admins' | 'logs' | 'annonces'

interface KPIs {
  institutions_total: number
  institutions_actives: number
  institutions_en_attente: number
  institutions_suspendues: number
  citoyens_total: number
  citoyens_ce_mois: number
  citoyens_aujourd_hui: number
  rdv_total: number
  rdv_aujourd_hui: number
  rdv_ce_mois: number
  revenus_total: number
  revenus_ce_mois: number
  revenus_aujourd_hui: number
  signalements_non_traites: number
  avis_total: number
  avis_moyenne: number
  taux_presence: number
  taux_annulation: number
  paiements_en_attente: number
  documents_en_attente: number
  rdv_chart_30j: number[]
  rdv_labels_30j: string[]
  revenus_chart_12m: number[]
  revenus_labels_12m: string[]
  inscriptions_chart_30j: number[]
  secteurs: { label: string, value: number }[]
}

interface Institution {
  id: string
  name: string
  category: string
  ville: string
  statut: string
  created_at: string
  email?: string
  phone?: string
  badge_verifie?: boolean
  avertissements?: number
  plan?: string
  document_officiel?: string
  description?: string
  whatsapp?: string
  site_web?: string
  adresse?: string
  moyenne_avis?: number
  nb_avis?: number
  logo?: string
  quartier?: string
}

interface Annonce {
  id: string
  titre: string
  contenu: string
  type: string
  statut: string
  date_expiration?: string
  nb_vues: number
  nb_clics: number
  epingle: boolean
  institution_id?: string
  created_at: string
}

interface AdminUser {
  id: string
  email: string
  nom?: string
  prenom?: string
  role: string
  is_active: boolean
  last_login?: string
  created_at: string
}

interface Signalement {
  id: string
  type: string
  description: string
  statut: string
  created_at: string
  priorite?: string
  cible_type?: string
}

interface ActivityItem {
  id: string
  type: string
  message: string
  created_at: string
  actor?: string
}

interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function fmtMoney(n: number) {
  if (n >= 1_000_000_000) return `${(n/1e9).toFixed(2)} Mrd GNF`
  if (n >= 1_000_000)     return `${(n/1e6).toFixed(1)} M GNF`
  if (n >= 1_000)         return `${(n/1e3).toFixed(0)} K GNF`
  return `${n.toLocaleString('fr-FR')} GNF`
}

function fmtNum(n: number) { return n.toLocaleString('fr-FR') }

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1)  return "à l'instant"
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h/24)}j`
}

// ═══════════════════════════════════════════════════════
// MICRO COMPOSANTS
// ═══════════════════════════════════════════════════════
function Badge({ label, color, bg }: { label: string, color: string, bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '20px',
      backgroundColor: bg, color,
      fontSize: '10px', fontWeight: '700', letterSpacing: '0.3px',
    }}>{label}</span>
  )
}

function StatBadge({ value, positive }: { value: string, positive: boolean }) {
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

function Divider() {
  return <div style={{ height: '1px', backgroundColor: D.border, margin: '0' }} />
}

function SectionHeader({ title, sub, action, onAction }: {
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

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
function ToastContainer({ toasts, remove }: { toasts: ToastItem[], remove: (id: string) => void }) {
  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

// ═══════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════
function KPICard({ label, value, sub, accent, delta, deltaPos, onClick, urgent, icon }: {
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

// ═══════════════════════════════════════════════════════
// GRAPHES SVG
// ═══════════════════════════════════════════════════════
function LineChart({ data, color, height = 70 }: { data: number[], color: string, height?: number }) {
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

function BarChart({ data, color, labels }: { data: number[], color: string, labels: string[] }) {
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

function PieChart({ data }: { data: { label: string, value: number, color: string }[] }) {
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

// ═══════════════════════════════════════════════════════
// PANEL SLIDE-IN
// ═══════════════════════════════════════════════════════
function SlidePanel({ open, onClose, title, width = '480px', children }: {
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

// ═══════════════════════════════════════════════════════
// TABLE COMPONENT
// ═══════════════════════════════════════════════════════
function DataTable({ cols, rows, onRowClick }: {
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
// ═══════════════════════════════════════════════════════
// VUES SECONDAIRES
// ═══════════════════════════════════════════════════════

function ViewInstitutions({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
    const [data, setData] = useState<Institution[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('tous')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Institution | null>(null)
    const [panel, setPanel] = useState<string | null>(null)
    const [motif, setMotif] = useState('')
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [page, setPage] = useState(0)
  
    const load = useCallback(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ statut: filter, limit: '25', page: String(page) })
        if (search) params.set('search', search)
        const res = await fetch(`/api/admin/institutions?${params}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    }, [filter, search, page])
  
    useEffect(() => { load() }, [load])
  
    async function action(id: string, endpoint: string, body?: object) {
      setActionLoading(id + endpoint)
      try {
        // Mapper les actions spéciales vers leurs endpoints réels
        let url = `/api/admin/institutions/${id}/${endpoint}`
        let reqBody = body
        if (endpoint === 'badge_accorder') { url = `/api/admin/institutions/${id}/badge`; reqBody = { badge_verifie: true } }
        if (endpoint === 'badge_retirer')  { url = `/api/admin/institutions/${id}/badge`; reqBody = { badge_verifie: false } }
        if (endpoint === 'plan_premium')   { url = `/api/admin/institutions/${id}/plan`;  reqBody = { plan: 'premium' } }
        if (endpoint === 'plan_gratuit')   { url = `/api/admin/institutions/${id}/plan`;  reqBody = { plan: 'gratuit' } }

        const res = await fetch(url, {
          method: 'POST',
          headers: reqBody ? { 'Content-Type': 'application/json' } : {},
          body: reqBody ? JSON.stringify(reqBody) : undefined,
        })
        if (res.ok) {
          const messages: Record<string, string> = {
            valider: 'Institution validée',
            suspendre: 'Institution suspendue',
            refuser: 'Institution refusée',
            reactiver: 'Institution réactivée',
            avertir: 'Avertissement ajouté',
            badge_accorder: 'Badge accordé',
            badge_retirer: 'Badge retiré',
            plan_premium: 'Plan mis à Premium',
            plan_gratuit: 'Plan remis à Gratuit',
          }
          toast(messages[endpoint] || 'Action effectuée')
          // Recharger les données pour reflèter les changements
          load()
          setPanel(null)
          setMotif('')
        } else toast('Erreur action', 'error')
      } catch { toast('Erreur réseau', 'error') }
      finally { setActionLoading(null) }
    }
  
    const statusColor: Record<string, { color: string, bg: string, label: string }> = {
      active:     { color: D.green,  bg: D.greenDim,  label: 'Active'      },
      en_attente: { color: D.yellow, bg: D.yellowDim, label: 'En attente'  },
      suspendue:  { color: D.red,    bg: D.redDim,    label: 'Suspendue'   },
      refuse:     { color: D.orange, bg: D.orangeDim, label: 'Refusée'     },
    }
  
    const FILTERS = ['tous', 'en_attente', 'active', 'suspendue']
  
    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Institutions</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} résultats</p>
          </div>
          <button onClick={() => exportCSV('institutions')} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', backgroundColor: D.surface2,
            border: `1px solid ${D.border}`, borderRadius: D.radiusSm,
            fontSize: '12px', color: D.textSub, cursor: 'pointer',
          }}>
            {Ic.Download(D.textSub)} Exporter
          </button>
        </div>
  
        {/* Filtres + Recherche */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>
              {Ic.Search(D.textMuted)}
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom..."
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                backgroundColor: D.surface2, border: `1px solid ${D.border}`,
                borderRadius: D.radiusSm, fontSize: '13px', color: D.text,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{
                padding: '8px 14px', borderRadius: D.radiusSm, fontSize: '12px',
                fontWeight: filter === f ? '700' : '400',
                backgroundColor: filter === f ? D.yellow : D.surface2,
                color: filter === f ? '#000' : D.textSub,
                border: `1px solid ${filter === f ? D.yellow : D.border}`,
                cursor: 'pointer', transition: 'all 0.12s',
              }}>
                {f === 'tous' ? 'Tous' : f === 'en_attente' ? 'En attente' : f === 'active' ? 'Actives' : 'Suspendues'}
              </button>
            ))}
          </div>
        </div>
  
        {/* Table */}
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
          ) : data.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucune institution trouvée</div>
          ) : (
            <DataTable
              cols={[
                { key: 'nom',     label: 'Nom',     width: '28%' },
                { key: 'secteur', label: 'Secteur', width: '18%' },
                { key: 'ville',   label: 'Ville',   width: '14%' },
                { key: 'statut',  label: 'Statut',  width: '14%' },
                { key: 'date',    label: 'Inscrite', width: '14%' },
                { key: 'actions', label: 'Actions', width: '12%' },
              ]}
              rows={data.map(inst => {
                const s = statusColor[inst.statut] || { color: D.textMuted, bg: D.surface3, label: inst.statut }
                return {
                  nom:     <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    {inst.badge_verifie && <span title="Badge vérifié" style={{ color: D.blue, fontSize: '11px' }}>{Ic.Check(D.blue)}</span>}
                    <span style={{ fontWeight: '600', color: D.text }}>{inst.name}</span>
                    {inst.plan === 'premium' && <Badge label="PRO" color={D.yellow} bg={D.yellowDim}/>}
                    {(inst.avertissements || 0) > 0 && <span title={`${inst.avertissements} avertissement(s)`} style={{ color: D.red, fontSize: '10px', fontWeight: '700' }}>⚠{inst.avertissements}</span>}
                  </div>,
                  secteur: <span style={{ color: D.textSub }}>{inst.category || '—'}</span>,
                  ville:   <span style={{ color: D.textSub }}>{inst.ville || '—'}</span>,
                  statut:  <Badge label={s.label} color={s.color} bg={s.bg}/>,
                  date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(inst.created_at).toLocaleDateString('fr-FR')}</span>,
                  actions: (
                    <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setSelected(inst); setPanel('detail') }} style={{ padding: '4px 8px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                        Voir
                      </button>
                      {inst.statut === 'en_attente' && (
                        <button onClick={() => action(inst.id, 'valider')} disabled={actionLoading === inst.id + 'valider'} style={{ padding: '4px 8px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', color: D.green, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                          {actionLoading === inst.id + 'valider' ? '...' : Ic.Check(D.green)}
                        </button>
                      )}
                      {inst.statut === 'suspendue' ? (
                        <button onClick={() => action(inst.id, 'reactiver')} style={{ padding: '4px 8px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', color: D.green, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                          Réactiver
                        </button>
                      ) : (
                        <button onClick={() => { setSelected(inst); setPanel('suspendre') }} style={{ padding: '4px 8px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: '5px', color: D.red, fontSize: '11px', cursor: 'pointer' }}>
                          {Ic.Ban(D.red)}
                        </button>
                      )}
                    </div>
                  ),
                }
              })}
            />
          )}
          {/* Pagination */}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>
                {Ic.ChevL(D.textSub)} Préc
              </button>
              <button onClick={() => setPage(p => p+1)} disabled={data.length < 25} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 25 ? 0.4 : 1 }}>
                Suiv {Ic.ChevR(D.textSub)}
              </button>
            </div>
          </div>
        </div>
  
        {/* Panel détail */}
        <SlidePanel open={panel === 'detail'} onClose={() => setPanel(null)} title={selected?.name || 'Détail'} width="520px">
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* En-tête */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `linear-gradient(135deg, ${D.yellow}, #b8860b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '800', color: '#000', flexShrink: 0, overflow: 'hidden' }}>
                  {selected.logo ? <img src={selected.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : (selected.name?.slice(0,2) || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', color: D.text, fontSize: '14px' }}>{selected.name}</span>
                    {selected.badge_verifie && <span title="Badge vérifié" style={{ color: D.blue }}>{Ic.Check(D.blue)}</span>}
                    {selected.plan === 'premium' && <Badge label="PREMIUM" color={D.yellow} bg={D.yellowDim}/>}
                  </div>
                  <div style={{ color: D.textMuted, fontSize: '11px' }}>{selected.category} · {selected.ville}</div>
                </div>
              </div>

              {/* Infos */}
              <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
                {([
                  ['Catégorie', selected.category || '—'],
                  ['Ville / Quartier', [selected.ville, selected.quartier].filter(Boolean).join(', ') || '—'],
                  ['Adresse', selected.adresse || '—'],
                  ['Email', selected.email || '—'],
                  ['Téléphone', selected.phone || '—'],
                  ['WhatsApp', selected.whatsapp || '—'],
                  ['Site web', selected.site_web || '—'],
                  ['Statut', selected.statut],
                  ['Plan', selected.plan || 'gratuit'],
                  ['Avertissements', String(selected.avertissements || 0)],
                  ['Note moyenne', selected.moyenne_avis ? `${selected.moyenne_avis.toFixed(1)} / 5 (${selected.nb_avis} avis)` : '—'],
                  ['Document officiel', selected.document_officiel ? 'Fourni' : 'Non fourni'],
                  ['Inscrite le', new Date(selected.created_at).toLocaleDateString('fr-FR')],
                ] as [string, string][]).map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                    <span style={{ fontSize: '11px', color: D.textMuted }}>{l}</span>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: l === 'Avertissements' && parseInt(v) > 0 ? D.red : D.text, maxWidth: '240px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Description */}
              {selected.description && (
                <div style={{ padding: '10px 12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                  <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: D.textMuted, letterSpacing: '0.6px' }}>Description</p>
                  <p style={{ margin: 0, fontSize: '12px', color: D.textSub, lineHeight: 1.5 }}>{selected.description}</p>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: D.textMuted, letterSpacing: '0.6px' }}>Actions</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {selected.statut === 'en_attente' && (
                    <button onClick={() => action(selected.id, 'valider')} style={{ padding: '9px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12px', fontWeight: '600', cursor: 'pointer', gridColumn: '1/-1' }}>
                      Valider l'institution
                    </button>
                  )}
                  {selected.statut === 'suspendue' ? (
                    <button onClick={() => action(selected.id, 'reactiver')} style={{ padding: '9px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12px', fontWeight: '600', cursor: 'pointer', gridColumn: '1/-1' }}>
                      Réactiver le compte
                    </button>
                  ) : (
                    <button onClick={() => action(selected.id, 'suspendre')} style={{ padding: '9px', backgroundColor: D.orangeDim, border: `1px solid ${D.orangeBrd}`, borderRadius: D.radiusSm, color: D.orange, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                      Suspendre
                    </button>
                  )}
                  <button onClick={() => setPanel('refus')} style={{ padding: '9px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, color: D.red, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    Refuser
                  </button>
                  <button onClick={() => action(selected.id, 'avertir')} style={{ padding: '9px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    + Avertissement
                  </button>
                  <button onClick={() => action(selected.id, selected.badge_verifie ? 'badge_retirer' : 'badge_accorder')} style={{ padding: '9px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: D.radiusSm, color: D.blue, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    {selected.badge_verifie ? 'Retirer badge' : 'Accorder badge'}
                  </button>
                  <button onClick={() => action(selected.id, selected.plan === 'premium' ? 'plan_gratuit' : 'plan_premium')} style={{ padding: '9px', backgroundColor: D.purpleDim, border: `1px solid ${D.purpleBrd}`, borderRadius: D.radiusSm, color: D.purple, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    {selected.plan === 'premium' ? 'Passer gratuit' : 'Passer premium'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </SlidePanel>
  
        {/* Panel refus */}
        <SlidePanel open={panel === 'refus'} onClose={() => setPanel(null)} title="Motif de refus">
          <p style={{ fontSize: '13px', color: D.textSub, marginBottom: '14px' }}>L'institution sera notifiée avec ce motif.</p>
          <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Indiquez le motif..." rows={5}
            style={{ width: '100%', padding: '10px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, resize: 'vertical', outline: 'none', fontFamily: D.font, boxSizing: 'border-box', marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => selected && action(selected.id, 'refuser', { motif })} disabled={!motif.trim() || !!actionLoading}
              style={{ flex: 1, padding: '11px', backgroundColor: D.red, border: 'none', borderRadius: D.radiusSm, color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', opacity: !motif.trim() ? 0.5 : 1 }}>
              Confirmer le refus
            </button>
            <button onClick={() => setPanel('detail')} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>
              Retour
            </button>
          </div>
        </SlidePanel>
      </div>
    )
  }
  
  // ═══════════════════════════════════════════════════════
  // VUE CITOYENS
  // ═══════════════════════════════════════════════════════
  function ViewCitoyens({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
    const [data, setData] = useState<{id:string,nom:string,prenom:string,phone:string,email:string,created_at:string}[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
  
    const load = useCallback(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '25', page: String(page) })
        if (search) params.set('search', search)
        const res = await fetch(`/api/admin/citoyens?${params}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    }, [search, page])
  
    useEffect(() => { load() }, [load])
  
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Citoyens</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} résultats</p>
          </div>
          <button onClick={() => exportCSV('citoyens')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
            {Ic.Download(D.textSub)} Exporter
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>{Ic.Search(D.textMuted)}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, prénom, téléphone..."
            style={{ width: '100%', padding: '9px 12px 9px 32px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
          ) : (
            <DataTable
              cols={[
                { key: 'nom',     label: 'Nom complet', width: '30%' },
                { key: 'phone',   label: 'Téléphone',   width: '20%' },
                { key: 'email',   label: 'Email',        width: '25%' },
                { key: 'date',    label: 'Inscrit le',   width: '15%' },
                { key: 'actions', label: 'Actions',      width: '10%' },
              ]}
              rows={data.map(u => ({
                nom:     <span style={{ fontWeight: '600', color: D.text }}>{u.prenom} {u.nom}</span>,
                phone:   <span style={{ color: D.textSub, fontFamily: 'monospace', fontSize: '12px' }}>{u.phone || '—'}</span>,
                email:   <span style={{ color: D.textMuted, fontSize: '12px' }}>{u.email || '—'}</span>,
                date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</span>,
                actions: (
                  <button style={{ padding: '4px 8px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                    Voir
                  </button>
                ),
              }))}
            />
          )}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>Préc</button>
              <button onClick={() => setPage(p => p+1)} disabled={data.length < 25} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 25 ? 0.4 : 1 }}>Suiv</button>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // ═══════════════════════════════════════════════════════
  // VUE RDV
  // ═══════════════════════════════════════════════════════
  function ViewRDV({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
    const [data, setData] = useState<{id:string,statut:string,created_at:string,date_rdv:string,heure_rdv:string,institution_id:string}[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('tous')
    const [page, setPage] = useState(0)
  
    const load = useCallback(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '25', page: String(page) })
        if (filter !== 'tous') params.set('statut', filter)
        const res = await fetch(`/api/admin/rdv?${params}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    }, [filter, page])
  
    useEffect(() => { load() }, [load])
  
    const statusColor: Record<string, { color: string, bg: string, label: string }> = {
      confirme:   { color: D.green,  bg: D.greenDim,  label: 'Confirmé'   },
      en_attente: { color: D.yellow, bg: D.yellowDim, label: 'En attente' },
      annule:     { color: D.red,    bg: D.redDim,    label: 'Annulé'     },
      termine:    { color: D.blue,   bg: D.blueDim,   label: 'Terminé'    },
      no_show:    { color: D.orange, bg: D.orangeDim, label: 'Absent'     },
    }
  
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Rendez-vous</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} résultats</p>
          </div>
          <button onClick={() => exportCSV('rdv')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
            {Ic.Download(D.textSub)} Exporter
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['tous', 'confirme', 'en_attente', 'annule', 'termine'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{ padding: '7px 14px', borderRadius: D.radiusSm, fontSize: '12px', fontWeight: filter === f ? '700' : '400', backgroundColor: filter === f ? D.yellow : D.surface2, color: filter === f ? '#000' : D.textSub, border: `1px solid ${filter === f ? D.yellow : D.border}`, cursor: 'pointer' }}>
              {f === 'tous' ? 'Tous' : statusColor[f]?.label || f}
            </button>
          ))}
        </div>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
          ) : (
            <DataTable
              cols={[
                { key: 'id',      label: 'ID',        width: '10%' },
                { key: 'statut',  label: 'Statut',    width: '15%' },
                { key: 'date',    label: 'Date RDV',  width: '18%' },
                { key: 'heure',   label: 'Heure',     width: '12%' },
                { key: 'inst',    label: 'Institution',width: '25%' },
                { key: 'cree',    label: 'Créé le',   width: '20%' },
              ]}
              rows={data.map(r => {
                const s = statusColor[r.statut] || { color: D.textMuted, bg: D.surface3, label: r.statut }
                return {
                  id:     <span style={{ fontFamily: 'monospace', fontSize: '10px', color: D.textMuted }}>{r.id.slice(0,8)}...</span>,
                  statut: <Badge label={s.label} color={s.color} bg={s.bg}/>,
                  date:   <span style={{ color: D.textSub, fontSize: '12px' }}>{r.date_rdv || '—'}</span>,
                  heure:  <span style={{ color: D.textSub, fontSize: '12px' }}>{r.heure_rdv || '—'}</span>,
                  inst:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{r.institution_id?.slice(0,12) || '—'}...</span>,
                  cree:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(r.created_at).toLocaleDateString('fr-FR')}</span>,
                }
              })}
            />
          )}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>Préc</button>
              <button onClick={() => setPage(p => p+1)} disabled={data.length < 25} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 25 ? 0.4 : 1 }}>Suiv</button>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // ═══════════════════════════════════════════════════════
  // VUE MODERATION
  // ═══════════════════════════════════════════════════════
  function ViewModeration({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
    const [signalements, setSignalements] = useState<Signalement[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<Signalement | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
  
    const load = useCallback(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/signalements?statut=tous&limit=30')
        if (res.ok) setSignalements(await res.json())
      } finally { setLoading(false) }
    }, [])
  
    useEffect(() => { load() }, [load])
  
    async function resolveAction(id: string, endpoint: string) {
      setActionLoading(id + endpoint)
      try {
        const res = await fetch(`/api/admin/signalements/${id}/${endpoint}`, { method: 'POST' })
        if (res.ok) {
          toast(endpoint === 'resoudre' ? 'Signalement résolu' : 'Signalement ignoré', 'success')
          setSignalements(prev => prev.filter(s => s.id !== id))
          setSelected(null)
        } else toast('Erreur', 'error')
      } catch { toast('Erreur réseau', 'error') }
      finally { setActionLoading(null) }
    }
  
    const statusColor: Record<string, { color: string, bg: string, label: string }> = {
      nouveau:    { color: D.red,    bg: D.redDim,    label: 'Nouveau'    },
      en_cours:   { color: D.orange, bg: D.orangeDim, label: 'En cours'   },
      resolu:     { color: D.green,  bg: D.greenDim,  label: 'Résolu'     },
      ignore:     { color: D.textMuted, bg: D.surface3, label: 'Ignoré'   },
    }
  
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Modération</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{signalements.length} signalement(s)</p>
        </div>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
          ) : signalements.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucun signalement</div>
          ) : (
            <DataTable
              cols={[
                { key: 'type',    label: 'Type',        width: '18%' },
                { key: 'desc',    label: 'Description', width: '32%' },
                { key: 'statut',  label: 'Statut',      width: '14%' },
                { key: 'date',    label: 'Date',         width: '16%' },
                { key: 'actions', label: 'Actions',      width: '20%' },
              ]}
              rows={signalements.map(sig => {
                const s = statusColor[sig.statut] || { color: D.textMuted, bg: D.surface3, label: sig.statut }
                return {
                  type:    <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{sig.type || 'Non spécifié'}</span>,
                  desc:    <span style={{ color: D.textSub, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '200px' }}>{sig.description || '—'}</span>,
                  statut:  <Badge label={s.label} color={s.color} bg={s.bg}/>,
                  date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(sig.created_at).toLocaleDateString('fr-FR')}</span>,
                  actions: (
                    <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setSelected(sig)} style={{ padding: '4px 8px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Voir</button>
                      {sig.statut === 'nouveau' && (
                        <>
                          <button onClick={() => resolveAction(sig.id, 'resoudre')} disabled={actionLoading === sig.id + 'resoudre'} style={{ padding: '4px 8px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', color: D.green, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                            {Ic.Check(D.green)}
                          </button>
                          <button onClick={() => resolveAction(sig.id, 'ignorer')} disabled={actionLoading === sig.id + 'ignorer'} style={{ padding: '4px 8px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: '5px', color: D.textMuted, fontSize: '11px', cursor: 'pointer' }}>
                            {Ic.X(D.textMuted)}
                          </button>
                        </>
                      )}
                    </div>
                  ),
                }
              })}
            />
          )}
        </div>
  
        {/* Panel détail signalement */}
        <SlidePanel open={!!selected} onClose={() => setSelected(null)} title="Détail signalement">
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
                {[
                  ['Type', selected.type || '—'],
                  ['Statut', selected.statut],
                  ['Priorité', selected.priorite || 'Normale'],
                  ['Cible', selected.cible_type || '—'],
                  ['Date', new Date(selected.created_at).toLocaleDateString('fr-FR')],
                ].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                    <span style={{ fontSize: '12px', color: D.textMuted }}>{l}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: D.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Description</p>
                <p style={{ margin: 0, fontSize: '13px', color: D.text, lineHeight: 1.6, padding: '12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                  {selected.description || 'Aucune description'}
                </p>
              </div>
              {selected.statut === 'nouveau' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => resolveAction(selected.id, 'resoudre')} style={{ flex: 1, padding: '11px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    Marquer résolu
                  </button>
                  <button onClick={() => resolveAction(selected.id, 'ignorer')} style={{ flex: 1, padding: '11px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    Ignorer
                  </button>
                </div>
              )}
            </div>
          )}
        </SlidePanel>
      </div>
    )
  }
  
  // ═══════════════════════════════════════════════════════
  // VUE ANALYTIQUES
  // ═══════════════════════════════════════════════════════
  function ViewAnalytiques({ kpis }: { kpis: KPIs | null }) {
    const SECT_COLORS = [D.yellow, D.blue, D.green, D.orange, D.purple, D.red, '#06b6d4', '#ec4899']
  
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Analytiques</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>Données 30 derniers jours</p>
        </div>
        {!kpis ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Chargement...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Graphes en 3 colonnes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {/* RDV */}
              <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
                <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>RDV — 30 jours</p>
                <p style={{ margin: '0 0 14px', fontSize: '24px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>{(kpis.rdv_ce_mois).toLocaleString('fr-FR')}</p>
                <LineChart data={kpis.rdv_chart_30j} color={D.orange} height={70}/>
              </div>
              {/* Revenus */}
              <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
                <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Revenus — 12 mois</p>
                <p style={{ margin: '0 0 14px', fontSize: '24px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>{fmtMoney(kpis.revenus_total)}</p>
                <BarChart data={kpis.revenus_chart_12m} color={D.green} labels={kpis.revenus_labels_12m}/>
              </div>
              {/* Secteurs */}
              <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
                <p style={{ margin: '0 0 14px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Secteurs institutions</p>
                {kpis.secteurs.length > 0
                  ? <PieChart data={kpis.secteurs.map((s, i) => ({ ...s, color: SECT_COLORS[i % SECT_COLORS.length] }))}/>
                  : <div style={{ color: D.textMuted, fontSize: '12px' }}>Aucune donnée</div>
                }
              </div>
            </div>
  
            {/* Inscriptions */}
            <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Inscriptions citoyens — 30 jours</p>
                  <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>+{kpis.citoyens_ce_mois.toLocaleString('fr-FR')}</p>
                </div>
                <StatBadge value={`+${kpis.citoyens_aujourd_hui} aujourd'hui`} positive={true}/>
              </div>
              <LineChart data={kpis.inscriptions_chart_30j} color={D.blue} height={60}/>
            </div>
  
            {/* Métriques tableau */}
            <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.border}` }}>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.textMuted }}>Indicateurs de performance</p>
              </div>
              <DataTable
                cols={[
                  { key: 'metric', label: 'Indicateur', width: '50%' },
                  { key: 'value',  label: 'Valeur',     width: '25%' },
                  { key: 'status', label: 'Statut',     width: '25%' },
                ]}
                rows={[
                  { metric: 'Taux de présence moyen',       value: `${kpis.taux_presence}%`,   status: <StatBadge value={`${kpis.taux_presence}%`} positive={kpis.taux_presence > 60}/> },
                  { metric: "Taux d'annulation",            value: `${kpis.taux_annulation}%`, status: <StatBadge value={`${kpis.taux_annulation}%`} positive={kpis.taux_annulation < 20}/> },
                  { metric: 'Satisfaction moyenne',         value: kpis.avis_moyenne > 0 ? `${kpis.avis_moyenne.toFixed(1)} / 5` : '—', status: <div style={{ display: 'flex', gap: '2px' }}>{Array.from({length:5}).map((_,i) => <span key={i} style={{ color: i < Math.round(kpis.avis_moyenne) ? D.yellow : D.surface3 }}>{Ic.Star(i < Math.round(kpis.avis_moyenne) ? D.yellow : D.surface3)}</span>)}</div> },
                  { metric: 'Institutions actives / total', value: `${kpis.institutions_actives} / ${kpis.institutions_total}`, status: <StatBadge value={`${Math.round(kpis.institutions_actives/Math.max(kpis.institutions_total,1)*100)}%`} positive={true}/> },
                  { metric: 'Signalements ouverts',         value: fmtNum(kpis.signalements_non_traites), status: <Badge label={kpis.signalements_non_traites === 0 ? 'Aucun' : 'Attention'} color={kpis.signalements_non_traites === 0 ? D.green : D.red} bg={kpis.signalements_non_traites === 0 ? D.greenDim : D.redDim}/> },
                ]}
              />
            </div>
          </div>
        )}
      </div>
    )
  }
  
  // ═══════════════════════════════════════════════════════
  // VUE LOGS
  // ═══════════════════════════════════════════════════════
  function ViewLogs() {
    const [data, setData] = useState<{id:string,action:string,created_at:string,admin_id:string,cible_table:string,cible_id:string,details:Record<string,unknown>}[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(0)
  
    const load = useCallback(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/logs?limit=30&page=${page}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    }, [page])
  
    useEffect(() => { load() }, [load])
  
    const actionColor: Record<string, string> = {
      LOGIN: D.green, LOGOUT: D.textMuted,
      VALIDER_INSTITUTION: D.green, SUSPENDRE_INSTITUTION: D.red,
      REFUSER_INSTITUTION: D.orange, BROADCAST_NOTIFICATION: D.blue,
      EXPORT_CSV: D.yellow, RESOUDRE_SIGNALEMENT: D.green,
      IGNORER_SIGNALEMENT: D.textMuted,
    }
  
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Logs système</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>Toutes les actions administrateurs</p>
          </div>
          <button onClick={() => load()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
            {Ic.Refresh(D.textSub)} Actualiser
          </button>
        </div>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement...</div>
          ) : (
            <DataTable
              cols={[
                { key: 'action',  label: 'Action',    width: '25%' },
                { key: 'cible',   label: 'Cible',     width: '20%' },
                { key: 'details', label: 'Détails',   width: '30%' },
                { key: 'date',    label: 'Date',       width: '25%' },
              ]}
              rows={data.map(log => ({
                action:  <span style={{ fontWeight: '700', fontSize: '11px', color: actionColor[log.action] || D.textSub, fontFamily: 'monospace' }}>{log.action}</span>,
                cible:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{log.cible_table || '—'} {log.cible_id ? `· ${log.cible_id.slice(0,8)}` : ''}</span>,
                details: <span style={{ color: D.textMuted, fontSize: '11px', fontFamily: 'monospace' }}>{log.details ? JSON.stringify(log.details).slice(0, 60) : '—'}</span>,
                date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(log.created_at).toLocaleString('fr-FR')}</span>,
              }))}
            />
          )}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>Préc</button>
              <button onClick={() => setPage(p => p+1)} disabled={data.length < 30} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 30 ? 0.4 : 1 }}>Suiv</button>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // ═══════════════════════════════════════════════════════
  // VUE PAIEMENTS
  // ═══════════════════════════════════════════════════════
  function ViewPaiements({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
    const [data, setData] = useState<{id:string,montant:number,statut:string,created_at:string,institution_id:string,citoyen_id:string}[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('tous')
    const [page, setPage] = useState(0)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ limit: '25', page: String(page) })
        if (filter !== 'tous') params.set('statut', filter)
        const res = await fetch(`/api/admin/export?type=paiements`)
        if (!res.ok) { setError('Table paiements inaccessible ou inexistante'); setData([]); return }
        // Pour l'affichage direct, on utilise l'API rdv adaptée
        const r2 = await fetch(`/api/admin/rdv?limit=25&page=${page}`)
        if (r2.ok) setData(await r2.json())
      } catch { setError('Erreur chargement') }
      finally { setLoading(false) }
    }, [page, filter])

    useEffect(() => { load() }, [load])

    const statusColor: Record<string, { color: string, bg: string, label: string }> = {
      confirme:   { color: D.green,  bg: D.greenDim,  label: 'Confirmé'   },
      en_attente: { color: D.yellow, bg: D.yellowDim, label: 'En attente' },
      annule:     { color: D.red,    bg: D.redDim,    label: 'Annulé'     },
      termine:    { color: D.blue,   bg: D.blueDim,   label: 'Terminé'    },
    }

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Rendez-vous & Paiements</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>Suivi des RDV et transactions</p>
          </div>
          <button onClick={() => exportCSV('rdv')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
            {Ic.Download(D.textSub)} Exporter CSV
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['tous','confirme','en_attente','annule','termine'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{ padding: '7px 14px', borderRadius: D.radiusSm, fontSize: '12px', fontWeight: filter === f ? '700' : '400', backgroundColor: filter === f ? D.yellow : D.surface2, color: filter === f ? '#000' : D.textSub, border: `1px solid ${filter === f ? D.yellow : D.border}`, cursor: 'pointer' }}>
              {f === 'tous' ? 'Tous' : statusColor[f]?.label || f}
            </button>
          ))}
        </div>

        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Chargement...</div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>{error}</div>
          ) : data.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Aucun résultat</div>
          ) : (
            <DataTable
              cols={[
                { key: 'id',     label: 'ID',         width: '10%' },
                { key: 'statut', label: 'Statut',     width: '15%' },
                { key: 'date',   label: 'Date RDV',   width: '18%' },
                { key: 'heure',  label: 'Heure',      width: '12%' },
                { key: 'inst',   label: 'Institution',width: '25%' },
                { key: 'cree',   label: 'Créé le',    width: '20%' },
              ]}
              rows={(data as unknown as {id:string,statut:string,date_rdv:string,heure_rdv:string,institution_id:string,created_at:string}[]).map(r => {
                const s = statusColor[r.statut] || { color: D.textMuted, bg: D.surface3, label: r.statut }
                return {
                  id:     <span style={{ fontFamily: 'monospace', fontSize: '10px', color: D.textMuted }}>{r.id.slice(0,8)}…</span>,
                  statut: <Badge label={s.label} color={s.color} bg={s.bg}/>,
                  date:   <span style={{ color: D.textSub, fontSize: '12px' }}>{r.date_rdv || '—'}</span>,
                  heure:  <span style={{ color: D.textSub, fontSize: '12px' }}>{r.heure_rdv || '—'}</span>,
                  inst:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{r.institution_id?.slice(0,12) || '—'}…</span>,
                  cree:   <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(r.created_at).toLocaleDateString('fr-FR')}</span>,
                }
              })}
            />
          )}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>Préc</button>
              <button onClick={() => setPage(p => p+1)} disabled={data.length < 25} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 25 ? 0.4 : 1 }}>Suiv</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // VUE ANNONCES
  // ═══════════════════════════════════════════════════════
  function ViewAnnonces({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
    const [data, setData] = useState<Annonce[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('tous')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const [panel, setPanel] = useState<string | null>(null)
    const [selected, setSelected] = useState<Annonce | null>(null)
    const [form, setForm] = useState({ titre: '', contenu: '', type: 'information', statut: 'publiee', date_expiration: '', epingle: false })
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '25', page: String(page) })
        if (filter !== 'tous') params.set('statut', filter)
        if (search) params.set('search', search)
        const res = await fetch(`/api/admin/annonces?${params}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    }, [filter, search, page])

    useEffect(() => { load() }, [load])

    async function saveAnnonce() {
      if (!form.titre.trim() || !form.contenu.trim()) { toast('Titre et contenu requis', 'error'); return }
      setSaving(true)
      try {
        const url = selected ? `/api/admin/annonces/${selected.id}` : '/api/admin/annonces'
        const method = selected ? 'PATCH' : 'POST'
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (res.ok) {
          toast(selected ? 'Annonce modifiée' : 'Annonce créée')
          setPanel(null); setSelected(null)
          setForm({ titre: '', contenu: '', type: 'information', statut: 'publiee', date_expiration: '', epingle: false })
          load()
        } else toast('Erreur sauvegarde', 'error')
      } finally { setSaving(false) }
    }

    async function deleteAnnonce(id: string) {
      if (!confirm('Supprimer cette annonce ?')) return
      const res = await fetch(`/api/admin/annonces/${id}`, { method: 'DELETE' })
      if (res.ok) { toast('Annonce supprimée'); load() }
      else toast('Erreur suppression', 'error')
    }

    async function togglePin(ann: Annonce) {
      await fetch(`/api/admin/annonces/${ann.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ epingle: !ann.epingle }) })
      load()
    }

    const typeColor: Record<string, { color: string, bg: string }> = {
      information: { color: D.blue,   bg: D.blueDim   },
      urgent:      { color: D.red,    bg: D.redDim    },
      evenement:   { color: D.purple, bg: D.purpleDim },
      alerte:      { color: D.orange, bg: D.orangeDim },
    }

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Annonces</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} annonce(s)</p>
          </div>
          <button onClick={() => { setSelected(null); setForm({ titre:'', contenu:'', type:'information', statut:'publiee', date_expiration:'', epingle:false }); setPanel('form') }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, fontSize: '12px', color: '#000', fontWeight: '700', cursor: 'pointer' }}>
            + Nouvelle annonce
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>{Ic.Search(D.textMuted)}</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ width: '100%', padding: '8px 12px 8px 32px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['tous','publiee','archivee'].map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{ padding: '8px 14px', borderRadius: D.radiusSm, fontSize: '12px', fontWeight: filter === f ? '700' : '400', backgroundColor: filter === f ? D.yellow : D.surface2, color: filter === f ? '#000' : D.textSub, border: `1px solid ${filter === f ? D.yellow : D.border}`, cursor: 'pointer' }}>
                {f === 'tous' ? 'Toutes' : f === 'publiee' ? 'Publiées' : 'Archivées'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Chargement...</div>
          ) : data.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Aucune annonce</div>
          ) : (
            <DataTable
              cols={[
                { key: 'titre',  label: 'Titre',       width: '30%' },
                { key: 'type',   label: 'Type',        width: '12%' },
                { key: 'statut', label: 'Statut',      width: '12%' },
                { key: 'vues',   label: 'Vues',        width: '10%' },
                { key: 'epingle',label: 'Épinglée',    width: '10%' },
                { key: 'date',   label: 'Date',        width: '14%' },
                { key: 'actions',label: 'Actions',     width: '12%' },
              ]}
              rows={data.map(ann => {
                const tc = typeColor[ann.type] || { color: D.textMuted, bg: D.surface3 }
                return {
                  titre:   <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{ann.titre}</span>,
                  type:    <Badge label={ann.type} color={tc.color} bg={tc.bg}/>,
                  statut:  <Badge label={ann.statut} color={ann.statut === 'publiee' ? D.green : D.textMuted} bg={ann.statut === 'publiee' ? D.greenDim : D.surface3}/>,
                  vues:    <span style={{ color: D.textSub, fontSize: '12px' }}>{ann.nb_vues || 0}</span>,
                  epingle: <span style={{ color: ann.epingle ? D.yellow : D.textMuted, cursor: 'pointer' }} onClick={() => togglePin(ann)}>{ann.epingle ? '★' : '☆'}</span>,
                  date:    <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(ann.created_at).toLocaleDateString('fr-FR')}</span>,
                  actions: (
                    <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setSelected(ann); setForm({ titre: ann.titre, contenu: ann.contenu, type: ann.type, statut: ann.statut, date_expiration: ann.date_expiration || '', epingle: ann.epingle }); setPanel('form') }} style={{ padding: '4px 7px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', color: D.blue, fontSize: '11px', cursor: 'pointer' }}>
                        Éditer
                      </button>
                      <button onClick={() => deleteAnnonce(ann.id)} style={{ padding: '4px 7px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: '5px', color: D.red, fontSize: '11px', cursor: 'pointer' }}>
                        {Ic.X(D.red)}
                      </button>
                    </div>
                  ),
                }
              })}
            />
          )}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: D.textMuted }}>Page {page + 1}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }}>Préc</button>
              <button onClick={() => setPage(p => p+1)} disabled={data.length < 25} style={{ padding: '5px 10px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, cursor: 'pointer', fontSize: '12px', opacity: data.length < 25 ? 0.4 : 1 }}>Suiv</button>
            </div>
          </div>
        </div>

        {/* Panel formulaire annonce */}
        <SlidePanel open={panel === 'form'} onClose={() => setPanel(null)} title={selected ? 'Modifier l\'annonce' : 'Nouvelle annonce'} width="500px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Titre *</label>
              <input value={form.titre} onChange={e => setForm(f => ({...f, titre: e.target.value}))} placeholder="Titre de l'annonce" style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Contenu *</label>
              <textarea value={form.contenu} onChange={e => setForm(f => ({...f, contenu: e.target.value}))} rows={5} placeholder="Contenu de l'annonce..." style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, resize: 'vertical', outline: 'none', fontFamily: D.font, boxSizing: 'border-box' }}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="information">Information</option>
                  <option value="urgent">Urgent</option>
                  <option value="evenement">Événement</option>
                  <option value="alerte">Alerte</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Statut</label>
                <select value={form.statut} onChange={e => setForm(f => ({...f, statut: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="publiee">Publiée</option>
                  <option value="archivee">Archivée</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Date d'expiration (optionnel)</label>
              <input type="date" value={form.date_expiration} onChange={e => setForm(f => ({...f, date_expiration: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.epingle} onChange={e => setForm(f => ({...f, epingle: e.target.checked}))} style={{ width: '16px', height: '16px', cursor: 'pointer' }}/>
              <span style={{ fontSize: '13px', color: D.textSub }}>Épingler en haut</span>
            </label>
            <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
              <button onClick={saveAnnonce} disabled={saving} style={{ flex: 1, padding: '11px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, color: '#000', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Sauvegarde...' : selected ? 'Enregistrer' : 'Créer l\'annonce'}
              </button>
              <button onClick={() => setPanel(null)} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
            </div>
          </div>
        </SlidePanel>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // VUE ADMINS
  // ═══════════════════════════════════════════════════════
  function ViewAdmins({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
    const [data, setData] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [panel, setPanel] = useState<string | null>(null)
    const [form, setForm] = useState({ email: '', password: '', nom: '', prenom: '', role: 'support' })
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/admins')
        if (res.ok) setData(await res.json())
        else setData([])
      } finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    async function createAdmin() {
      if (!form.email || !form.password) { toast('Email et mot de passe requis', 'error'); return }
      setSaving(true)
      try {
        const res = await fetch('/api/admin/admins', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(form) })
        if (res.ok) { toast('Admin créé'); setPanel(null); setForm({ email:'', password:'', nom:'', prenom:'', role:'support' }); load() }
        else { const d = await res.json(); toast(d.error || 'Erreur', 'error') }
      } finally { setSaving(false) }
    }

    async function toggleActive(id: string, active: boolean) {
      const res = await fetch(`/api/admin/admins/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_active: !active }) })
      if (res.ok) { toast(active ? 'Admin désactivé' : 'Admin réactivé'); load() }
      else toast('Erreur', 'error')
    }

    async function deleteAdmin(id: string) {
      if (!confirm('Supprimer cet admin ?')) return
      const res = await fetch(`/api/admin/admins/${id}`, { method: 'DELETE' })
      if (res.ok) { toast('Admin supprimé'); load() }
      else toast('Erreur suppression', 'error')
    }

    const roleColor: Record<string, { color: string, bg: string }> = {
      super_admin: { color: D.yellow, bg: D.yellowDim },
      admin:       { color: D.blue,   bg: D.blueDim   },
      support:     { color: D.green,  bg: D.greenDim  },
      moderateur:  { color: D.purple, bg: D.purpleDim },
    }

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Gestion des admins</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>{data.length} compte(s) administrateur</p>
          </div>
          <button onClick={() => setPanel('create')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, fontSize: '12px', color: '#000', fontWeight: '700', cursor: 'pointer' }}>
            + Nouvel admin
          </button>
        </div>

        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Chargement...</div>
          ) : data.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted }}>Accès super_admin requis pour lister les admins</div>
          ) : (
            <DataTable
              cols={[
                { key: 'nom',       label: 'Nom',         width: '22%' },
                { key: 'email',     label: 'Email',       width: '25%' },
                { key: 'role',      label: 'Rôle',        width: '15%' },
                { key: 'statut',    label: 'Statut',      width: '12%' },
                { key: 'derniere',  label: 'Dernière connexion', width: '16%' },
                { key: 'actions',   label: 'Actions',     width: '10%' },
              ]}
              rows={data.map(a => {
                const rc = roleColor[a.role] || { color: D.textMuted, bg: D.surface3 }
                return {
                  nom:      <div style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{[a.prenom, a.nom].filter(Boolean).join(' ') || '—'}</div>,
                  email:    <span style={{ color: D.textSub, fontSize: '12px', fontFamily: 'monospace' }}>{a.email}</span>,
                  role:     <Badge label={a.role.replace('_', ' ')} color={rc.color} bg={rc.bg}/>,
                  statut:   <Badge label={a.is_active ? 'Actif' : 'Inactif'} color={a.is_active ? D.green : D.red} bg={a.is_active ? D.greenDim : D.redDim}/>,
                  derniere: <span style={{ color: D.textMuted, fontSize: '11px' }}>{a.last_login ? timeAgo(a.last_login) : 'Jamais'}</span>,
                  actions:  (
                    <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleActive(a.id, a.is_active)} style={{ padding: '4px 7px', backgroundColor: a.is_active ? D.redDim : D.greenDim, border: `1px solid ${a.is_active ? D.redBrd : D.greenBrd}`, borderRadius: '5px', color: a.is_active ? D.red : D.green, fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
                        {a.is_active ? 'Désact.' : 'Réact.'}
                      </button>
                      <button onClick={() => deleteAdmin(a.id)} style={{ padding: '4px 6px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: '5px', color: D.textMuted, fontSize: '11px', cursor: 'pointer' }}>
                        {Ic.X(D.textMuted)}
                      </button>
                    </div>
                  ),
                }
              })}
            />
          )}
        </div>

        {/* Panel création admin */}
        <SlidePanel open={panel === 'create'} onClose={() => setPanel(null)} title="Créer un compte admin" width="460px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 14px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm }}>
              <p style={{ margin: 0, fontSize: '12px', color: D.red, fontWeight: '600' }}>Accès super_admin requis. Ce formulaire crée un compte avec accès complet au dashboard.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Prénom</label>
                <input value={form.prenom} onChange={e => setForm(f => ({...f, prenom: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Nom</label>
                <input value={form.nom} onChange={e => setForm(f => ({...f, nom: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="admin@yelen224.com" style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Mot de passe *</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Minimum 8 caractères" style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: D.textMuted, marginBottom: '5px', textTransform: 'uppercase' }}>Rôle</label>
              <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} style={{ width: '100%', padding: '9px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}>
                <option value="support">Support</option>
                <option value="moderateur">Modérateur</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
              <button onClick={createAdmin} disabled={saving} style={{ flex: 1, padding: '11px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, color: '#000', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Création...' : 'Créer le compte'}
              </button>
              <button onClick={() => setPanel(null)} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
            </div>
          </div>
        </SlidePanel>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // HELPER EXPORT (accessible globalement dans ce fichier)
  // ═══════════════════════════════════════════════════════
  async function exportCSV(type: string) {
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
  // ═══════════════════════════════════════════════════════
// PAGE PRINCIPALE — COMPOSANT ROOT
// ═══════════════════════════════════════════════════════
export default function AdminOverview() {

    // ── STATE GLOBAL ──
    const [view, setView]           = useState<View>('overview')
    const [kpis, setKpis]           = useState<KPIs | null>(null)
    const [institutions, setInstitutions] = useState<Institution[]>([])
    const [signalements, setSignalements] = useState<Signalement[]>([])
    const [activity, setActivity]   = useState<ActivityItem[]>([])
    const [loading, setLoading]     = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [toasts, setToasts]       = useState<ToastItem[]>([])
    const [lastUpdate, setLastUpdate] = useState(new Date())
    const [serverTime, setServerTime] = useState(new Date())
    const [maintenance, setMaintenance] = useState(false)
    const [search, setSearch]       = useState('')
    const [searchResults, setSearchResults] = useState<{type:string,label:string,id:string}[]>([])
    const [searchOpen, setSearchOpen] = useState(false)
    const [activePanel, setActivePanel] = useState<string | null>(null)
    const [selectedInst, setSelectedInst] = useState<Institution | null>(null)
    const [selectedSig, setSelectedSig]   = useState<Signalement | null>(null)
    const [refusMotif, setRefusMotif]     = useState('')
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [notifMessage, setNotifMessage] = useState('')
    const [activityFilter, setActivityFilter] = useState('tous')
    const searchRef = useRef<HTMLInputElement>(null)
  
    // ── TOAST ──
    const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
      const id = Math.random().toString(36).slice(2)
      setToasts(t => [...t, { id, message, type }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
    }, [])
  
    // ── HORLOGE ──
    useEffect(() => {
      const iv = setInterval(() => setServerTime(new Date()), 1000)
      return () => clearInterval(iv)
    }, [])
  
    // ── RACCOURCIS CLAVIER ──
    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); setSearchOpen(true) }
        if (e.key === 'Escape') { setSearchOpen(false); setActivePanel(null) }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [])
  
    // ── FETCH DONNÉES ──
    const fetchAll = useCallback(async (silent = false) => {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      try {
        const [kpisRes, instRes, sigRes, actRes] = await Promise.all([
          fetch('/api/admin/kpis', { cache: 'no-store' }),
          fetch('/api/admin/institutions?statut=en_attente&limit=8'),
          fetch('/api/admin/signalements?statut=nouveau&limit=8'),
          fetch('/api/admin/activity?limit=25'),
        ])
        if (kpisRes.ok) setKpis(await kpisRes.json())
        if (instRes.ok) setInstitutions(await instRes.json())
        if (sigRes.ok)  setSignalements(await sigRes.json())
        if (actRes.ok)  setActivity(await actRes.json())
        setLastUpdate(new Date())
      } catch { if (!silent) toast('Erreur chargement', 'error') }
      finally { setLoading(false); setRefreshing(false) }
    }, [toast])
  
    useEffect(() => {
      fetchAll()
      const iv = setInterval(() => fetchAll(true), 30_000)
      return () => clearInterval(iv)
    }, [fetchAll])
  
    // ── RECHERCHE ──
    const handleSearch = useCallback(async (q: string) => {
      setSearch(q)
      if (q.length < 2) { setSearchResults([]); return }
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`)
        if (res.ok) setSearchResults(await res.json())
      } catch { /* silencieux */ }
    }, [])
  
    // ── ACTIONS INSTITUTIONS ──
    async function validerInst(id: string) {
      setActionLoading(id + 'v')
      try {
        const res = await fetch(`/api/admin/institutions/${id}/valider`, { method: 'POST' })
        if (res.ok) { toast('Institution validée'); setInstitutions(p => p.filter(i => i.id !== id)); fetchAll(true) }
        else toast('Erreur', 'error')
      } catch { toast('Erreur réseau', 'error') }
      finally { setActionLoading(null) }
    }
  
    async function refuserInst(id: string) {
      if (!refusMotif.trim()) { toast('Motif requis', 'error'); return }
      setActionLoading(id + 'r')
      try {
        const res = await fetch(`/api/admin/institutions/${id}/refuser`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motif: refusMotif }),
        })
        if (res.ok) { toast('Institution refusée'); setInstitutions(p => p.filter(i => i.id !== id)); setActivePanel(null); setRefusMotif(''); fetchAll(true) }
        else toast('Erreur', 'error')
      } catch { toast('Erreur réseau', 'error') }
      finally { setActionLoading(null) }
    }
  
    async function suspendreInst(id: string) {
      setActionLoading(id + 's')
      try {
        const res = await fetch(`/api/admin/institutions/${id}/suspendre`, { method: 'POST' })
        if (res.ok) { toast('Institution suspendue'); setActivePanel(null); fetchAll(true) }
        else toast('Erreur', 'error')
      } catch { toast('Erreur réseau', 'error') }
      finally { setActionLoading(null) }
    }
  
    // ── ACTIONS SIGNALEMENTS ──
    async function resoudreSig(id: string) {
      setActionLoading(id + 'rs')
      try {
        const res = await fetch(`/api/admin/signalements/${id}/resoudre`, { method: 'POST' })
        if (res.ok) { toast('Signalement résolu'); setSignalements(p => p.filter(s => s.id !== id)); fetchAll(true) }
        else toast('Erreur', 'error')
      } catch { toast('Erreur réseau', 'error') }
      finally { setActionLoading(null) }
    }
  
    async function ignorerSig(id: string) {
      setActionLoading(id + 'is')
      try {
        const res = await fetch(`/api/admin/signalements/${id}/ignorer`, { method: 'POST' })
        if (res.ok) { toast('Signalement ignoré', 'info'); setSignalements(p => p.filter(s => s.id !== id)) }
        else toast('Erreur', 'error')
      } catch { toast('Erreur réseau', 'error') }
      finally { setActionLoading(null) }
    }
  
    // ── BROADCAST ──
    async function sendBroadcast(cible: string) {
      if (!notifMessage.trim()) { toast('Message requis', 'error'); return }
      try {
        const res = await fetch('/api/admin/broadcast', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cible, message: notifMessage }),
        })
        if (res.ok) { const d = await res.json(); toast(`Envoyé à ${d.destinataires_count} destinataires`); setNotifMessage(''); setActivePanel(null) }
        else toast('Erreur envoi', 'error')
      } catch { toast('Erreur réseau', 'error') }
    }
  
    // ── EXPORT ──
    async function doExport(type: string) {
      try {
        const res = await fetch(`/api/admin/export?type=${type}`)
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `yelen224_${type}_${new Date().toISOString().slice(0,10)}.csv`
          a.click(); URL.revokeObjectURL(url)
          toast(`Export ${type} téléchargé`)
        }
      } catch { toast('Erreur export', 'error') }
    }
  
    // ── LOGOUT ──
    async function handleLogout() {
      await fetch('/api/admin/auth/logout', { method: 'POST' })
      window.location.href = '/admin/login'
    }
  
    // ── NAV ITEMS ──
    const NAV: { key: View, label: string, icon: (c: string) => React.ReactNode, badge?: number }[] = [
      { key: 'overview',     label: 'Vue d\'ensemble', icon: Ic.Grid     },
      { key: 'institutions', label: 'Institutions',    icon: Ic.Building, badge: kpis?.institutions_en_attente },
      { key: 'citoyens',     label: 'Citoyens',        icon: Ic.Users    },
      { key: 'rdv',          label: 'Rendez-vous',     icon: Ic.Calendar },
      { key: 'paiements',    label: 'Paiements',       icon: Ic.CreditCard },
      { key: 'moderation',   label: 'Modération',      icon: Ic.Shield,   badge: kpis?.signalements_non_traites },
      { key: 'annonces',     label: 'Annonces',        icon: Ic.Megaphone },
      { key: 'analytiques',  label: 'Analytiques',     icon: Ic.BarChart },
      { key: 'admins',       label: 'Admins',          icon: Ic.Key      },
      { key: 'logs',         label: 'Logs',            icon: Ic.Logs     },
    ]
  
    const SECT_COLORS = [D.yellow, D.blue, D.green, D.orange, D.purple, D.red, '#06b6d4', '#ec4899']
  
    // ── LOADING STATE ──
    if (loading) return (
      <div style={{ minHeight: '100vh', backgroundColor: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '14px', fontFamily: D.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg) } }
          @keyframes slideInRight { from { transform: translateX(60px); opacity: 0 } to { transform: none; opacity: 1 } }
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${D.border}; border-radius: 4px; }
        `}</style>
        <div style={{ width: '32px', height: '32px', border: `2px solid ${D.border}`, borderTop: `2px solid ${D.yellow}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
        <p style={{ color: D.textMuted, fontSize: '13px', margin: 0, fontFamily: D.font }}>Initialisation du Command Center...</p>
      </div>
    )
  
    // ═══════════════════════════════════════════════════════
    // RENDER PRINCIPAL
    // ═══════════════════════════════════════════════════════
    return (
      <div style={{ minHeight: '100vh', backgroundColor: D.bg, fontFamily: D.font, display: 'flex' }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg) } }
          @keyframes slideInRight { from { transform: translateX(60px); opacity: 0 } to { transform: none; opacity: 1 } }
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 4px; height: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${D.border}; border-radius: 4px; }
          input, textarea, button { font-family: ${D.font}; }
          html, body { background: ${D.bg} !important; }
        `}</style>
  
        <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))}/>
  
        {/* ═══ SIDEBAR ═══ */}
        <aside style={{
          width: '220px', minHeight: '100vh', backgroundColor: D.surface,
          borderRight: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100, flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ padding: '18px 16px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `linear-gradient(135deg, ${D.yellow}, #b8860b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: '#000', flexShrink: 0 }}>Y</div>
            <div>
              <div style={{ color: D.text, fontSize: '13px', fontWeight: '700', lineHeight: 1.2 }}>Yelen224</div>
              <div style={{ color: D.yellow, fontSize: '10px', fontWeight: '600', letterSpacing: '0.3px' }}>Command Center</div>
            </div>
          </div>
  
          {/* Navigation */}
          <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
            {NAV.map(item => {
              const active = view === item.key
              const hasBadge = item.badge && item.badge > 0
              return (
                <button key={item.key} onClick={() => setView(item.key)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                  padding: '8px 10px', borderRadius: D.radiusSm, border: 'none',
                  backgroundColor: active ? D.yellowDim : 'transparent',
                  color: active ? D.yellow : D.textMuted,
                  fontSize: '12.5px', fontWeight: active ? '700' : '400',
                  cursor: 'pointer', marginBottom: '1px',
                  transition: 'all 0.12s',
                  borderLeft: `2px solid ${active ? D.yellow : 'transparent'}`,
                  textAlign: 'left', position: 'relative',
                }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = D.surface2; (e.currentTarget as HTMLButtonElement).style.color = D.textSub } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = D.textMuted } }}
                >
                  <span style={{ color: active ? D.yellow : D.textMuted, flexShrink: 0 }}>{item.icon(active ? D.yellow : D.textMuted)}</span>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  {hasBadge && (
                    <span style={{ minWidth: '18px', height: '18px', borderRadius: '9px', backgroundColor: D.red, color: '#fff', fontSize: '9px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>
                      {item.badge! > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
  
          {/* Profil admin */}
          <div style={{ padding: '10px 8px', borderTop: `1px solid ${D.border}` }}>
            <div style={{ padding: '10px', backgroundColor: D.surface2, borderRadius: D.radiusSm, marginBottom: '6px', border: `1px solid ${D.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `linear-gradient(135deg, ${D.yellow}, #b8860b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#000', flexShrink: 0 }}>A</div>
                <div>
                  <div style={{ color: D.text, fontSize: '12px', fontWeight: '600' }}>Admin Yelen</div>
                  <div style={{ color: D.yellow, fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Super Admin</div>
                </div>
              </div>
            </div>
            <button onClick={handleLogout} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', borderRadius: D.radiusSm, border: 'none',
              backgroundColor: 'transparent', color: D.textMuted,
              fontSize: '12px', cursor: 'pointer', transition: 'all 0.12s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = D.redDim; (e.currentTarget as HTMLButtonElement).style.color = D.red }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = D.textMuted }}
            >
              {Ic.Logout(D.textMuted)} Déconnexion
            </button>
          </div>
        </aside>
  
        {/* ═══ MAIN ═══ */}
        <div style={{ marginLeft: '220px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
  
          {/* ── TOPBAR ── */}
          <header style={{
            height: '52px', backgroundColor: D.surface, borderBottom: `1px solid ${D.border}`,
            display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px',
            position: 'sticky', top: 0, zIndex: 99, flexShrink: 0,
          }}>
            {/* Recherche globale */}
            <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>
                {Ic.Search(D.textMuted)}
              </span>
              <input
                ref={searchRef}
                value={search}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
                placeholder="Rechercher... (Ctrl+K)"
                style={{ width: '100%', padding: '7px 12px 7px 30px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.text, outline: 'none' }}
              />
              {searchOpen && searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, boxShadow: D.shadowLg, zIndex: 300, marginTop: '4px', overflow: 'hidden' }}>
                  {searchResults.map((r, i) => (
                    <div key={i} onClick={() => setView(r.type as View)} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: i < searchResults.length-1 ? `1px solid ${D.border}` : 'none', fontSize: '12px', color: D.text }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = D.surface2}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'}
                    >
                      <Badge label={r.type} color={r.type === 'institutions' ? D.yellow : D.blue} bg={r.type === 'institutions' ? D.yellowDim : D.blueDim}/>
                      <span>{r.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
  
            <div style={{ flex: 1 }}/>
  
            {/* Horloge */}
            <div style={{ fontSize: '12px', color: D.textMuted, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
              {serverTime.toLocaleTimeString('fr-FR')}
            </div>
  
            {/* Maintenance toggle */}
            <button onClick={() => { setMaintenance(m => !m); toast(maintenance ? 'Maintenance désactivée' : 'Maintenance activée', maintenance ? 'success' : 'info') }} style={{
              padding: '6px 12px', borderRadius: D.radiusSm, fontSize: '11px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.12s',
              backgroundColor: maintenance ? D.orange : D.surface2,
              border: `1px solid ${maintenance ? D.orangeBrd : D.border}`,
              color: maintenance ? '#fff' : D.textSub,
            }}>
              {maintenance ? 'Maintenance ON' : 'Maintenance'}
            </button>
  
            {/* Refresh */}
            <button onClick={() => fetchAll(true)} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '11px', color: D.textSub, cursor: 'pointer', opacity: refreshing ? 0.5 : 1 }}>
              <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>{Ic.Refresh(D.textSub)}</span>
              Actualiser
            </button>
  
            {/* Statut live */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: D.green, animation: 'blink 2s ease infinite' }}/>
              <span style={{ fontSize: '11px', color: D.textMuted }}>Live</span>
            </div>
          </header>
  
          {/* ── CONTENT ── */}
          <main style={{ flex: 1, padding: '24px', overflowY: 'auto', animation: 'fadeIn 0.2s ease' }}>
  
            {/* ══════════════════════════════════════════
                VUE OVERVIEW
            ══════════════════════════════════════════ */}
            {view === 'overview' && kpis && (
              <div style={{ maxWidth: '1400px' }}>
  
                {/* Alertes critiques */}
                {(kpis.institutions_en_attente > 0 || kpis.signalements_non_traites > 0) && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', padding: '14px 16px', backgroundColor: D.surface, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radius }}>
                    <div style={{ width: '100%', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.yellow, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {Ic.Warn(D.yellow)} Actions requises
                    </div>
                    {kpis.institutions_en_attente > 0 && (
                      <button onClick={() => setView('institutions')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', backgroundColor: D.surface2, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: D.text }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: D.yellow, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800' }}>{kpis.institutions_en_attente}</span>
                        Institution(s) en attente de validation
                      </button>
                    )}
                    {kpis.signalements_non_traites > 0 && (
                      <button onClick={() => setView('moderation')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', backgroundColor: D.surface2, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: D.text }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: D.red, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800' }}>{kpis.signalements_non_traites}</span>
                        Signalement(s) non traité(s)
                      </button>
                    )}
                  </div>
                )}
  
                {/* KPIs ligne 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
                  <KPICard label="Institutions actives" value={fmtNum(kpis.institutions_actives)} sub={`sur ${fmtNum(kpis.institutions_total)} enregistrées`} accent={D.yellow} icon={Ic.Building(D.yellow)} onClick={() => setView('institutions')}/>
                  <KPICard label="Citoyens inscrits" value={fmtNum(kpis.citoyens_total)} sub={`+${fmtNum(kpis.citoyens_aujourd_hui)} aujourd'hui`} accent={D.blue} icon={Ic.Users(D.blue)} delta={`+${fmtNum(kpis.citoyens_ce_mois)} ce mois`} deltaPos onClick={() => setView('citoyens')}/>
                  <KPICard label="RDV aujourd'hui" value={fmtNum(kpis.rdv_aujourd_hui)} sub={`${fmtNum(kpis.rdv_ce_mois)} ce mois — ${fmtNum(kpis.rdv_total)} total`} accent={D.orange} icon={Ic.Calendar(D.orange)} onClick={() => setView('rdv')}/>
                  <KPICard label="Revenus totaux" value={fmtMoney(kpis.revenus_total)} sub={`${fmtMoney(kpis.revenus_aujourd_hui)} aujourd'hui`} accent={D.green} icon={Ic.CreditCard(D.green)} delta={fmtMoney(kpis.revenus_ce_mois)} deltaPos onClick={() => setView('paiements')}/>
                </div>
  
                {/* KPIs ligne 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
                  <KPICard label="En attente validation" value={fmtNum(kpis.institutions_en_attente)} sub="institutions" accent={D.yellow} icon={Ic.Warn(D.yellow)} urgent={kpis.institutions_en_attente > 0} onClick={() => setView('institutions')}/>
                  <KPICard label="Taux de présence" value={`${kpis.taux_presence}%`} sub="moyenne plateforme" accent={D.green} icon={Ic.TrendUp(D.green)}/>
                  <KPICard label="Satisfaction" value={kpis.avis_moyenne > 0 ? `${kpis.avis_moyenne.toFixed(1)} / 5` : '—'} sub={`${fmtNum(kpis.avis_total)} avis`} accent={D.yellow} icon={Ic.Star(D.yellow)}/>
                  <KPICard label="Signalements ouverts" value={fmtNum(kpis.signalements_non_traites)} sub="requièrent une action" accent={D.red} icon={Ic.Shield(D.red)} urgent={kpis.signalements_non_traites > 0} onClick={() => setView('moderation')}/>
                </div>
  
                {/* Graphes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>RDV — 30 jours</p>
                    <p style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>{fmtNum(kpis.rdv_ce_mois)}</p>
                    <LineChart data={kpis.rdv_chart_30j} color={D.orange}/>
                  </div>
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>Revenus — 12 mois</p>
                    <p style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '700', color: D.text, letterSpacing: '-1px' }}>{fmtMoney(kpis.revenus_total)}</p>
                    <BarChart data={kpis.revenus_chart_12m} color={D.green} labels={kpis.revenus_labels_12m}/>
                  </div>
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <p style={{ margin: '0 0 14px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>Secteurs institutions</p>
                    {kpis.secteurs.length > 0
                      ? <PieChart data={kpis.secteurs.map((s, i) => ({ ...s, color: SECT_COLORS[i % SECT_COLORS.length] }))}/>
                      : <div style={{ color: D.textMuted, fontSize: '12px' }}>Aucune donnée</div>
                    }
                  </div>
                </div>
  
                {/* Grille inférieure */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
  
                  {/* Journal activité */}
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <p style={{ margin: 0, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>Activité récente</p>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['tous', 'rdv', 'institution', 'paiement', 'signalement'].map(f => (
                          <button key={f} onClick={() => setActivityFilter(f)} style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: activityFilter === f ? '700' : '400', backgroundColor: activityFilter === f ? D.yellow : 'transparent', color: activityFilter === f ? '#000' : D.textMuted, border: `1px solid ${activityFilter === f ? D.yellow : D.border}`, cursor: 'pointer' }}>
                            {f === 'tous' ? 'Tous' : f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0' }}>
                      {activity.filter(a => activityFilter === 'tous' || a.type === activityFilter).map((item, i, arr) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 0', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                          <div style={{ width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: item.type === 'rdv' ? D.orangeDim : item.type === 'paiement' ? D.greenDim : item.type === 'signalement' ? D.redDim : item.type === 'institution' ? D.yellowDim : D.blueDim, color: item.type === 'rdv' ? D.orange : item.type === 'paiement' ? D.green : item.type === 'signalement' ? D.red : item.type === 'institution' ? D.yellow : D.blue }}>
                            {item.type === 'rdv' ? Ic.Calendar() : item.type === 'paiement' ? Ic.CreditCard() : item.type === 'signalement' ? Ic.Shield() : item.type === 'institution' ? Ic.Building() : Ic.Users()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '12px', color: D.text, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.message}</p>
                            {item.actor && <p style={{ margin: '1px 0 0', fontSize: '10px', color: D.textMuted }}>{item.actor}</p>}
                          </div>
                          <span style={{ fontSize: '10px', color: D.textMuted, flexShrink: 0 }}>{timeAgo(item.created_at)}</span>
                        </div>
                      ))}
                      {activity.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: D.textMuted, fontSize: '12px' }}>Aucune activité</div>}
                    </div>
                  </div>
  
                  {/* Institutions en attente */}
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <p style={{ margin: 0, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>En attente</p>
                      <button onClick={() => setView('institutions')} style={{ background: 'none', border: 'none', color: D.yellow, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Voir tout</button>
                    </div>
                    {institutions.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: D.textMuted, fontSize: '12px' }}>Aucune en attente</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                        {institutions.map(inst => (
                          <div key={inst.id} style={{ padding: '10px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm }}>
                            <p style={{ margin: '0 0 2px', fontSize: '12px', fontWeight: '600', color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name}</p>
                            <p style={{ margin: '0 0 8px', fontSize: '10px', color: D.textMuted }}>{inst.category || '—'} · {inst.ville || '—'} · {timeAgo(inst.created_at)}</p>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button onClick={() => validerInst(inst.id)} disabled={actionLoading === inst.id + 'v'} style={{ flex: 1, padding: '5px 0', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', fontSize: '11px', fontWeight: '600', color: D.green, cursor: 'pointer' }}>
                                {actionLoading === inst.id + 'v' ? '...' : 'Valider'}
                              </button>
                              <button onClick={() => { setSelectedInst(inst); setActivePanel('refus') }} style={{ flex: 1, padding: '5px 0', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: '5px', fontSize: '11px', fontWeight: '600', color: D.red, cursor: 'pointer' }}>
                                Refuser
                              </button>
                              <button onClick={() => { setSelectedInst(inst); setActivePanel('inst_detail') }} style={{ padding: '5px 8px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', fontSize: '11px', color: D.blue, cursor: 'pointer' }}>
                                {Ic.Eye(D.blue)}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
  
                  {/* Outils admin */}
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <p style={{ margin: '0 0 12px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>Outils admin</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[
                        { label: 'Notifier les citoyens',       action: () => setActivePanel('notif_citoyens'),      color: D.blue   },
                        { label: 'Notifier les institutions',   action: () => setActivePanel('notif_institutions'),  color: D.yellow },
                        { label: 'Exporter citoyens CSV',       action: () => doExport('citoyens'),                  color: D.green  },
                        { label: 'Exporter institutions CSV',   action: () => doExport('institutions'),              color: D.green  },
                        { label: 'Exporter RDV CSV',            action: () => doExport('rdv'),                       color: D.green  },
                        { label: 'Exporter paiements CSV',      action: () => doExport('paiements'),                 color: D.green  },
                        { label: 'Créer une annonce',           action: () => setView('annonces'),                   color: D.orange },
                        { label: 'Gérer les admins',            action: () => setView('admins'),                     color: D.purple },
                        { label: 'Consulter les logs',          action: () => setView('logs'),                       color: D.blue   },
                      ].map(tool => (
                        <button key={tool.label} onClick={tool.action} style={{ padding: '8px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', fontWeight: '500', color: D.text, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.1s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = tool.color; (e.currentTarget as HTMLButtonElement).style.color = tool.color }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = D.border; (e.currentTarget as HTMLButtonElement).style.color = D.text }}
                        >
                          {tool.label} <span style={{ color: D.textMuted, fontSize: '10px' }}>{Ic.ChevR(D.textMuted)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
  
                {/* Signalements + Statut système */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
  
                  {/* Signalements */}
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <p style={{ margin: 0, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>Signalements urgents</p>
                      <button onClick={() => setView('moderation')} style={{ background: 'none', border: 'none', color: D.red, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Voir tout</button>
                    </div>
                    {signalements.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: D.textMuted, fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        {Ic.Check(D.green)}
                        <span>Aucun signalement ouvert</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {signalements.slice(0, 4).map(sig => (
                          <div key={sig.id} style={{ padding: '10px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                              <p style={{ margin: 0, fontSize: '12px', fontWeight: '600', color: D.text }}>{sig.type || 'Signalement'}</p>
                              <Badge label="Nouveau" color={D.red} bg={D.redDim}/>
                            </div>
                            <p style={{ margin: '0 0 8px', fontSize: '11px', color: D.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.description || '—'} · {timeAgo(sig.created_at)}</p>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button onClick={() => resoudreSig(sig.id)} disabled={actionLoading === sig.id + 'rs'} style={{ flex: 1, padding: '5px 0', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: '5px', fontSize: '11px', fontWeight: '600', color: D.green, cursor: 'pointer' }}>
                                {actionLoading === sig.id + 'rs' ? '...' : 'Résoudre'}
                              </button>
                              <button onClick={() => { setSelectedSig(sig); setActivePanel('sig_detail') }} style={{ flex: 1, padding: '5px 0', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: '5px', fontSize: '11px', fontWeight: '600', color: D.blue, cursor: 'pointer' }}>
                                Détail
                              </button>
                              <button onClick={() => ignorerSig(sig.id)} disabled={actionLoading === sig.id + 'is'} style={{ padding: '5px 8px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: '5px', fontSize: '11px', color: D.textMuted, cursor: 'pointer' }}>
                                {Ic.X(D.textMuted)}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
  
                  {/* Statut système */}
                  <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '16px' }}>
                    <p style={{ margin: '0 0 12px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: D.textMuted }}>Statut système</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                      {[
                        { label: 'Base de données Supabase', ok: true  },
                        { label: 'API REST',                  ok: true  },
                        { label: 'Authentification JWT',      ok: true  },
                        { label: 'Row Level Security',        ok: true  },
                        { label: 'Déploiement Netlify',       ok: true  },
                        { label: 'Logs système',              ok: true  },
                        { label: 'Mode maintenance',          ok: !maintenance, warn: maintenance },
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                          <span style={{ fontSize: '12px', color: D.textSub }}>{s.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s.warn ? D.orange : s.ok ? D.green : D.red }}/>
                            <span style={{ fontSize: '10px', fontWeight: '700', color: s.warn ? D.orange : s.ok ? D.green : D.red }}>
                              {s.warn ? 'Maintenance' : s.ok ? 'OK' : 'Hors ligne'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Branding */}
                    <div style={{ padding: '12px 14px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: D.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', color: '#000' }}>Y</div>
                        <div>
                          <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: D.text }}>Yelen224</p>
                          <p style={{ margin: 0, fontSize: '10px', color: D.textMuted }}>République de Guinée</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <Badge label="Production" color={D.yellow} bg={D.surface}/>
                        <span style={{ fontSize: '10px', color: D.textMuted }}>v1.0.0</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
  
            {/* ══ VUES SECONDAIRES ══ */}
            {view === 'institutions' && <ViewInstitutions toast={toast}/>}
            {view === 'citoyens'     && <ViewCitoyens toast={toast}/>}
            {view === 'rdv'          && <ViewRDV toast={toast}/>}
            {view === 'moderation'   && <ViewModeration toast={toast}/>}
            {view === 'analytiques'  && <ViewAnalytiques kpis={kpis}/>}
            {view === 'logs'         && <ViewLogs/>}
            {view === 'paiements'    && <ViewPaiements toast={toast}/>}
            {view === 'annonces'     && <ViewAnnonces toast={toast}/>}
            {view === 'admins'       && <ViewAdmins toast={toast}/>}
          </main>
        </div>
  
        {/* ═══ PANELS SLIDES ═══ */}
  
        {/* Refus institution */}
        <SlidePanel open={activePanel === 'refus'} onClose={() => setActivePanel(null)} title={`Refuser — ${selectedInst?.name || ''}`}>
          <p style={{ fontSize: '13px', color: D.textSub, marginBottom: '14px' }}>L'institution sera notifiée avec ce motif par la plateforme.</p>
          <textarea value={refusMotif} onChange={e => setRefusMotif(e.target.value)} placeholder="Motif de refus détaillé..." rows={5}
            style={{ width: '100%', padding: '10px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, resize: 'vertical', outline: 'none', fontFamily: D.font, boxSizing: 'border-box', marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => selectedInst && refuserInst(selectedInst.id)} disabled={!refusMotif.trim() || !!actionLoading} style={{ flex: 1, padding: '11px', backgroundColor: D.red, border: 'none', borderRadius: D.radiusSm, color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', opacity: !refusMotif.trim() ? 0.5 : 1 }}>
              {actionLoading ? 'En cours...' : 'Confirmer le refus'}
            </button>
            <button onClick={() => setActivePanel(null)} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
          </div>
        </SlidePanel>
  
        {/* Détail institution */}
        <SlidePanel open={activePanel === 'inst_detail'} onClose={() => setActivePanel(null)} title={selectedInst?.name || 'Détail institution'} width="520px">
          {selectedInst && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
                {([
                  ['Nom', selectedInst.name],
                  ['Catégorie', selectedInst.category || '—'],
                  ['Ville', selectedInst.ville || '—'],
                  ['Adresse', selectedInst.adresse || '—'],
                  ['Email', selectedInst.email || '—'],
                  ['Téléphone', selectedInst.phone || '—'],
                  ['Plan', selectedInst.plan || 'gratuit'],
                  ['Badge vérifié', selectedInst.badge_verifie ? 'Oui' : 'Non'],
                  ['Avertissements', String(selectedInst.avertissements || 0)],
                  ['Statut', selectedInst.statut],
                  ['Inscrite le', new Date(selectedInst.created_at).toLocaleDateString('fr-FR')],
                ] as [string, string][]).map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                    <span style={{ fontSize: '12px', color: D.textMuted }}>{l}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: l === 'Avertissements' && parseInt(v) > 0 ? D.red : D.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {selectedInst.statut === 'en_attente' && <button onClick={() => validerInst(selectedInst.id)} style={{ padding: '9px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12px', fontWeight: '600', cursor: 'pointer', gridColumn: '1/-1' }}>Valider l'institution</button>}
                {selectedInst.statut === 'suspendue'
                  ? <button onClick={async () => { const r = await fetch(`/api/admin/institutions/${selectedInst.id}/reactiver`, {method:'POST'}); if (r.ok) { toast('Réactivée'); fetchAll(true); setActivePanel(null) } }} style={{ padding: '9px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12px', fontWeight: '600', cursor: 'pointer', gridColumn: '1/-1' }}>Réactiver le compte</button>
                  : <button onClick={() => suspendreInst(selectedInst.id)} style={{ padding: '9px', backgroundColor: D.orangeDim, border: `1px solid ${D.orangeBrd}`, borderRadius: D.radiusSm, color: D.orange, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Suspendre</button>
                }
                <button onClick={() => setActivePanel('refus')} style={{ padding: '9px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, color: D.red, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Refuser</button>
                <button onClick={async () => { const r = await fetch(`/api/admin/institutions/${selectedInst.id}/avertir`, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); if (r.ok) { toast('Avertissement ajouté'); fetchAll(true) } }} style={{ padding: '9px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>+ Avertissement</button>
                <button onClick={async () => { const nb = selectedInst.badge_verifie; const r = await fetch(`/api/admin/institutions/${selectedInst.id}/badge`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({badge_verifie:!nb})}); if (r.ok) { toast(nb ? 'Badge retiré' : 'Badge accordé'); fetchAll(true) } }} style={{ padding: '9px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: D.radiusSm, color: D.blue, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{selectedInst.badge_verifie ? 'Retirer badge' : 'Accorder badge'}</button>
                <button onClick={async () => { const p = selectedInst.plan === 'premium' ? 'gratuit' : 'premium'; const r = await fetch(`/api/admin/institutions/${selectedInst.id}/plan`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:p})}); if (r.ok) { toast(`Plan mis à ${p}`); fetchAll(true) } }} style={{ padding: '9px', backgroundColor: D.purpleDim, border: `1px solid ${D.purpleBrd}`, borderRadius: D.radiusSm, color: D.purple, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{selectedInst.plan === 'premium' ? 'Passer gratuit' : 'Passer premium'}</button>
              </div>
            </div>
          )}
        </SlidePanel>
  
        {/* Détail signalement */}
        <SlidePanel open={activePanel === 'sig_detail'} onClose={() => setActivePanel(null)} title="Détail signalement">
          {selectedSig && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
                {[['Type', selectedSig.type || '—'], ['Statut', selectedSig.statut], ['Priorité', selectedSig.priorite || 'Normale'], ['Cible', selectedSig.cible_type || '—'], ['Date', new Date(selectedSig.created_at).toLocaleDateString('fr-FR')]].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                    <span style={{ fontSize: '12px', color: D.textMuted }}>{l}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: D.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 14px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                <p style={{ margin: '0 0 6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px', color: D.textMuted }}>Description</p>
                <p style={{ margin: 0, fontSize: '13px', color: D.text, lineHeight: 1.6 }}>{selectedSig.description || 'Aucune description'}</p>
              </div>
              {selectedSig.statut === 'nouveau' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => resoudreSig(selectedSig.id)} style={{ flex: 1, padding: '11px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Marquer résolu</button>
                  <button onClick={() => ignorerSig(selectedSig.id)} style={{ flex: 1, padding: '11px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Ignorer</button>
                </div>
              )}
            </div>
          )}
        </SlidePanel>
  
        {/* Notification citoyens */}
        <SlidePanel open={activePanel === 'notif_citoyens'} onClose={() => setActivePanel(null)} title="Notifier tous les citoyens">
          <p style={{ fontSize: '13px', color: D.textSub, marginBottom: '14px' }}>Message envoyé à tous les citoyens actifs sur la plateforme.</p>
          <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="Rédigez votre message..." rows={6}
            style={{ width: '100%', padding: '10px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, resize: 'vertical', outline: 'none', fontFamily: D.font, boxSizing: 'border-box', marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => sendBroadcast('citoyens')} disabled={!notifMessage.trim()} style={{ flex: 1, padding: '11px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, color: '#000', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: !notifMessage.trim() ? 0.5 : 1 }}>
              {Ic.Send()} Envoyer
            </button>
            <button onClick={() => setActivePanel(null)} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
          </div>
        </SlidePanel>
  
        {/* Notification institutions */}
        <SlidePanel open={activePanel === 'notif_institutions'} onClose={() => setActivePanel(null)} title="Notifier toutes les institutions">
          <p style={{ fontSize: '13px', color: D.textSub, marginBottom: '14px' }}>Message envoyé à toutes les institutions actives.</p>
          <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="Rédigez votre message..." rows={6}
            style={{ width: '100%', padding: '10px 12px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, resize: 'vertical', outline: 'none', fontFamily: D.font, boxSizing: 'border-box', marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => sendBroadcast('institutions')} disabled={!notifMessage.trim()} style={{ flex: 1, padding: '11px', backgroundColor: D.yellow, border: 'none', borderRadius: D.radiusSm, color: '#000', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: !notifMessage.trim() ? 0.5 : 1 }}>
              {Ic.Send()} Envoyer
            </button>
            <button onClick={() => setActivePanel(null)} style={{ padding: '11px 16px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
          </div>
        </SlidePanel>
  
      </div>
    )
  }