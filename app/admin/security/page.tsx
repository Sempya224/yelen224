'use client'

// Écran "Sécurité" admin (chantier 24/07/2026, demandé après un mot de
// passe oublié et réinitialisé manuellement par SQL) — changement de mot
// de passe en libre-service, 2FA TOTP, activité récente du compte
// connecté. Mêmes tokens de couleur que app/admin/feedback/page.tsx (pas
// de module de thème admin partagé pour l'instant).
import { useEffect, useState, useCallback } from 'react'
import { D } from '@/app/admin/adminTheme'

type AdminInfo = { id: string; email: string; role: string; nom: string; totp_enabled: boolean; last_login: string | null }
type LogEntry = { id: string; action: string; created_at: string; details: Record<string, unknown> | null }

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

  useEffect(() => { load() }, [load])

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
    return <div style={{ padding: '48px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement…</div>
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
          <button type="submit" disabled={pwdSaving} style={{ alignSelf: 'flex-end', backgroundColor: pwdSaving ? D.surface2 : D.green, color: pwdSaving ? D.textMuted : '#000', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '12.5px', fontWeight: '700', cursor: pwdSaving ? 'not-allowed' : 'pointer' }}>
            {pwdSaving ? 'Sauvegarde…' : 'Mettre à jour'}
          </button>
        </form>
      </Card>

      <Card title="Authentification à deux facteurs" subtitle="Un code temporaire supplémentaire, généré par une application d'authentification (Google Authenticator, Microsoft Authenticator, etc.), demandé à chaque connexion.">
        {backupCodes ? (
          <div style={{ backgroundColor: D.yellowDim, border: `1px solid ${D.yellow}40`, borderRadius: '10px', padding: '16px' }}>
            <p style={{ color: D.yellow, fontSize: '12.5px', fontWeight: '700', margin: '0 0 10px' }}>
              Notez ces codes de secours maintenant — ils ne seront plus jamais affichés. Chacun ne fonctionne qu'une seule fois, en remplacement de l'application si vous la perdez.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              {backupCodes.map(c => (
                <code key={c} style={{ backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '8px 10px', color: D.text, fontSize: '13px', textAlign: 'center' }}>{c}</code>
              ))}
            </div>
            <button onClick={() => setBackupCodes(null)} style={{ backgroundColor: D.yellow, color: '#000', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>
              J'ai noté mes codes
            </button>
          </div>
        ) : admin?.totp_enabled ? (
          disabling ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ color: D.textSub, fontSize: '12.5px', margin: 0 }}>Confirmez votre mot de passe pour désactiver la 2FA.</p>
              <input type="password" placeholder="Mot de passe" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} style={inputStyle()} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setDisabling(false); setDisablePassword('') }} style={{ background: 'none', border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '9px 16px', color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Annuler</button>
                <button onClick={confirmDisable} disabled={totpBusy} style={{ backgroundColor: D.red, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: totpBusy ? 'not-allowed' : 'pointer' }}>
                  {totpBusy ? 'Désactivation…' : 'Désactiver la 2FA'}
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
            <p style={{ color: D.textSub, fontSize: '12.5px', margin: 0 }}>Scannez ce QR code avec votre application d'authentification, ou saisissez le secret manuellement.</p>
            {qrDataUrl && <img src={qrDataUrl} alt="QR code 2FA" style={{ width: '160px', height: '160px', borderRadius: '10px', border: `1px solid ${D.border2}`, alignSelf: 'center' }} />}
            {secretText && <code style={{ backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '8px 10px', color: D.text, fontSize: '12px', textAlign: 'center', wordBreak: 'break-all' }}>{secretText}</code>}
            <input type="text" inputMode="numeric" placeholder="Code à 6 chiffres" value={confirmCode} onChange={e => setConfirmCode(e.target.value)} style={inputStyle()} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setActivating(false); setQrDataUrl(null); setSecretText(null); setConfirmCode('') }} style={{ background: 'none', border: `1px solid ${D.border2}`, borderRadius: '8px', padding: '9px 16px', color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Annuler</button>
              <button onClick={confirmActivation} disabled={totpBusy || !confirmCode.trim()} style={{ backgroundColor: D.green, color: '#000', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700', cursor: totpBusy ? 'not-allowed' : 'pointer' }}>
                {totpBusy ? 'Vérification…' : 'Confirmer'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ backgroundColor: D.surface2, color: D.textSub, fontSize: '11.5px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px' }}>Désactivée</span>
            <button onClick={startActivation} disabled={totpBusy} style={{ backgroundColor: D.green, color: '#000', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '700', cursor: totpBusy ? 'not-allowed' : 'pointer' }}>
              {totpBusy ? 'Préparation…' : 'Activer'}
            </button>
          </div>
        )}
      </Card>

      <Card title="Activité récente">
        {logs.length === 0 ? (
          <p style={{ color: D.textMuted, fontSize: '12.5px', margin: 0 }}>Aucune activité enregistrée pour l'instant.</p>
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
    </div>
  )
}
