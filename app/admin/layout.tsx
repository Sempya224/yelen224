'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin', label: 'Vue d\'ensemble', icon: '⬛', exact: true },
  { href: '/admin/institutions', label: 'Institutions', icon: '🏛️' },
  { href: '/admin/citoyens', label: 'Citoyens', icon: '👥' },
  { href: '/admin/rdv', label: 'Rendez-vous', icon: '📅' },
  { href: '/admin/paiements', label: 'Paiements', icon: '💳' },
  { href: '/admin/moderation', label: 'Modération', icon: '🛡️' },
  { href: '/admin/feedback', label: 'Feedback', icon: '💬' },
  { href: '/admin/messagerie', label: 'Messagerie', icon: '✉️' },
  { href: '/admin/annonces', label: 'Annonces', icon: '📢' },
  { href: '/admin/documents', label: 'Documents citoyens', icon: '📄' },
  { href: '/admin/analytiques', label: 'Analytiques', icon: '📊' },
  { href: '/admin/admins', label: 'Admins', icon: '🔑' },
  { href: '/admin/logs', label: 'Logs système', icon: '📋' },
]

interface AdminUser {
  id: string
  email: string
  role: string
  nom: string
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    // Ne pas vérifier la session sur la page login
    if (pathname === '/admin/login') {
      setLoading(false)
      return
    }

    fetch('/api/admin/auth/me')
      .then(res => {
        if (!res.ok) {
          router.push('/admin/login')
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data?.admin) setAdmin(data.admin)
        setLoading(false)
      })
      .catch(() => {
        router.push('/admin/login')
      })
  }, [router, pathname])

  async function handleLogout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  // Page login → pas de layout, pas de loading
  if (pathname === '/admin/login') return <>{children}</>

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px',
            border: '3px solid #2a2a2a',
            borderTop: '3px solid #00c896',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ color: '#555', fontSize: '14px' }}>Vérification de session...</p>
        </div>
      </div>
    )
  }

  const SIDEBAR_W = sidebarCollapsed ? '72px' : '240px'

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* ═══ SIDEBAR ═══ */}
      <aside style={{
        width: SIDEBAR_W,
        minHeight: '100vh',
        backgroundColor: '#141414',
        borderRight: '1px solid #222',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        transition: 'width 0.25s ease',
        zIndex: 100,
        overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{
          padding: sidebarCollapsed ? '20px 0' : '20px 20px',
          borderBottom: '1px solid #1e1e1e',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: '36px', height: '36px', minWidth: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: '800', color: '#fff',
          }}>Y</div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>Yelen224</div>
              <div style={{ color: '#d4a017', fontSize: '11px', fontWeight: '600' }}>Admin Panel</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.href, item.exact)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                title={sidebarCollapsed ? item.label : undefined}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: sidebarCollapsed ? '10px 0' : '10px 12px',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: active ? '#d4a01718' : 'transparent',
                  color: active ? '#d4a017' : '#666',
                  fontSize: '13.5px',
                  fontWeight: active ? '600' : '400',
                  cursor: 'pointer',
                  marginBottom: '2px',
                  transition: 'all 0.15s',
                  borderLeft: active ? '3px solid #d4a017' : '3px solid transparent',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1e1e1e'
                    ;(e.currentTarget as HTMLButtonElement).style.color = '#aaa'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                    ;(e.currentTarget as HTMLButtonElement).style.color = '#666'
                  }
                }}
              >
                <span style={{ fontSize: '16px', minWidth: '20px', textAlign: 'center' }}>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Profil admin + logout */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid #1e1e1e' }}>
          {!sidebarCollapsed && admin && (
            <div style={{
              padding: '10px 12px',
              marginBottom: '8px',
              backgroundColor: '#1a1a1a',
              borderRadius: '8px',
            }}>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{admin.nom}</div>
              <div style={{
                color: '#d4a017',
                fontSize: '11px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>{admin.role.replace('_', ' ')}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Déconnexion' : undefined}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: sidebarCollapsed ? '10px 0' : '10px 12px',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#555',
              fontSize: '13.5px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2d1515'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#ff6b6b'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#555'
            }}
          >
            <span style={{ fontSize: '16px' }}>🚪</span>
            {!sidebarCollapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{
        marginLeft: SIDEBAR_W,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        transition: 'margin-left 0.25s ease',
        minHeight: '100vh',
      }}>

        {/* Topbar */}
        <header style={{
          height: '60px',
          backgroundColor: '#141414',
          borderBottom: '1px solid #222',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setSidebarCollapsed(c => !c)}
              style={{
                background: 'none', border: 'none',
                color: '#666', cursor: 'pointer',
                fontSize: '18px', padding: '4px',
                borderRadius: '6px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#666'}
            >
              ☰
            </button>
            <div style={{ color: '#444', fontSize: '13px' }}>
              {NAV_ITEMS.find(i => isActive(i.href, i.exact))?.label || 'Dashboard'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '7px', height: '7px',
                borderRadius: '50%',
                backgroundColor: '#2d6a4f',
                boxShadow: '0 0 6px #2d6a4f',
              }} />
              <span style={{ color: '#555', fontSize: '12px' }}>Production</span>
            </div>

            {admin && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 12px',
                backgroundColor: '#1e1e1e',
                borderRadius: '8px',
                border: '1px solid #2a2a2a',
              }}>
                <div style={{
                  width: '28px', height: '28px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #d4a017, #b8860b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: '700', color: '#fff',
                }}>
                  {admin.nom?.charAt(0) || 'A'}
                </div>
                <div>
                  <div style={{ color: '#ddd', fontSize: '12px', fontWeight: '600' }}>{admin.nom}</div>
                  <div style={{ color: '#d4a017', fontSize: '10px', textTransform: 'uppercase' }}>
                    {admin.role.replace('_', ' ')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}