'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [blockTimer, setBlockTimer] = useState(0)
  // 2FA (chantier "Sécurité" admin, 24/07/2026) — le mot de passe reste
  // en mémoire pour la 2e requête (email+password+totp_code), l'API
  // n'expose jamais si un compte a la 2FA avant d'avoir validé le mot de
  // passe (voir app/api/admin/auth/login/route.ts).
  const [totpRequired, setTotpRequired] = useState(false)
  const [totpCode, setTotpCode] = useState('')

  // Countdown si bloqué
  useEffect(() => {
    if (blockTimer > 0) {
      const interval = setInterval(() => {
        setBlockTimer(t => {
          if (t <= 1) { setBlocked(false); return 0 }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [blockTimer])

  function retourEtapeMotDePasse() {
    setTotpRequired(false)
    setTotpCode('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (blocked) return
    if (!totpRequired && (!email || !password)) {
      setError('Email et mot de passe requis.')
      return
    }
    if (totpRequired && !totpCode.trim()) {
      setError('Code de vérification requis.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          ...(totpRequired ? { totp_code: totpCode.trim() } : {}),
        }),
      })

      const data = await res.json()

      if (data?.requiresTotp) {
        setTotpRequired(true)
        return
      }

      if (!res.ok) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)

        if (res.status === 429) {
          setBlocked(true)
          setBlockTimer(900) // 15 min
          setError('Trop de tentatives. Réessayez dans 15 minutes.')
          return
        }

        if (newAttempts >= 3) {
          setError(`Échec de connexion. ${5 - newAttempts} tentative(s) restante(s).`)
        } else {
          setError(data.error || 'Identifiants incorrects.')
        }
        return
      }

      // Succès → redirect dashboard
      router.push('/admin')
      router.refresh()

    } catch {
      setError('Erreur réseau. Vérifiez votre connexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '0 24px',
      }}>

        {/* Logo + titre */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #00c896 0%, #00a37a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '24px',
            fontWeight: '800',
            color: '#fff',
            letterSpacing: '-1px',
          }}>Y</div>
          <h1 style={{
            color: '#ffffff',
            fontSize: '22px',
            fontWeight: '700',
            margin: '0 0 6px',
            letterSpacing: '-0.3px',
          }}>Yelen224 Admin</h1>
          <p style={{
            color: '#666',
            fontSize: '14px',
            margin: 0,
          }}>Accès restreint — personnel autorisé uniquement</p>
        </div>

        {/* Card formulaire */}
        <div style={{
          backgroundColor: '#242424',
          borderRadius: '16px',
          border: '1px solid #2e2e2e',
          padding: '36px 32px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}>

          {/* Bandeau erreur */}
          {error && (
            <div style={{
              backgroundColor: '#2d1515',
              border: '1px solid #5c2626',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span style={{ color: '#ff6b6b', fontSize: '13.5px', lineHeight: '1.4' }}>{error}</span>
            </div>
          )}

          {/* Bandeau bloqué */}
          {blocked && blockTimer > 0 && (
            <div style={{
              backgroundColor: '#1a1a2e',
              border: '1px solid #2d2d5e',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '24px',
              textAlign: 'center',
            }}>
              <span style={{ color: '#7c7cff', fontSize: '13px' }}>
                Compte temporairement bloqué — {Math.floor(blockTimer / 60)}:{String(blockTimer % 60).padStart(2, '0')}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {!totpRequired ? (
              <>
                {/* Email */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    color: '#999',
                    fontSize: '12px',
                    fontWeight: '600',
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@yelen224.gn"
                    disabled={loading || blocked}
                    autoComplete="email"
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '10px',
                      padding: '13px 16px',
                      color: '#fff',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                      opacity: blocked ? 0.5 : 1,
                    }}
                    onFocus={e => e.target.style.borderColor = '#00c896'}
                    onBlur={e => e.target.style.borderColor = '#333'}
                  />
                </div>

                {/* Password */}
                <div style={{ marginBottom: '28px' }}>
                  <label style={{
                    display: 'block',
                    color: '#999',
                    fontSize: '12px',
                    fontWeight: '600',
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}>Mot de passe</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    disabled={loading || blocked}
                    autoComplete="current-password"
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '10px',
                      padding: '13px 16px',
                      color: '#fff',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                      opacity: blocked ? 0.5 : 1,
                    }}
                    onFocus={e => e.target.style.borderColor = '#00c896'}
                    onBlur={e => e.target.style.borderColor = '#333'}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Code 2FA */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{
                    display: 'block',
                    color: '#999',
                    fontSize: '12px',
                    fontWeight: '600',
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}>Code de vérification</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value)}
                    placeholder="123456 ou XXXX-XXXX"
                    disabled={loading || blocked}
                    autoComplete="one-time-code"
                    autoFocus
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '10px',
                      padding: '13px 16px',
                      color: '#fff',
                      fontSize: '15px',
                      letterSpacing: '2px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                      opacity: blocked ? 0.5 : 1,
                    }}
                    onFocus={e => e.target.style.borderColor = '#00c896'}
                    onBlur={e => e.target.style.borderColor = '#333'}
                  />
                  <p style={{ color: '#666', fontSize: '11.5px', margin: '8px 0 0', lineHeight: 1.5 }}>
                    Depuis votre application d&apos;authentification, ou un code de secours si vous n&apos;avez plus accès à l&apos;app.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={retourEtapeMotDePasse}
                  disabled={loading}
                  style={{ background: 'none', border: 'none', color: '#666', fontSize: '12.5px', cursor: 'pointer', padding: 0, marginBottom: '20px' }}
                >
                  ← Revenir à l&apos;étape précédente
                </button>
              </>
            )}

            {/* Bouton */}
            <button
              type="submit"
              disabled={loading || blocked}
              style={{
                width: '100%',
                padding: '14px',
                background: loading || blocked
                  ? '#2a2a2a'
                  : 'linear-gradient(135deg, #00c896 0%, #00a37a 100%)',
                border: 'none',
                borderRadius: '10px',
                color: loading || blocked ? '#555' : '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading || blocked ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.2px',
              }}
            >
              {loading ? 'Vérification...' : blocked ? 'Accès bloqué' : totpRequired ? 'Valider le code' : 'Accéder au dashboard'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          color: '#3a3a3a',
          fontSize: '12px',
          marginTop: '32px',
        }}>
          Yelen224 © {new Date().getFullYear()} — Plateforme nationale de la République de Guinée
        </p>
      </div>
    </div>
  )
}