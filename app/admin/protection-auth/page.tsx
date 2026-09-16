'use client'

// Écran admin "Protection Auth" — refonte opérationnelle (décision CEO
// 03/09/2026). Objectif : que l'agent comprenne une protection (pourquoi
// elle existe, ce qui s'est passé, si le risque est toujours présent) puis
// décide — Débloquer ou Maintenir — sans changer d'écran ni deviner.
//
// Le dossier détaillé s'ouvre dans le SlidePanel déjà utilisé par tout le
// reste de l'admin (app/admin/moderation, institutions, activites, admins,
// annonces, identite-citoyens...) — jamais un accordéon vertical inventé
// sur cette seule page, pour rester cohérent avec le seul pattern de
// panneau de détail déjà en place.
//
// Règle absolue respectée : AUCUN changement au moteur anti-abus. Mêmes
// tables (auth_device_security/auth_ip_security/auth_admin_device_security/
// auth_admin_ip_security), mêmes seuils, mêmes fenêtres. Le seul ajout
// backend est un event_type 'admin_maintain' sur auth_security_events
// (table d'audit déjà immuable) pour tracer une décision de statu quo, qui
// jusqu'ici ne laissait aucune preuve. "Maintenir" n'écrit JAMAIS dans les
// tables d'état — uniquement un événement d'audit.
import { useEffect, useState, useCallback } from 'react'
import { D, uiTokens } from '@/app/admin/adminTheme'
import { SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { ToastItem } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

type Scope = 'device' | 'ip' | 'admin_device' | 'admin_ip'
type ScopeRow = {
  device_id?: string; ip?: string; ip_last?: string | null; state: string; state_changed_at: string;
  blocked_until: string | null; block_cycles_24h: number; last_seen_at: string; blocked_reason: string | null;
  first_seen_at: string | null; attempts_in_window: number | null; window_started_at: string | null;
}
type EventRow = {
  id: string; created_at: string; event_type: 'attempt' | 'admin_unblock' | 'admin_maintain';
  endpoint_category: string | null; outcome: string | null; resulting_state: string | null;
  device_id: string | null; ip: string | null; identifiant: string | null; reason: string | null;
  admin_id: string | null; admin_users: { nom: string } | { nom: string }[] | null;
}
type ProtectionRow = {
  scope: Scope; id: string; label: string; state: string; stateChangedAt: string;
  blockedUntil: string | null; cycles: number; blockedReason: string | null;
  firstSeenAt: string | null; attemptsInWindow: number | null; windowStartedAt: string | null; ipLast: string | null;
}

const STATE_LABELS: Record<string, string> = { warning: 'Avertissement', blocked: 'Protégé', support_only: 'Support requis' }
const STATE_COLORS: Record<string, string> = { warning: D.yellow, blocked: D.red, support_only: D.red, normal: D.green }
// Fenêtre de tentatives (15 min) — même valeur que FENETRE_TENTATIVES_MS
// dans lib/security/authSecurity.ts, dupliquée UNIQUEMENT pour l'affichage
// (jamais une décision de sécurité, le moteur reste seul juge de ça) : sert
// à estimer si un simple "Avertissement" (jamais bloquant à l'entrée) est
// encore un signal frais ou déjà obsolète.
const FENETRE_TENTATIVES_MS = 15 * 60 * 1000
// Le moteur ne remet `state` à 'normal' que lors de la PROCHAINE tentative
// réelle sur ce scope (voir lireEtat/incrementerEtEvaluer) — un blocage dont
// blocked_until est déjà dépassé reste donc affiché "blocked" en base tant
// que personne ne retente. Sans cette distinction, l'agent traiterait des
// blocages déjà résolus par le temps comme s'ils étaient encore actifs
// (retour Bryan 03/09/2026).
function estExpire(row: ProtectionRow): boolean {
  if (row.state === 'support_only') return false
  if (row.state === 'blocked') return !!row.blockedUntil && new Date(row.blockedUntil).getTime() <= Date.now()
  if (row.state === 'warning') return !!row.windowStartedAt && new Date(row.windowStartedAt).getTime() + FENETRE_TENTATIVES_MS <= Date.now()
  return false
}
// Seuls 'blocked' (non expiré) et 'support_only' bloquent réellement une
// authentification (voir lireEtat : 'warning' n'est jamais bloquant à
// l'entrée) — ce sont les seules protections qui justifient une décision
// Débloquer/Maintenir. Un avertissement ou un blocage expiré est
// informatif, jamais actionnable.
function estActionnable(row: ProtectionRow): boolean {
  return row.state === 'support_only' || (row.state === 'blocked' && !estExpire(row))
}
function statutAffiche(row: ProtectionRow): { label: string; color: string } {
  if (row.state === 'blocked' && estExpire(row)) return { label: 'Expiré', color: D.textMuted }
  if (row.state === 'warning' && estExpire(row)) return { label: 'Avertissement (obsolète)', color: D.textMuted }
  if (row.state === 'normal') return { label: 'Résolu', color: D.green }
  return { label: STATE_LABELS[row.state] || row.state, color: STATE_COLORS[row.state] || D.textSub }
}
const ENDPOINT_LABELS: Record<string, string> = {
  citoyen_login: 'Connexion citoyen', citoyen_register: 'Inscription citoyen',
  institution_login: 'Connexion institution', institution_register: 'Inscription institution',
  recuperation: 'Récupération de compte', admin_login: 'Connexion admin', employee_login: 'Connexion employé',
}
const SCOPE_LABEL: Record<Scope, { type: string; contexteDefaut: string }> = {
  device: { type: 'Appareil', contexteDefaut: 'Citoyen / Institution' },
  ip: { type: 'IP', contexteDefaut: 'Citoyen / Institution' },
  admin_device: { type: 'Appareil', contexteDefaut: 'Connexion admin' },
  admin_ip: { type: 'IP', contexteDefaut: 'Connexion admin' },
}

function un<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
// Contexte réel affiché à l'agent : dérivé de blocked_reason ("Seuil de
// tentatives dépassé (citoyen_login)", voir lib/security/authSecurity.ts)
// plutôt qu'inventé — repli sur le contexte par défaut du scope si le motif
// ne contient pas la catégorie (ex. ligne créée avant ce format).
function contexteDe(row: ProtectionRow): string {
  const m = row.blockedReason?.match(/\(([^)]+)\)/)
  if (m && ENDPOINT_LABELS[m[1]]) return ENDPOINT_LABELS[m[1]]
  return SCOPE_LABEL[row.scope].contexteDefaut
}
function nomEndpoint(e: EventRow): string {
  return (e.endpoint_category && ENDPOINT_LABELS[e.endpoint_category]) || e.endpoint_category || '—'
}
// Événement déclencheur : la 1ère transition réelle vers "blocked"/"support_only"
// dans la chronologie disponible (pas simplement le plus récent) — dérivé
// mécaniquement du champ resulting_state déjà écrit par le moteur à chaque
// tentative, jamais une supposition.
function evenementDeclencheur(events: EventRow[]): EventRow | null {
  const attempts = events.filter(e => e.event_type === 'attempt').slice().reverse()
  for (let i = 0; i < attempts.length; i++) {
    const cur = attempts[i]
    if ((cur.resulting_state === 'blocked' || cur.resulting_state === 'support_only')) {
      const prev = attempts[i - 1]
      if (!prev || (prev.resulting_state !== 'blocked' && prev.resulting_state !== 'support_only')) return cur
    }
  }
  return null
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return <span style={{ backgroundColor: bg, color, fontSize: '10.5px', fontWeight: '700', padding: '2px 9px', borderRadius: '20px' }}>{children}</span>
}
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '18px' }}>
      <div style={{ color: D.textSub, fontSize: '11px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: '8px' }}>{title}</div>
      {subtitle && <div style={{ color: D.textMuted, fontSize: '11.5px', marginBottom: '8px' }}>{subtitle}</div>}
      {children}
    </div>
  )
}
function LigneProtection({ row, onClick }: { row: ProtectionRow; onClick: () => void }) {
  const statut = statutAffiche(row)
  return (
    <div onClick={onClick} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
          <Badge color={D.textSub} bg={D.surface2}>{SCOPE_LABEL[row.scope].type}</Badge>
          <code style={{ color: D.text, fontSize: '12.5px', fontWeight: '700' }}>{row.label}</code>
          <span style={{ color: D.textMuted, fontSize: '11.5px' }}>{contexteDe(row)}</span>
          <Badge color={statut.color} bg={`${statut.color}20`}>{statut.label}</Badge>
        </div>
        <span style={{ color: D.textMuted, fontSize: '11px', flexShrink: 0 }}>{row.blockedUntil ? `jusqu'au ${fmtDate(row.blockedUntil)}` : 'sans expiration'}</span>
      </div>
      <div style={{ color: D.textMuted, fontSize: '11px', marginTop: '6px' }}>
        Depuis {fmtDate(row.stateChangedAt)} · {row.cycles} cycle(s)/24h{row.ipLast ? ` · IP ${row.ipLast}` : ''}
      </div>
    </div>
  )
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '16px', flex: '1 1 140px' }}>
      <div style={{ color: D.textSub, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{label}</div>
      <div style={{ color: D.text, fontSize: '24px', fontWeight: '800' }}>{value}</div>
    </div>
  )
}

