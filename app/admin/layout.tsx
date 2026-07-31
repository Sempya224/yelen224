'use client'

// Nav unifiée de l'administration Yelen (chantier refonte admin
// 26/07/2026, Lot G). Remplace l'ancien NAV_ITEMS plat à icônes emoji —
// désormais groupé, icônes SVG (app/admin/adminIcons.tsx), filtré par
// rôle admin, avec cloche de notifications (compteurs live, Lot B).
// Chaque lien pointe maintenant vers une vraie page (Lots C-F ont extrait
// les 9 vues auparavant embarquées dans app/admin/page.tsx — plus aucun
// lien mort).
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Ic } from './adminIcons'
import { AdminNotifBell } from './AdminNotifBell'

type NavItem = { href: string; label: string; icon: (c?: string) => React.ReactNode; exact?: boolean; roles?: string[] }
type NavGroup = { label: string | null; items: NavItem[] }

// roles omis = visible à tous les rôles. Matrice validée (chantier refonte
// admin 26/07/2026) : super_admin voit tout ; moderateur voit Vue
// d'ensemble + Modération + Activité ; support voit Vue d'ensemble +
// Contenu & Communication ; admin générique voit tout sauf
// Utilisateurs›Admins et Système›Logs. Sécurité = réglages personnels du
// compte connecté (pas un écran système), visible à tous quel que soit
// le rôle.
const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [
    { href: '/admin', label: "Vue d'ensemble", icon: Ic.Grid, exact: true },
  ]},
  { label: 'Modération', items: [
    { href: '/admin/institutions',  label: 'Institutions',    icon: Ic.Building,   roles: ['super_admin','moderateur','admin'] },
    { href: '/admin/moderation',    label: 'Signalements',    icon: Ic.Shield,     roles: ['super_admin','moderateur','admin'] },
    { href: '/admin/partenariats',  label: 'Partenariats',    icon: Ic.Handshake,  roles: ['super_admin','moderateur','admin'] },
    { href: '/admin/offres',        label: 'Offres Yelen',    icon: Ic.Tag,        roles: ['super_admin','moderateur','admin'] },
    { href: '/admin/posts',         label: 'Communauté',      icon: Ic.MessageSquare, roles: ['super_admin','moderateur','admin'] },
  ]},
  { label: 'Utilisateurs', items: [
    { href: '/admin/citoyens',              label: 'Citoyens',              icon: Ic.Users,  roles: ['super_admin','admin'] },
    { href: '/admin/recuperation-comptes',  label: 'Récupération comptes',  icon: Ic.Unlock, roles: ['super_admin','admin'] },
    { href: '/admin/admins',                label: 'Admins',                icon: Ic.Key,    roles: ['super_admin'] },
  ]},
  { label: 'Activité', items: [
    { href: '/admin/rdv',       label: 'Rendez-vous', icon: Ic.Calendar,   roles: ['super_admin','moderateur','admin'] },
    { href: '/admin/paiements', label: 'Paiements',    icon: Ic.CreditCard,roles: ['super_admin','moderateur','admin'] },
  ]},
  { label: 'Contenu & Communication', items: [
    { href: '/admin/annonces',    label: 'Annonces',           icon: Ic.Megaphone,     roles: ['super_admin','support','admin'] },
    { href: '/admin/feedback',    label: 'Feedback',           icon: Ic.MessageSquare, roles: ['super_admin','support','admin'] },
    { href: '/admin/satisfaction',label: 'Satisfaction',       icon: Ic.Star,          roles: ['super_admin','support','admin'] },
    { href: '/admin/messagerie',  label: 'Messagerie',         icon: Ic.Mail,          roles: ['super_admin','support','admin'] },
    { href: '/admin/documents',   label: 'Documents citoyens', icon: Ic.File,          roles: ['super_admin','support','admin'] },
  ]},
  { label: 'Système', items: [
    { href: '/admin/analytiques', label: 'Analytiques',   icon: Ic.BarChart, roles: ['super_admin','admin'] },
    { href: '/admin/logs',        label: 'Logs système',  icon: Ic.Logs,     roles: ['super_admin'] },
    { href: '/admin/security',    label: 'Sécurité',      icon: Ic.Lock },
  ]},
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
  const visibleGroups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || (admin && i.roles.includes(admin.role))) }))
    .filter(g => g.items.length > 0)
  const allItems = NAV_GROUPS.flatMap(g => g.items)

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

        {/* Navigation groupée */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {visibleGroups.map((group, gi) => (
            <div key={group.label ?? `g${gi}`} style={{ marginBottom: '6px' }}>
              {group.label && !sidebarCollapsed && (
                <div style={{ padding: '10px 12px 4px', color: '#555', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  {group.label}
                </div>
              )}
              {group.label && gi > 0 && (
                <div style={{ height: '1px', backgroundColor: '#1e1e1e', margin: '6px 4px' }} />
              )}
              {group.items.map(item => {
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
                    <span style={{ display: 'flex', minWidth: '20px', justifyContent: 'center' }}>{item.icon('currentColor')}</span>
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                )
              })}
            </div>
          ))}
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
            {Ic.Logout('#555')}
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
                padding: '4px',
                borderRadius: '6px',
                transition: 'color 0.15s',
                display: 'flex',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#666'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div style={{ color: '#444', fontSize: '13px' }}>
              {allItems.find(i => isActive(i.href, i.exact))?.label || 'Dashboard'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <AdminNotifBell/>

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
