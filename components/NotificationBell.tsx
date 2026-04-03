'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/hooks/useNotifications'

function tempsRelatif(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "À l'instant"
  if (min < 60) return `Il y a ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `Il y a ${h}h`
  return `Il y a ${Math.floor(h / 24)}j`
}

const TYPE_ICON: Record<string, string> = {
  annule:     '❌',
  confirme:   '✅',
  termine:    '🏁',
  en_attente: '🔄',
  absent:     '👤',
  message:    '💬',
}

const TYPE_COLOR: Record<string, string> = {
  annule:     '#F87171',
  confirme:   '#34D399',
  termine:    '#A78BFA',
  en_attente: '#F59E0B',
  absent:     '#9CA3AF',
  message:    '#60A5FA',
}

export default function NotificationBell({ userId }: { userId: string | null }) {
  const router = useRouter()
  const { notifs, nonLues, marquerToutLu, marquerUnLu } = useNotifications(userId)
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOuvert(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    setOuvert(!ouvert)
    if (!ouvert && nonLues > 0) marquerToutLu()
  }

  const handleClickNotif = async (notif: any) => {
    if (!notif.lu) await marquerUnLu(notif.id)
    if (notif.rdv_id) {
      // Redirige vers la messagerie du RDV concerné
      router.push(`/messagerie?rdv_id=${notif.rdv_id}`)
    }
    setOuvert(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>

      {/* ── Cloche ── */}
      <button onClick={handleOpen} style={{
        position: 'relative',
        background: ouvert ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${ouvert ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '10px',
        width: '38px', height: '38px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke={ouvert ? '#F59E0B' : '#888'} strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {nonLues > 0 && (
          <div style={{
            position: 'absolute', top: '-5px', right: '-5px',
            background: '#EF4444', color: '#fff',
            fontSize: '9px', fontWeight: '800',
            width: '18px', height: '18px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #070B14',
            animation: 'pulse-notif 2s infinite',
          }}>
            {nonLues > 9 ? '9+' : nonLues}
          </div>
        )}
      </button>

      <style>{`
        @keyframes pulse-notif {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `}</style>

      {/* ── Dropdown ── */}
      {ouvert && (
        <div style={{
          position: 'absolute', top: '48px', right: 0,
          width: '360px',
          background: '#0D1117',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          zIndex: 300, overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#F1F5F9', fontSize: '14px', fontWeight: '700' }}>
              🔔 Notifications
              {nonLues > 0 && (
                <span style={{
                  marginLeft: 8, background: '#EF4444', color: '#fff',
                  fontSize: '10px', fontWeight: '700',
                  padding: '1px 7px', borderRadius: 20,
                }}>
                  {nonLues} non lue{nonLues > 1 ? 's' : ''}
                </span>
              )}
            </span>
            {notifs.some(n => !n.lu) && (
              <button onClick={marquerToutLu} style={{
                background: 'none', border: 'none',
                color: '#F59E0B', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
              }}>
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: 8 }}>🔔</div>
                <p style={{ color: '#475569', fontSize: '13px', margin: 0 }}>
                  Aucune notification
                </p>
              </div>
            ) : notifs.map(notif => {
              const color = TYPE_COLOR[notif.type] || '#888'
              const icon = TYPE_ICON[notif.type] || '🔔'
              return (
                <div key={notif.id}
                  onClick={() => handleClickNotif(notif)}
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: notif.lu ? 'transparent' : 'rgba(245,158,11,0.03)',
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                    cursor: notif.rdv_id ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (notif.rdv_id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = notif.lu ? 'transparent' : 'rgba(245,158,11,0.03)'
                  }}
                >
                  {/* Icône type */}
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                    background: `${color}18`,
                    border: `1px solid ${color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '15px',
                  }}>
                    {icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#F1F5F9', fontSize: '13px', fontWeight: notif.lu ? 500 : 700, margin: '0 0 3px' }}>
                      {notif.titre}
                    </p>
                    <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 5px', lineHeight: 1.5 }}>
                      {notif.message}
                    </p>
                    <p style={{ color: '#334155', fontSize: '10px', margin: 0 }}>
                      {tempsRelatif(notif.created_at)}
                      {notif.rdv_id && <span style={{ color: '#F59E0B', marginLeft: 6 }}>→ Voir RDV</span>}
                    </p>
                  </div>

                  {/* Point non-lu */}
                  {!notif.lu && (
                    <div style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: '#F59E0B', flexShrink: 0, marginTop: 4,
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}