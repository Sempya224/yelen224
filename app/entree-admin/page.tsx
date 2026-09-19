'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authentifierEntreeAdmin } from '@/lib/adminEntryClient'
import { YelenLoader } from '@/components/YelenLoader'

// Admin Entry Security V2 — Lot 3 (30/08/2026). Page PUBLIQUE, chemin fixe
// et non secret (docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md, section 2) —
// seul le credential WebAuthn prouve un droit d'entrée, jamais l'URL
// elle-même. Succès ici == redirection vers /admin/login, JAMAIS le
// dashboard directement (le grant ne donne accès qu'à la page de login,
// l'authentification normale mot de passe + MFA reste inchangée ensuite).
export default function EntreeAdmin() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')
    const res = await authentifierEntreeAdmin()
    setLoading(false)
    if (res.ok) {
      router.push('/admin/login')
      return
    }
    switch (res.reason) {
      case 'unsupported':
        setError("Cet appareil ne prend pas en charge la vérification biométrique/clé de sécurité.")
        break
      case 'cancelled':
        setError('Vérification annulée.')
        break
      case 'not_configured':
      case 'server_error':
      default:
        setError('Accès indisponible pour le moment.')
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
      <div style={{ width: '100%', maxWidth: '380px', padding: '0 24px', textAlign: 'center' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '14px',
          background: 'linear-gradient(135deg, #00c896 0%, #00a37a 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: '24px', fontWeight: 800, color: '#fff',
        }}>Y</div>

        <h1 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>Accès administration</h1>
        <p style={{ color: '#666', fontSize: '13.5px', margin: '0 0 32px', lineHeight: 1.5 }}>
          Vérification par empreinte, Face ID ou clé de sécurité.
        </p>

        {error && (
          <div style={{
            backgroundColor: '#2d1515', border: '1px solid #5c2626', borderRadius: '10px',
            padding: '12px 16px', marginBottom: '20px', color: '#ff6b6b', fontSize: '13px',
          }}>{error}</div>
        )}

        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            background: loading ? '#2a2a2a' : 'linear-gradient(135deg, #00c896 0%, #00a37a 100%)',
            border: 'none', borderRadius: '10px', color: loading ? '#555' : '#fff',
            fontSize: '15px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          {loading ? <><YelenLoader size={16} color="#fff" />Vérification…</> : 'Vérifier mon identité'}
        </button>
      </div>
    </div>
  )
}
