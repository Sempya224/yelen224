'use client'

// Vue d'ensemble admin — chantier refonte admin 26/07/2026, Lot H.
// Ancien monolithe de ~2440 lignes contenant à la fois cette Vue
// d'ensemble ET 9 sections entières (Institutions, Citoyens, RDV,
// Paiements, Modération, Annonces, Analytiques, Admins, Logs) sous forme
// d'onglets internes, avec son propre <aside>/<header> imbriqués dans
// ceux de app/admin/layout.tsx — c'est la cause du bug des "deux menus
// superposés" signalé par le CEO. Les 9 sections ont été extraites en
// vraies pages routées (Lots C-F) ; ce fichier ne contient plus que le
// tableau de bord lui-même (KPI, graphiques, actions rapides), sans nav
// ni topbar propres — layout.tsx est désormais la seule source de nav.
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { D } from './adminTheme'
import { Ic } from './adminIcons'
import { Badge, KPICard, LineChart, BarChart, PieChart, SlidePanel, ToastContainer, fmtMoney, fmtNum, timeAgo } from './adminUiKit'
import type { KPIs, Institution, Signalement, ActivityItem, ToastItem } from './adminTypes'

export default function AdminOverview() {
  const router = useRouter()

  // ── STATE GLOBAL ──
  const [kpis, setKpis]           = useState<KPIs | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [signalements, setSignalements] = useState<Signalement[]>([])
  const [activity, setActivity]   = useState<ActivityItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toasts, setToasts]       = useState<ToastItem[]>([])
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
        fetch('/api/admin/signalements?statut=en_cours&limit=8'),
        fetch('/api/admin/activity?limit=25'),
      ])
      if (kpisRes.ok) setKpis(await kpisRes.json())
      if (instRes.ok) setInstitutions(await instRes.json())
      if (sigRes.ok)  setSignalements(await sigRes.json())
      if (actRes.ok)  setActivity(await actRes.json())
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

  const SECT_COLORS = [D.yellow, D.blue, D.green, D.orange, D.purple, D.red, '#06b6d4', '#ec4899']

  if (loading) {
    return <div style={{ padding: '48px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Initialisation du Command Center...</div>
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>

      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))}/>

      {/* Recherche globale + actualisation — seuls éléments de l'ancien
          topbar interne conservés, réancrés ici en ligne (layout.tsx
          fournit désormais sa propre topbar, plus de bandeau dupliqué) */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
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
            style={{ width: '100%', padding: '9px 12px 9px 32px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '13px', color: D.text, outline: 'none', boxSizing: 'border-box' }}
          />
          {searchOpen && searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, boxShadow: D.shadowLg, zIndex: 300, marginTop: '4px', overflow: 'hidden' }}>
              {searchResults.map((r, i) => (
                <div key={i} onClick={() => router.push(`/admin/${r.type}`)} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: i < searchResults.length-1 ? `1px solid ${D.border}` : 'none', fontSize: '12px', color: D.text }}
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
        <button onClick={() => fetchAll(true)} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, fontSize: '12px', color: D.textSub, cursor: 'pointer', opacity: refreshing ? 0.5 : 1 }}>
          <span style={{ display: 'inline-flex', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>{Ic.Refresh(D.textSub)}</span>
          Actualiser
        </button>
      </div>

      {kpis && (
        <div style={{ maxWidth: '1400px', animation: 'fadeIn 0.2s ease' }}>

          {/* Alertes critiques */}
          {(kpis.institutions_en_attente > 0 || kpis.signalements_non_traites > 0) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', padding: '14px 16px', backgroundColor: D.surface, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radius }}>
              <div style={{ width: '100%', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: D.yellow, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {Ic.Warn(D.yellow)} Actions requises
              </div>
              {kpis.institutions_en_attente > 0 && (
                <button onClick={() => router.push('/admin/institutions')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', backgroundColor: D.surface2, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: D.text }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: D.yellow, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800' }}>{kpis.institutions_en_attente}</span>
                  Institution(s) en attente de validation
                </button>
              )}
              {kpis.signalements_non_traites > 0 && (
                <button onClick={() => router.push('/admin/moderation')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', backgroundColor: D.surface2, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: D.text }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: D.red, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800' }}>{kpis.signalements_non_traites}</span>
                  Signalement(s) non traité(s)
                </button>
              )}
            </div>
          )}

          {/* KPIs ligne 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
            <KPICard label="Institutions actives" value={fmtNum(kpis.institutions_actives)} sub={`sur ${fmtNum(kpis.institutions_total)} enregistrées`} accent={D.yellow} icon={Ic.Building(D.yellow)} onClick={() => router.push('/admin/institutions')}/>
            <KPICard label="Citoyens inscrits" value={fmtNum(kpis.citoyens_total)} sub={`+${fmtNum(kpis.citoyens_aujourd_hui)} aujourd'hui`} accent={D.blue} icon={Ic.Users(D.blue)} delta={`+${fmtNum(kpis.citoyens_ce_mois)} ce mois`} deltaPos onClick={() => router.push('/admin/citoyens')}/>
            <KPICard label="RDV aujourd'hui" value={fmtNum(kpis.rdv_aujourd_hui)} sub={`${fmtNum(kpis.rdv_ce_mois)} ce mois — ${fmtNum(kpis.rdv_total)} total`} accent={D.orange} icon={Ic.Calendar(D.orange)} onClick={() => router.push('/admin/rdv')}/>
            <KPICard label="Revenus totaux" value={fmtMoney(kpis.revenus_total)} sub={`${fmtMoney(kpis.revenus_aujourd_hui)} aujourd'hui`} accent={D.green} icon={Ic.CreditCard(D.green)} delta={fmtMoney(kpis.revenus_ce_mois)} deltaPos onClick={() => router.push('/admin/paiements')}/>
          </div>

          {/* KPIs ligne 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            <KPICard label="En attente validation" value={fmtNum(kpis.institutions_en_attente)} sub="institutions" accent={D.yellow} icon={Ic.Warn(D.yellow)} urgent={kpis.institutions_en_attente > 0} onClick={() => router.push('/admin/institutions')}/>
            <KPICard label="Taux de présence" value={`${kpis.taux_presence}%`} sub="moyenne plateforme" accent={D.green} icon={Ic.TrendUp(D.green)}/>
            <KPICard label="Satisfaction" value={kpis.avis_moyenne > 0 ? `${kpis.avis_moyenne.toFixed(1)} / 5` : '—'} sub={`${fmtNum(kpis.avis_total)} avis`} accent={D.yellow} icon={Ic.Star(D.yellow)}/>
            <KPICard label="Signalements ouverts" value={fmtNum(kpis.signalements_non_traites)} sub="requièrent une action" accent={D.red} icon={Ic.Shield(D.red)} urgent={kpis.signalements_non_traites > 0} onClick={() => router.push('/admin/moderation')}/>
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
                <button onClick={() => router.push('/admin/institutions')} style={{ background: 'none', border: 'none', color: D.yellow, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Voir tout</button>
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
                  { label: 'Créer une annonce',           action: () => router.push('/admin/annonces'),        color: D.orange },
                  { label: 'Gérer les admins',            action: () => router.push('/admin/admins'),          color: D.purple },
                  { label: 'Consulter les logs',          action: () => router.push('/admin/logs'),            color: D.blue   },
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
                <button onClick={() => router.push('/admin/moderation')} style={{ background: 'none', border: 'none', color: D.red, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Voir tout</button>
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
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>
                    <span style={{ fontSize: '12px', color: D.textSub }}>{s.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s.ok ? D.green : D.red }}/>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: s.ok ? D.green : D.red }}>{s.ok ? 'OK' : 'Hors ligne'}</span>
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

      {/* ═══ PANELS SLIDES ═══ */}

      <SlidePanel open={activePanel === 'refus'} onClose={() => setActivePanel(null)} title={`Refuser — ${selectedInst?.name || ''}`}>
        <p style={{ fontSize: '13px', color: D.textSub, marginBottom: '14px' }}>L&apos;institution sera notifiée avec ce motif par la plateforme.</p>
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
              {selectedInst.statut === 'en_attente' && <button onClick={() => validerInst(selectedInst.id)} style={{ padding: '9px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12px', fontWeight: '600', cursor: 'pointer', gridColumn: '1/-1' }}>Valider l&apos;institution</button>}
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