export default function ProtectionAuthPage() {
  const [role, setRole] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)

  const [rows, setRows] = useState<ProtectionRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)

  // Toast standard admin (même pattern que app/admin/admins/page.tsx) — un
  // résultat d'action ("Protection débloquée.") est un événement ponctuel,
  // pas un état persistant de la page : disparaît seul après 4s, X pour
  // fermer plus tôt. Remplace l'ancien bandeau fixe qui restait affiché
  // indéfiniment (retour Bryan 03/09/2026).
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  // Dossier ouvert dans le SlidePanel (panneau latéral droit desktop /
  // bottom sheet mobile, voir components/ui/Drawer.tsx) — jamais une
  // expansion verticale sur la liste elle-même.
  const [selected, setSelected] = useState<ProtectionRow | null>(null)
  const [dossier, setDossier] = useState<Record<string, EventRow[]>>({})
  const [dossierLoading, setDossierLoading] = useState(false)

  const [confirm, setConfirm] = useState<{ row: ProtectionRow; action: 'debloquer' | 'maintenir' } | null>(null)

  // "Débloquer" exige une réauthentification récente côté serveur
  // (auth_security.manage + verifyRecentReauth, voir
  // app/api/admin/auth-security/unblock/route.ts) — mécanisme déjà
  // construit (Mission Hardening Admin, point 5) mais jusqu'ici sans AUCUN
  // point d'entrée UI dans tout l'admin : une session fraîchement reconnectée
  // n'a pas de reauth_at (seul POST /api/admin/auth/reauth le pose), donc
  // renvoyait REAUTH_REQUIRED indéfiniment (bug réel trouvé par Bryan
  // 03/09/2026 : "je viens de me reconnecter" ne suffit jamais, reconnexion
  // ≠ réauthentification). Le mot de passe (+TOTP si actif) est redemandé
  // ici, dans le MÊME ConfirmModal, puis l'action d'origine est rejouée
  // automatiquement une fois la réauth confirmée.
  const [needsReauth, setNeedsReauth] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthTotp, setReauthTotp] = useState('')
  const [reauthTotpRequired, setReauthTotpRequired] = useState(false)
  const [reauthError, setReauthError] = useState<string | null>(null)

  const cle = (row: ProtectionRow) => `${row.scope}:${row.id}`

  function fermerConfirmation() {
    setConfirm(null)
    setNeedsReauth(false)
    setReauthPassword('')
    setReauthTotp('')
    setReauthTotpRequired(false)
    setReauthError(null)
  }

  async function soumettreReauth() {
    if (!reauthPassword.trim()) { setReauthError('Mot de passe requis.'); return }
    setReauthError(null)
    const res = await fetch('/api/admin/auth/reauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: reauthPassword, ...(reauthTotpRequired ? { totp_code: reauthTotp.replace(/\s+/g, '') } : {}) }),
    })
    const j = await res.json().catch(() => null)
    if (res.ok && j?.requiresTotp) { setReauthTotpRequired(true); return }
    if (!res.ok) { setReauthError(j?.error || 'Réauthentification refusée.'); return }
    // Réauth confirmée (nouveau cookie de session déjà posé par la réponse)
    // — rejoue l'action d'origine sans repasser par une 2e confirmation.
    setNeedsReauth(false)
    setReauthPassword('')
    setReauthTotp('')
    setReauthTotpRequired(false)
    await executerDecision()
  }

  const loadRole = useCallback(async () => {
    setRoleLoading(true)
    const res = await fetch('/api/admin/auth/me')
    const j = res.ok ? await res.json().catch(() => null) : null
    setRole(j?.admin?.role ?? null)
    setRoleLoading(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/auth-security')
    const j = res.ok ? await res.json().catch(() => null) : null
    const versLignes = (list: ScopeRow[], scope: Scope): ProtectionRow[] =>
      (list ?? []).map(r => ({
        scope, id: (r.device_id ?? r.ip)!, label: r.device_id ? `${r.device_id.slice(0, 8)}…` : r.ip!,
        state: r.state, stateChangedAt: r.state_changed_at, blockedUntil: r.blocked_until, cycles: r.block_cycles_24h,
        blockedReason: r.blocked_reason, firstSeenAt: r.first_seen_at, attemptsInWindow: r.attempts_in_window,
        windowStartedAt: r.window_started_at, ipLast: r.ip_last ?? null,
      }))
    setRows([
      ...versLignes(j?.devices ?? [], 'device'),
      ...versLignes(j?.ips ?? [], 'ip'),
      ...versLignes(j?.adminDevices ?? [], 'admin_device'),
      ...versLignes(j?.adminIps ?? [], 'admin_ip'),
    ])
    setEvents(j?.events ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadRole() }, [loadRole])
  useEffect(() => { if (role === 'super_admin') load() }, [role, load])

  async function chargerDossier(row: ProtectionRow) {
    const k = cle(row)
    setDossierLoading(true)
    const res = await fetch(`/api/admin/auth-security/historique?scope=${row.scope}&value=${encodeURIComponent(row.id)}`)
    const j = res.ok ? await res.json().catch(() => null) : null
    setDossier(prev => ({ ...prev, [k]: j?.events ?? [] }))
    setDossierLoading(false)
  }

  function ouvrirDossier(row: ProtectionRow) {
    setSelected(row)
    chargerDossier(row)
  }

  // "Historique des décisions" doit être ouvrable comme les autres listes
  // (retour Bryan 03/09/2026) — un événement de décision ne porte que
  // device_id/ip (jamais le scope admin_device/admin_ip vs device/ip
  // exact, colonnes partagées, voir migration 20260828000004). On retrouve
  // d'abord la ligne réelle dans `rows` si elle existe encore (cas
  // "maintenir", qui ne fait jamais disparaître la ligne) ; sinon (cas
  // "débloquer", la ligne est sortie de la liste car state='normal') on
  // reconstruit un dossier minimal en scope device/ip par défaut — aucune
  // donnée inventée au-delà de ce que l'événement porte déjà.
  function ouvrirDossierDepuisEvenement(e: EventRow) {
    const id = (e.device_id || e.ip)!
    const correspondance = rows.find(r => r.id === id)
    ouvrirDossier(correspondance ?? {
      scope: e.device_id ? 'device' : 'ip', id,
      label: e.device_id ? `${e.device_id.slice(0, 8)}…` : id,
      state: 'normal', stateChangedAt: e.created_at, blockedUntil: null, cycles: 0,
      blockedReason: null, firstSeenAt: null, attemptsInWindow: null, windowStartedAt: null, ipLast: null,
    })
  }

  async function executerDecision() {
    if (!confirm) return
    const { row, action } = confirm
    const scopeApi = row.scope === 'device' ? 'device' : row.scope === 'ip' ? 'ip' : row.scope === 'admin_device' ? 'admin_device' : 'admin_ip'
    const res = await fetch(`/api/admin/auth-security/${action === 'debloquer' ? 'unblock' : 'maintenir'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: scopeApi, value: row.id }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => null)
      if (j?.code === 'REAUTH_REQUIRED') {
        // Ne ferme PAS la confirmation — bascule le même popup en demande
        // de mot de passe, `confirm` reste intact pour rejouer cette même
        // action juste après (voir soumettreReauth).
        setNeedsReauth(true)
        return
      }
      setConfirm(null)
      toast("Action impossible — réessayez.", 'error')
      return
    }
    setConfirm(null)
    toast(action === 'debloquer' ? 'Protection débloquée.' : 'Protection maintenue.', 'success')
    if (action === 'debloquer') {
      // La ligne disparaît de la liste (state='normal' n'est plus retourné
      // par l'API) — plus rien à montrer dans le dossier, on referme.
      setSelected(null)
    } else {
      // "Maintenir" ne change rien à l'état : le dossier reste ouvert,
      // seule sa chronologie est rafraîchie pour refléter la décision.
      chargerDossier(row)
    }
    load()
  }

  if (roleLoading) return <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={26}/></div>
  if (role !== 'super_admin') {
    return (
      <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px' }}>
        <p style={{ color: D.textSub, fontSize: '13px' }}>Accès réservé au super admin.</p>
      </div>
    )
  }

  const decisions = events.filter(e => e.event_type === 'admin_unblock' || e.event_type === 'admin_maintain')
  const evs = selected ? (dossier[cle(selected)] ?? []) : []
  const declencheur = evenementDeclencheur(evs)
  const dernier = evs[0] ?? null
  const decisionsSelected = evs.filter(e => e.event_type === 'admin_unblock' || e.event_type === 'admin_maintain')
  const derniereDecision = decisionsSelected[0] ?? null

  return (
    <div style={{ maxWidth: '760px' }}>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Protection Auth</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Appareils et adresses IP actuellement sous protection anti-abus. Ouvrez un dossier pour comprendre la situation, puis décidez — Débloquer ou Maintenir. Sujet distinct de la sécurité du compte administrateur (voir Sécurité).
      </p>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <Stat label="Appareils protégés" value={rows.filter(r => estActionnable(r) && (r.scope === 'device' || r.scope === 'admin_device')).length} />
        <Stat label="IP protégées" value={rows.filter(r => estActionnable(r) && (r.scope === 'ip' || r.scope === 'admin_ip')).length} />
        <Stat label="Protections actives" value={rows.filter(estActionnable).length} />
        <Stat label="Événements récents" value={events.length} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><YelenLoader size={22}/></div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', marginBottom: '20px' }}>
          <p style={{ color: D.textSub, fontSize: '13px' }}>Aucun appareil ou IP sous protection actuellement.</p>
        </div>
      ) : (
        <>
          {(() => {
            const actives = rows.filter(estActionnable)
            const autres = rows.filter(r => !estActionnable(r))
            return (
              <>
                <div style={{ color: D.textSub, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
                  Protections actives — décision requise
                </div>
                {actives.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', marginBottom: '20px' }}>
                    <p style={{ color: D.textMuted, fontSize: '12.5px' }}>Aucune protection active actuellement.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                    {actives.map(row => <LigneProtection key={cle(row)} row={row} onClick={() => ouvrirDossier(row)} />)}
                  </div>
                )}

                {autres.length > 0 && (
                  <>
                    <div style={{ color: D.textMuted, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
                      Signaux non bloquants / expirés — aucune action requise
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px', opacity: 0.7 }}>
                      {autres.map(row => <LigneProtection key={cle(row)} row={row} onClick={() => ouvrirDossier(row)} />)}
                    </div>
                  </>
                )}
              </>
            )
          })()}
        </>
      )}

      {/* Même traitement visuel que "Signaux non bloquants / expirés"
          ci-dessus (en-tête gris uppercase + bloc à 70% d'opacité) —
          section informative au même titre, jamais actionnable. */}
      <div style={{ color: D.textMuted, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
        Historique des décisions
      </div>
      {decisions.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', opacity: 0.7 }}>
          <p style={{ color: D.textMuted, fontSize: '12.5px' }}>Aucune décision administrative pour l&apos;instant.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '8px 16px', opacity: 0.7 }}>
          {decisions.map(e => (
            <div
              key={e.id}
              onClick={() => ouvrirDossierDepuisEvenement(e)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 0', borderBottom: `1px solid ${D.border}`, cursor: 'pointer' }}
            >
              <span style={{ color: D.textSub, fontSize: '12px' }}>
                {fmtDate(e.created_at)} · {un(e.admin_users)?.nom || 'Admin'} · {e.device_id ? 'Appareil' : 'IP'} {(e.device_id || e.ip || '').slice(0, 12)}{(e.device_id || e.ip || '').length > 12 ? '…' : ''} · {e.event_type === 'admin_unblock' ? 'Déblocage' : 'Maintien'}
              </span>
              <Badge color={D.green} bg={D.greenDim}>Réussi</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Dossier détaillé — même SlidePanel que le reste de l'admin (panneau
          latéral droit ≥1024px, bottom sheet en mobile). */}
      <SlidePanel open={!!selected} onClose={() => setSelected(null)} title="Dossier de protection" width="480px">
        {selected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <Badge color={D.textSub} bg={D.surface2}>{SCOPE_LABEL[selected.scope].type}</Badge>
              <code style={{ color: D.text, fontSize: '13px', fontWeight: '700' }}>{selected.label}</code>
              <Badge color={statutAffiche(selected).color} bg={`${statutAffiche(selected).color}20`}>{statutAffiche(selected).label}</Badge>
            </div>
            <div style={{ color: D.textMuted, fontSize: '11.5px' }}>
              {contexteDe(selected)} · Depuis {fmtDate(selected.stateChangedAt)} · {selected.blockedUntil ? `jusqu'au ${fmtDate(selected.blockedUntil)}` : 'sans expiration'}{selected.ipLast ? ` · IP ${selected.ipLast}` : ''}
            </div>

            <Section title="Pourquoi cette protection ?">
              <div style={{ color: D.text, fontSize: '12.5px', marginBottom: '4px' }}>{selected.blockedReason || 'Motif non renseigné.'}</div>
              {declencheur && <div style={{ color: D.textMuted, fontSize: '11.5px' }}>Événement déclencheur : {nomEndpoint(declencheur)} · {declencheur.outcome || '—'} · {fmtDate(declencheur.created_at)}</div>}
              {dernier && <div style={{ color: D.textMuted, fontSize: '11.5px' }}>Dernier événement : {dernier.event_type === 'attempt' ? `${nomEndpoint(dernier)} · ${dernier.outcome || '—'}` : (dernier.event_type === 'admin_unblock' ? 'Déblocage manuel' : 'Maintien confirmé')} · {fmtDate(dernier.created_at)}</div>}
            </Section>

            <Section title="Activité récente" subtitle={selected.attemptsInWindow != null ? `${selected.attemptsInWindow} tentative(s) dans la fenêtre en cours · vu pour la 1ère fois le ${fmtDate(selected.firstSeenAt)}` : undefined}>
              {dossierLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}><YelenLoader size={16}/></div>
              ) : evs.filter(e => e.event_type === 'attempt').length === 0 ? (
                <p style={{ color: D.textMuted, fontSize: '12px', margin: 0 }}>Aucune tentative journalisée pour ce scope.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {evs.filter(e => e.event_type === 'attempt').slice(0, 15).map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '5px 0', borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ color: D.textSub, fontSize: '11.5px' }}>{nomEndpoint(e)} · {e.outcome || '—'} → {STATE_LABELS[e.resulting_state || ''] || e.resulting_state || '—'}</span>
                      <span style={{ color: D.textMuted, fontSize: '10.5px', flexShrink: 0 }}>{fmtDate(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Historique — actions administratives">
              {decisionsSelected.length === 0 ? (
                <p style={{ color: D.textMuted, fontSize: '12px', margin: 0 }}>Aucune décision administrative enregistrée sur ce dossier.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {decisionsSelected.map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '5px 0', borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ color: D.textSub, fontSize: '11.5px' }}>{e.event_type === 'admin_unblock' ? 'Débloqué' : 'Maintenu'} par {un(e.admin_users)?.nom || 'un admin'}</span>
                      <span style={{ color: D.textMuted, fontSize: '10.5px', flexShrink: 0 }}>{fmtDate(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
              {derniereDecision && (
                <div style={{ color: D.textMuted, fontSize: '11px', marginTop: '6px' }}>
                  Dernière action : {derniereDecision.event_type === 'admin_unblock' ? 'déblocage' : 'maintien'} par {un(derniereDecision.admin_users)?.nom || 'un admin'}, {fmtDate(derniereDecision.created_at)}.
                </div>
              )}
            </Section>

            <Section title="Décision">
              {estActionnable(selected) ? (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => setConfirm({ row: selected, action: 'debloquer' })} style={{ backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, color: D.green, borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>
                    🟢 Débloquer
                  </button>
                  <button onClick={() => setConfirm({ row: selected, action: 'maintenir' })} style={{ backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, color: D.red, borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>
                    🔴 Maintenir le blocage
                  </button>
                </div>
              ) : (
                <p style={{ color: D.textMuted, fontSize: '12px', margin: 0 }}>
                  {selected.state === 'warning'
                    ? "Un avertissement ne bloque aucune authentification — aucune décision n'est requise."
                    : selected.state === 'normal'
                    ? "Cette protection a déjà été résolue (débloquée) — consultez son historique ci-dessus."
                    : "Le délai de ce blocage est déjà écoulé — il ne bloque plus rien et se nettoiera de lui-même à la prochaine tentative sur ce scope."}
                </p>
              )}
            </Section>
          </div>
        )}
      </SlidePanel>

      <ConfirmModal
        open={!!confirm}
        onClose={fermerConfirmation}
        onConfirm={needsReauth ? soumettreReauth : executerDecision}
        tokens={uiTokens}
        level={1}
        danger={!needsReauth && confirm?.action === 'maintenir'}
        title={needsReauth
          ? 'Confirmez votre identité'
          : (confirm?.action === 'debloquer' ? 'Débloquer cette protection ?' : 'Maintenir cette protection ?')}
        description={needsReauth
          ? "Cette action nécessite une réauthentification récente — ressaisissez votre mot de passe pour continuer."
          : (confirm?.action === 'debloquer'
            ? "Vous êtes sur le point de retirer la protection actuellement appliquée à cet appareil/IP."
            : "La protection restera active selon les règles actuellement appliquées par le système.")}
        consequences={!needsReauth && confirm ? [
          `Type : ${SCOPE_LABEL[confirm.row.scope].type}`,
          `Identifiant : ${confirm.row.label}`,
          `Contexte : ${contexteDe(confirm.row)}`,
          `Motif de protection : ${confirm.row.blockedReason || 'non renseigné'}`,
          `Protégé depuis : ${fmtDate(confirm.row.stateChangedAt)}`,
        ] : []}
        reversible
        confirmLabel={needsReauth ? (reauthTotpRequired ? 'Confirmer le code' : 'Confirmer le mot de passe') : (confirm?.action === 'debloquer' ? 'Confirmer le déblocage' : 'Confirmer le maintien')}
        errorMessage={needsReauth ? (reauthError ?? undefined) : undefined}
      >
        {needsReauth && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '4px' }}>
            <input
              type="password" placeholder="Mot de passe" value={reauthPassword}
              onChange={e => setReauthPassword(e.target.value)} autoComplete="current-password"
              style={{ width: '100%', backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '10px', padding: '11px 13px', color: D.text, fontSize: '13px', boxSizing: 'border-box' }}
            />
            {reauthTotpRequired && (
              <input
                type="text" inputMode="numeric" placeholder="Code de vérification (6 chiffres)" value={reauthTotp}
                onChange={e => setReauthTotp(e.target.value)}
                style={{ width: '100%', backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '10px', padding: '11px 13px', color: D.text, fontSize: '13px', boxSizing: 'border-box' }}
              />
            )}
          </div>
        )}
      </ConfirmModal>

      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
    </div>
  )
}
