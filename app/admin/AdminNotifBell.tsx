'use client'

// Cloche de notifications admin (chantier refonte admin 26/07/2026, Lot G).
// Agrégat live des 8 files d'attente (app/api/admin/notifications/count) —
// aucune ligne persistée par notification, le compteur descend dès que
// l'admin traite l'élément sous-jacent. Rafraîchi toutes les 30s, même
// cadence que le polling KPI de l'ancienne Vue d'ensemble.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ic } from './adminIcons'

type Categorie = { key: string; label: string; count: number; href: string }

export function AdminNotifBell() {
  const router = useRouter()
  const [categories, setCategories] = useState<Categorie[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function load() {
      fetch('/api/admin/notifications/count')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.categories) setCategories(d.categories) })
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const total = categories.reduce((s, c) => s + c.count, 0)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', background: 'none', border: 'none',
          color: open ? '#fff' : '#666', cursor: 'pointer', padding: '4px',
          display: 'flex', transition: 'color 0.15s',
        }}
      >
        {Ic.Bell('currentColor')}
        {total > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-6px',
            backgroundColor: '#ef4444', color: '#fff',
            fontSize: '9px', fontWeight: '800', borderRadius: '10px',
            minWidth: '15px', height: '15px', padding: '0 3px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{total > 99 ? '99+' : total}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: '300px', backgroundColor: '#161616',
          border: '1px solid #2a2a2a', borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 300,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ color: '#f0f0f0', fontSize: '13px', fontWeight: '700' }}>Notifications</span>
          </div>
          {categories.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#606060', fontSize: '12px' }}>Chargement…</div>
          ) : total === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#606060', fontSize: '12px' }}>Rien à traiter pour le moment</div>
          ) : (
            <div>
              {categories.filter(c => c.count > 0).map(c => (
                <button
                  key={c.key}
                  onClick={() => { setOpen(false); router.push(c.href) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 14px', background: 'none', border: 'none',
                    borderBottom: '1px solid #1e1e1e', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1e1e1e'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}
                >
                  <span style={{ color: '#d0d0d0', fontSize: '12.5px' }}>{c.label}</span>
                  <span style={{
                    backgroundColor: 'rgba(212,160,23,0.15)', color: '#d4a017',
                    fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '20px',
                  }}>{c.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
