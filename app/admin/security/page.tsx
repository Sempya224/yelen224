'use client'

// Écran "Sécurité" admin (chantier 24/07/2026, demandé après un mot de
// passe oublié et réinitialisé manuellement par SQL) — changement de mot
// de passe en libre-service, 2FA TOTP, activité récente du compte
// connecté. Mêmes tokens de couleur que app/admin/feedback/page.tsx (pas
// de module de thème admin partagé pour l'instant).
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'
import { YelenLoader } from '@/components/YelenLoader'

type AdminInfo = { id: string; email: string; role: string; nom: string; totp_enabled: boolean; last_login: string | null }
type LogEntry = { id: string; action: string; created_at: string; details: Record<string, unknown> | null }

// Protection Auth (chantier Auth Security 28/08/2026, Lot 7) — visibilité
// des appareils/IP bloqués et journal d'événements. super_admin seul
// (lib/adminAuth.ts::auth_security.read/manage), voir la garde de rendu
// plus bas — la page elle-même reste visible à tous les rôles (réglages
// personnels), mais cette section ne l'est pas.
type AuthSecurityDevice = { device_id: string; ip_last: string | null; state: string; state_changed_at: string; blocked_until: string | null; block_cycles_24h: number; last_seen_at: string; blocked_reason: string | null }
type AuthSecurityIp = { ip: string; state: string; state_changed_at: string; blocked_until: string | null; block_cycles_24h: number; last_seen_at: string; blocked_reason: string | null }
type AuthSecurityEvent = { id: string; created_at: string; endpoint_category: string | null; event_type: string; outcome: string | null; resulting_state: string | null; device_id: string | null; ip: string | null; identifiant: string | null; admin_id: string | null }

const AUTH_STATE_LABELS: Record<string, string> = { warning: 'Avertissement', blocked: 'Bloqué', support_only: 'Support requis' }
const AUTH_STATE_COLORS: Record<string, string> = { warning: D.yellow, blocked: D.red, support_only: D.red }

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Connexion', LOGOUT: 'Déconnexion',
  MOT_DE_PASSE_CHANGE: 'Mot de passe modifié',
  '2FA_ACTIVEE': '2FA activée', '2FA_DESACTIVEE': '2FA désactivée',
}
const ACTION_COLORS: Record<string, string> = {
  LOGIN: D.green, LOGOUT: D.textMuted,
  MOT_DE_PASSE_CHANGE: D.yellow, '2FA_ACTIVEE': D.blue, '2FA_DESACTIVEE': D.red,
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
      <h2 style={{ color: D.text, fontSize: '15px', fontWeight: '700', margin: '0 0 4px' }}>{title}</h2>
      {subtitle && <p style={{ color: D.textSub, fontSize: '12.5px', margin: '0 0 16px', lineHeight: 1.5 }}>{subtitle}</p>}
      <div style={{ marginTop: subtitle ? 0 : '12px' }}>{children}</div>
    </div>
  )
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '10px', padding: '11px 13px', color: D.text, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }
}

