'use client'

// Écran admin "Messagerie" — boîte de réception du support Yelen (Lot 3,
// chantier "Messagerie" 19/07/2026). Contrairement à Documents citoyens
// (lecture seule), Yelen EST la partie prenante ici : l'admin répond
// réellement aux conversations citoyen↔Yelen et institution↔Yelen
// (messages_yelen_citoyen / messages_yelen_institution, jamais fermées).
// Réponse texte uniquement pour ce lot — l'envoi d'image admin n'est pas
// construit (signalé plutôt que bricolé, à reprendre si Bryan le priorise).
import { useCallback, useEffect, useRef, useState } from 'react'
import { D } from '@/app/admin/adminTheme'

type Partie = 'citoyen' | 'institution'
type Conversation = {
  type: Partie; id: string; nom: string;
  dernier_message: string | null; dernier_message_type: string | null; dernier_message_at: string | null; non_lus: number;
}
type Msg = { id: string; expediteur: string; contenu: string | null; image_url: string | null; type: string; lu: boolean; cree_le: string }

function formatDateHeure(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function formatApercu(c: Conversation) {
  if (c.dernier_message_type === 'image') return 'Image'
  return c.dernier_message ?? 'Aucun message'
}
function getInitials(nom: string) {
  return nom.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

export default function MessagerieAdminPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [thread, setThread] = useState<Msg[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reponse, setReponse] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/messagerie')
    const j = await res.json().catch(() => null)
    setConversations(res.ok ? (j?.conversations ?? []) : [])
    setLoading(false)
  }, [])

  const loadThread = useCallback(async (conv: Conversation) => {
    setThreadLoading(true)
    const res = await fetch(`/api/admin/messagerie?type=${conv.type}&id=${conv.id}`)
    const j = await res.json().catch(() => null)
    setThread(res.ok ? (j?.messages ?? []) : [])
    setThreadLoading(false)
    setConversations(prev => prev.map(c => c.type === conv.type && c.id === conv.id ? { ...c, non_lus: 0 } : c))
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => { if (selected) loadThread(selected) }, [selected, loadThread])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [thread])

  async function envoyer() {
    if (!selected || !reponse.trim() || sending) return
    const contenu = reponse.trim()
    setSending(true)
    try {
      const res = await fetch('/api/admin/messagerie', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selected.type, id: selected.id, contenu }),
      })
      if (!res.ok) throw new Error()
      setThread(prev => [...prev, { id: `local-${Date.now()}`, expediteur: 'yelen', contenu, image_url: null, type: 'texte', lu: false, cree_le: new Date().toISOString() }])
      setReponse('')
    } catch {} finally {
      setSending(false)
    }
  }

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Messagerie</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        Boîte de réception du support Yelen — conversations avec les citoyens et les institutions, toutes confondues.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', height: 'calc(100vh - 200px)', minHeight: '480px' }}>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Chargement…</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucune conversation pour l&apos;instant.</div>
          ) : conversations.map(c => {
            const active = selected?.type === c.type && selected?.id === c.id
            return (
              <div key={`${c.type}-${c.id}`} onClick={() => setSelected(c)} style={{ padding: '13px 14px', borderBottom: `1px solid ${D.border}`, cursor: 'pointer', backgroundColor: active ? D.surface2 : 'transparent', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: D.yellowDim, color: D.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{getInitials(c.nom)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: D.text, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nom}</span>
                    <span style={{ backgroundColor: c.type === 'citoyen' ? D.blueDim : D.greenDim, color: c.type === 'citoyen' ? D.blue : D.green, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>{c.type === 'citoyen' ? 'Citoyen' : 'Institution'}</span>
                  </div>
                  <div style={{ color: c.non_lus > 0 ? D.text : D.textMuted, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatApercu(c)}</div>
                </div>
                {c.non_lus > 0 && <span style={{ backgroundColor: D.red, color: '#fff', fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{c.non_lus}</span>}
              </div>
            )
          })}
        </div>

        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted, fontSize: 13 }}>Sélectionnez une conversation</div>
          ) : (
            <>
              <div style={{ padding: '13px 16px', borderBottom: `1px solid ${D.border}`, color: D.text, fontSize: 14, fontWeight: 800 }}>{selected.nom}</div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                {threadLoading ? (
                  <div style={{ textAlign: 'center', color: D.textMuted, fontSize: 13, padding: '32px 0' }}>Chargement…</div>
                ) : thread.length === 0 ? (
                  <div style={{ textAlign: 'center', color: D.textMuted, fontSize: 13, padding: '32px 0' }}>Aucun message échangé.</div>
                ) : thread.map(m => {
                  const mine = m.expediteur === 'yelen'
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                      <div style={{ maxWidth: '65%', backgroundColor: mine ? D.yellowDim : D.surface2, border: `1px solid ${mine ? D.yellow + '40' : D.border2}`, borderRadius: 12, padding: '8px 12px' }}>
                        {m.type === 'image' && m.image_url ? (
                          <div style={{ color: D.textMuted, fontSize: 11 }}>[Image — aperçu non disponible côté admin]</div>
                        ) : null}
                        {m.contenu && <div style={{ color: D.text, fontSize: 12.5, lineHeight: 1.5 }}>{m.contenu}</div>}
                        <div style={{ color: D.textMuted, fontSize: 9.5, marginTop: 3, textAlign: 'right' }}>{formatDateHeure(m.cree_le)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', gap: 8 }}>
                <input
                  value={reponse}
                  onChange={e => setReponse(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') envoyer() }}
                  placeholder="Répondre…"
                  style={{ flex: 1, backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: 10, padding: '10px 13px', fontSize: 13, color: D.text, outline: 'none' }}
                />
                <button onClick={envoyer} disabled={sending || !reponse.trim()} style={{ backgroundColor: D.yellow, color: '#000', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: sending || !reponse.trim() ? 0.5 : 1 }}>
                  {sending ? '…' : 'Envoyer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