export default function AdminSecurityPage() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [msg, setMsg] = useState<{ text: string; color: string } | null>(null)

  // Mot de passe
  const [pwdActuel, setPwdActuel] = useState('')
  const [pwdNouveau, setPwdNouveau] = useState('')
  const [pwdConfirme, setPwdConfirme] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  // 2FA
  const [activating, setActivating] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [secretText, setSecretText] = useState<string | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [totpBusy, setTotpBusy] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  // Protection Auth
  const [authDevices, setAuthDevices] = useState<AuthSecurityDevice[]>([])
  const [authIps, setAuthIps] = useState<AuthSecurityIp[]>([])
  const [authEvents, setAuthEvents] = useState<AuthSecurityEvent[]>([])
  const [authLoading, setAuthLoading] = useState(true)
  const [unblocking, setUnblocking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const meRes = await fetch('/api/admin/auth/me')
    const meJson = meRes.ok ? await meRes.json().catch(() => null) : null
    setAdmin(meJson?.admin ?? null)
    if (meJson?.admin?.id) {
      const logsRes = await fetch(`/api/admin/logs?admin_id=${meJson.admin.id}&limit=20`)
      const logsJson = logsRes.ok ? await logsRes.json().catch(() => null) : null
      setLogs(Array.isArray(logsJson) ? logsJson : [])
    }
    setLoading(false)
  }, [])

  const loadAuthSecurity = useCallback(async () => {
    setAuthLoading(true)
    const res = await fetch('/api/admin/auth-security')
    const j = res.ok ? await res.json().catch(() => null) : null
    setAuthDevices(j?.devices ?? [])
    setAuthIps(j?.ips ?? [])
    setAuthEvents(j?.events ?? [])
    setAuthLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    // 403 attendu pour tout rôle non super_admin (lib/adminAuth.ts) — la
    // section correspondante ne s'affiche simplement pas (voir garde de
    // rendu plus bas), aucun message d'erreur nécessaire pour ce cas normal.
    if (admin?.role === 'super_admin') loadAuthSecurity()
  }, [admin, loadAuthSecurity])

  async function handleUnblock(scope: 'device' | 'ip', value: string) {
    setUnblocking(value)
    const res = await fetch('/api/admin/auth-security/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, value }),
    })
    setUnblocking(null)
    if (!res.ok) { setMsg({ text: 'Erreur lors du déblocage.', color: D.red }); return }
    setMsg({ text: 'Accès rétabli sur ce scope.', color: D.green })
    loadAuthSecurity()
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwdNouveau !== pwdConfirme) { setMsg({ text: 'La confirmation ne correspond pas au nouveau mot de passe.', color: D.red }); return }
    setPwdSaving(true)
    setMsg(null)
    const res = await fetch('/api/admin/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password_actuel: pwdActuel, nouveau_password: pwdNouveau }),
    })
    const j = await res.json().catch(() => null)
    setPwdSaving(false)
    if (!res.ok) { setMsg({ text: j?.error || 'Erreur lors du changement.', color: D.red }); return }
    setPwdActuel(''); setPwdNouveau(''); setPwdConfirme('')
    setMsg({ text: 'Mot de passe mis à jour.', color: D.green })
    load()
  }

  async function startActivation() {
    setTotpBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/auth/2fa/setup', { method: 'POST' })
    const j = await res.json().catch(() => null)
    setTotpBusy(false)
    if (!res.ok) { setMsg({ text: j?.error || 'Erreur lors de la préparation de la 2FA.', color: D.red }); return }
    setQrDataUrl(j.qrDataUrl)
    setSecretText(j.secret)
    setActivating(true)
  }

  async function confirmActivation() {
    setTotpBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: confirmCode.trim() }),
    })
    const j = await res.json().catch(() => null)
    setTotpBusy(false)
    if (!res.ok) { setMsg({ text: j?.error || 'Code invalide.', color: D.red }); return }
    setBackupCodes(j.backupCodes)
    setActivating(false)
    setConfirmCode('')
    setQrDataUrl(null)
    setSecretText(null)
    load()
  }

  async function confirmDisable() {
    setTotpBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: disablePassword }),
    })
    const j = await res.json().catch(() => null)
    setTotpBusy(false)
    if (!res.ok) { setMsg({ text: j?.error || 'Erreur lors de la désactivation.', color: D.red }); return }
    setDisabling(false)
    setDisablePassword('')
    setMsg({ text: '2FA désactivée.', color: D.green })
    load()
  }

  if (loading) {
    return <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={26}/></div>
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Sécurité</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Mot de passe, double authentification et activité récente de votre compte administrateur.
      </p>

      {msg && (
        <div style={{ backgroundColor: msg.color === D.red ? D.redDim : D.greenDim, border: `1px solid ${msg.color}40`, borderRadius: '10px', padding: '11px 14px', marginBottom: '16px', color: msg.color, fontSize: '12.5px', fontWeight: '600' }}>
          {msg.text}
        </div>
      )}

      <Card title="Compte" subtitle={admin ? `${admin.email} · ${admin.role}` : undefined}>
        <p style={{ color: D.textMuted, fontSize: '12px', margin: 0 }}>
          Dernière connexion : {admin?.last_login ? fmtDate(admin.last_login) : '—'}
        </p>
      </Card>

      <Card title="Mot de passe" subtitle="Changez votre mot de passe régulièrement, surtout si vous pensez qu'il a pu être compromis.">
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="password" placeholder="Mot de passe actuel" value={pwdActuel} onChange={e => setPwdActuel(e.target.value)} autoComplete="current-password" style={inputStyle()} required />
          <input type="password" placeholder="Nouveau mot de passe (10+ caractères, lettres et chiffres)" value={pwdNouveau} onChange={e => setPwdNouveau(e.target.value)} autoComplete="new-password" style={inputStyle()} required />
          <input type="password" placeholder="Confirmer le nouveau mot de passe" value={pwdConfirme} onChange={e => setPwdConfirme(e.target.value)} autoComplete="new-password" style={inputStyle()} required />
          <button type="submit" disabled={pwdSaving} style={{ alignSelf: 'flex-end', backgroundColor: pwdSaving ? D.surface2 : D.green, color: pwdSaving ? D.textMuted : '#000', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '12.5px', fontWeight: '700', cursor: pwdSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {pwdSaving ? <><YelenLoader size={12} color={D.textMuted}/>Sauvegarde…</> : 'Mettre à jour'}
          </button>
        </form>
      </Card>

      <Card title="Authentification à deux facteurs" subtitle="Un code temporaire supplémentaire, généré par une application d'authentification (Google Authenticator, Microsoft Authenticator, etc.), demandé à chaque connexion.">
        {backupCodes ? (
          <div style={{ backgroundColor: D.yellowDim, border: `1px solid ${D.yellow}40`, borderRadius: '10px', padding: '16px' }}>
            <p style={{ color: D.yellow, fontSize: '12.5px', fontWeight: '700', margin: '0 0 10px' }}>
              Notez ces codes de secours maintenant — ils ne seront plus jamais affichés. Chacun ne fonctionne qu&apos;une seule fois, en remplacement de l&apos;application si vous la perdez.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              {backupCodes.map(c => (
                <code key={c} style={{ backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '8px 10px', color: D.text, fontSize: '13px', textAlign: 'center' }}>{c}</code>
              ))}
            </div>
            <button onClick={() => setBackupCodes(null)} style={{ backgroundColor: D.yellow, color: '#000', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>
              J&apos;ai noté mes codes
            </button>
          </div>
        ) : admin?.totp_enabled ? (
          disabling ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ color: D.textSub, fontSize: '12.5px', margin: 0 }}>Confirmez votre mot de passe pour désactiver la 2FA.</p>
              <input type="password" placeholder="Mot de passe" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} style={inputStyle()} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setDisabling(false); setDisablePassword('') }} style={{ background: 'none', border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '9px 16px', color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Annuler</button>
                <button onClick={confirmDisable} disabled={totpBusy} style={{ backgroundColor: D.red, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: totpBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {totpBusy ? <><YelenLoader size={12} color="#fff"/>Désactivation…</> : 'Désactiver la 2FA'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ backgroundColor: D.greenDim, color: D.green, fontSize: '11.5px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px' }}>Activée</span>
              <button onClick={() => setDisabling(true)} style={{ background: 'none', border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '8px 14px', color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Désactiver</button>
            </div>
          )
        ) : activating ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: D.textSub, fontSize: '12.5px', margin: 0 }}>Scannez ce QR code avec votre application d&apos;authentification, ou saisissez le secret manuellement.</p>
            {qrDataUrl && (
              // IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode.toDataURL), non fetchable par l'optimiseur next/image | reviewed=2026-08-08
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR code 2FA" style={{ width: '160px', height: '160px', borderRadius: '10px', border: `1px solid ${D.border2}`, alignSelf: 'center' }} />
            )}
            {secretText && <code style={{ backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '8px 10px', color: D.text, fontSize: '12px', textAlign: 'center', wordBreak: 'break-all' }}>{secretText}</code>}
            <input type="text" inputMode="numeric" placeholder="Code à 6 chiffres" value={confirmCode} onChange={e => setConfirmCode(e.target.value)} style={inputStyle()} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setActivating(false); setQrDataUrl(null); setSecretText(null); setConfirmCode('') }} style={{ background: 'none', border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '9px 16px', color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Annuler</button>
              <button onClick={confirmActivation} disabled={totpBusy || !confirmCode.trim()} style={{ backgroundColor: D.green, color: '#000', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: totpBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {totpBusy ? <><YelenLoader size={12} color="#000"/>Vérification…</> : 'Confirmer'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ backgroundColor: D.surface2, color: D.textSub, fontSize: '11.5px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px' }}>Désactivée</span>
            <button onClick={startActivation} disabled={totpBusy} style={{ backgroundColor: D.green, color: '#000', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '700', cursor: totpBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {totpBusy ? <><YelenLoader size={12} color="#000"/>Préparation…</> : 'Activer'}
            </button>
          </div>
        )}
      </Card>

      <Card title="Activité récente">
        {logs.length === 0 ? (
          <p style={{ color: D.textMuted, fontSize: '12.5px', margin: 0 }}>Aucune activité enregistrée pour l&apos;instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {logs.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${D.border}` }}>
                <span style={{ color: ACTION_COLORS[l.action] || D.textSub, fontSize: '12px', fontWeight: '700' }}>{ACTION_LABELS[l.action] || l.action}</span>
                <span style={{ color: D.textMuted, fontSize: '11px' }}>{fmtDate(l.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Protection Auth (chantier 28/08/2026, Lot 7) — réservée au rôle
          super_admin, voir lib/adminAuth.ts::auth_security.read. Le reste
          de cette page (mot de passe/2FA/activité) reste visible à tous
          les rôles, c'est spécifiquement cette section qui ne l'est pas. */}
      {admin?.role === 'super_admin' && (
        <Card title="Protection Auth" subtitle="Appareils et IP actuellement sous protection anti-abus (connexion/inscription citoyen et institution, récupération de compte).">
          {authLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}><YelenLoader size={18}/></div>
          ) : authDevices.length === 0 && authIps.length === 0 ? (
            <p style={{ color: D.textMuted, fontSize: '12.5px', margin: 0 }}>Aucun appareil ou IP sous protection actuellement.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              {authDevices.map(d => (
                <div key={d.device_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 0', borderBottom: `1px solid ${D.border}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ backgroundColor: `${AUTH_STATE_COLORS[d.state]}20`, color: AUTH_STATE_COLORS[d.state], fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' }}>{AUTH_STATE_LABELS[d.state] || d.state}</span>
                      <code style={{ color: D.text, fontSize: '11.5px' }}>{d.device_id.slice(0, 8)}…</code>
                    </div>
                    <div style={{ color: D.textMuted, fontSize: '11px' }}>
                      IP {d.ip_last || '—'} · {d.block_cycles_24h} cycle(s)/24h · {d.blocked_until ? `jusqu'au ${fmtDate(d.blocked_until)}` : 'permanent'}
                    </div>
                  </div>
                  <button onClick={() => handleUnblock('device', d.device_id)} disabled={unblocking === d.device_id} style={{ backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '7px 12px', color: D.text, fontSize: '11.5px', fontWeight: '700', cursor: unblocking === d.device_id ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                    {unblocking === d.device_id ? '…' : 'Débloquer'}
                  </button>
                </div>
              ))}
              {authIps.map(i => (
                <div key={i.ip} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 0', borderBottom: `1px solid ${D.border}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ backgroundColor: `${AUTH_STATE_COLORS[i.state]}20`, color: AUTH_STATE_COLORS[i.state], fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' }}>{AUTH_STATE_LABELS[i.state] || i.state}</span>
                      <code style={{ color: D.text, fontSize: '11.5px' }}>IP {i.ip}</code>
                    </div>
                    <div style={{ color: D.textMuted, fontSize: '11px' }}>
                      {i.block_cycles_24h} cycle(s)/24h · {i.blocked_until ? `jusqu'au ${fmtDate(i.blocked_until)}` : 'permanent'}
                    </div>
                  </div>
                  <button onClick={() => handleUnblock('ip', i.ip)} disabled={unblocking === i.ip} style={{ backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '7px 12px', color: D.text, fontSize: '11.5px', fontWeight: '700', cursor: unblocking === i.ip ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                    {unblocking === i.ip ? '…' : 'Débloquer'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ color: D.textSub, fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>Journal récent</h3>
          {authEvents.length === 0 ? (
            <p style={{ color: D.textMuted, fontSize: '12.5px', margin: 0 }}>Aucun événement à afficher.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {authEvents.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${D.border}` }}>
                  <span style={{ color: D.textSub, fontSize: '11.5px' }}>
                    {e.event_type === 'admin_unblock'
                      ? `Déblocage manuel — ${e.device_id ? `appareil ${e.device_id.slice(0, 8)}…` : `IP ${e.ip}`}`
                      : `${e.endpoint_category || '—'} · ${e.outcome || '—'} → ${AUTH_STATE_LABELS[e.resulting_state || ''] || e.resulting_state}`}
                  </span>
                  <span style={{ color: D.textMuted, fontSize: '10.5px', flexShrink: 0 }}>{fmtDate(e.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
