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
import { YelenLoader } from '@/components/YelenLoader'

type Partie = 'citoyen' | 'institution'
// Lot 2 (chantier "Messagerie", 21/08/2026, retour Bryan) — statut
// institution uniquement, absent (undefined) pour les conversations
// citoyen qui n'ont pas cette notion.
type Statut = 'nouvelle' | 'prise_en_charge' | 'fermee'
type Conversation = {
  type: Partie; id: string; nom: string;
  dernier_message: string | null; dernier_message_type: string | null; dernier_message_at: string | null; non_lus: number;
  statut?: Statut; pris_en_charge_par_nom?: string | null;
}
type Msg = { id: string; expediteur: string; contenu: string | null; image_url: string | null; type: string; lu: boolean; cree_le: string }
type Etat = { statut: Statut; pris_en_charge_par: string | null; verrouillee_par_moi: boolean }

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
function badgeStatut(statut: Statut): { label: string; bg: string; fg: string } {
  if (statut === 'nouvelle') return { label: 'Nouvelle', bg: D.yellowDim, fg: D.yellow }
  if (statut === 'fermee') return { label: 'Fermée', bg: D.border2, fg: D.textMuted }
  return { label: 'Prise en charge', bg: D.greenDim, fg: D.green }
}

export default function MessagerieAdminPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [thread, setThread] = useState<Msg[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reponse, setReponse] = useState('')
  const [sending, setSending] = useState(false)
  const [vue, setVue] = useState<'active' | 'fermee'>('active')
  const [etat, setEtat] = useState<Etat | null>(null)
  const [actionEnCours, setActionEnCours] = useState(false)
  // Confirmation avant fermeture (retour Bryan 21/08/2026 : "afficher que
  // cette action est irréversible") — modale maison, jamais window.confirm
  // (convention déjà établie dans ce projet, ex. Mes démarches côté citoyen).
  const [confirmFermeture, setConfirmFermeture] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async (v: 'active' | 'fermee') => {
    setLoading(true)
    const res = await fetch(v === 'fermee' ? '/api/admin/messagerie?statut=fermee' : '/api/admin/messagerie')
    const j = await res.json().catch(() => null)
    setConversations(res.ok ? (j?.conversations ?? []) : [])
    setLoading(false)
  }, [])

  const loadThread = useCallback(async (conv: Conversation) => {
    setThreadLoading(true)
    const res = await fetch(`/api/admin/messagerie?type=${conv.type}&id=${conv.id}`)
    const j = await res.json().catch(() => null)
    setThread(res.ok ? (j?.messages ?? []) : [])
    setEtat(res.ok ? (j?.etat ?? null) : null)
    setThreadLoading(false)
    setConversations(prev => prev.map(c => c.type === conv.type && c.id === conv.id ? { ...c, non_lus: 0 } : c))
  }, [])

  useEffect(() => { loadConversations(vue); setSelected(null) }, [vue, loadConversations])
  useEffect(() => { if (selected) loadThread(selected) }, [selected, loadThread])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [thread])

  async function appliquerAction(action: 'prendre_en_charge' | 'relacher' | 'fermer') {
    if (!selected || actionEnCours) return
    setActionEnCours(true)
    try {
      const res = await fetch('/api/admin/messagerie', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, action }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { alert(j?.error || 'Action impossible.'); return }
      // "Fermer" retire la conversation de la vue active courante — retour à
      // la liste plutôt qu'un thread fermé affiché dans le mauvais onglet.
      if (action === 'fermer') { setConfirmFermeture(false); setSelected(null); await loadConversations(vue) }
      else { await loadThread(selected); await loadConversations(vue) }
    } finally {
      setActionEnCours(false)
    }
  }

  async function envoyer() {
    if (!selected || !reponse.trim() || sending) return
    const contenu = reponse.trim()
    setSending(true)
    try {
      const res = await fetch('/api/admin/messagerie', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selected.type, id: selected.id, contenu }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        alert(j?.error || 'Envoi impossible.')
        return
      }
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

      {/* Filtre Actives/Fermées (retour Bryan 21/08/2026) — ne s'applique
          qu'aux conversations institution ; les conversations citoyen
          n'existent que dans la vue "Actives" (pas de notion de fermeture
          côté citoyen, hors périmètre de ce chantier). */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {([{ k: 'active' as const, label: 'Actives' }, { k: 'fermee' as const, label: 'Fermées' }]).map(v => (
          <button key={v.k} onClick={() => setVue(v.k)} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${vue === v.k ? D.yellow : D.border}`, background: vue === v.k ? D.yellowDim : 'transparent', color: vue === v.k ? D.yellow : D.textSub, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            {v.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', height: 'calc(100vh - 250px)', minHeight: '480px' }}>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={22}/></div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>{vue === 'fermee' ? 'Aucune conversation fermée.' : 'Aucune conversation pour l’instant.'}</div>
          ) : conversations.map(c => {
            const active = selected?.type === c.type && selected?.id === c.id
            const badge = c.statut ? badgeStatut(c.statut) : null
            return (
              <div key={`${c.type}-${c.id}`} onClick={() => setSelected(c)} style={{ padding: '13px 14px', borderBottom: `1px solid ${D.border}`, cursor: 'pointer', backgroundColor: active ? D.surface2 : 'transparent', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: D.yellowDim, color: D.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{getInitials(c.nom)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: D.text, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nom}</span>
                    <span style={{ backgroundColor: c.type === 'citoyen' ? D.blueDim : D.greenDim, color: c.type === 'citoyen' ? D.blue : D.green, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>{c.type === 'citoyen' ? 'Citoyen' : 'Institution'}</span>
                    {badge && <span style={{ backgroundColor: badge.bg, color: badge.fg, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>{badge.label}</span>}
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
              <div style={{ padding: '13px 16px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ color: D.text, fontSize: 14, fontWeight: 800 }}>{selected.nom}</div>
                {/* Actions prise en charge/relâche/fermeture (retour Bryan
                    21/08/2026) — institution uniquement, absentes pour une
                    conversation citoyen (pas cette notion, hors périmètre). */}
                {selected.type === 'institution' && etat && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {etat.statut === 'fermee' ? (
                      <span style={{ color: D.textMuted, fontSize: 12, fontWeight: 600 }}>Fermée définitivement — en attente d&apos;un nouveau message de l&apos;institution</span>
                    ) : etat.statut === 'nouvelle' ? (
                      <button onClick={() => appliquerAction('prendre_en_charge')} disabled={actionEnCours} style={{ backgroundColor: D.yellow, color: '#000', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: actionEnCours ? 0.5 : 1 }}>
                        Prendre en charge
                      </button>
                    ) : etat.verrouillee_par_moi ? (
                      <>
                        <button onClick={() => appliquerAction('relacher')} disabled={actionEnCours} style={{ backgroundColor: 'transparent', color: D.textSub, border: `1px solid ${D.border2}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: actionEnCours ? 0.5 : 1 }}>
                          Relâcher
                        </button>
                        <button onClick={() => setConfirmFermeture(true)} disabled={actionEnCours} style={{ backgroundColor: 'transparent', color: D.red, border: `1px solid ${D.red}40`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: actionEnCours ? 0.5 : 1 }}>
                          Fermer
                        </button>
                      </>
                    ) : (
                      <span style={{ color: D.textMuted, fontSize: 12, fontWeight: 600 }}>Prise en charge — verrouillée</span>
                    )}
                  </div>
                )}
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                {threadLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><YelenLoader size={22}/></div>
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
              {selected.type === 'institution' && etat && !etat.verrouillee_par_moi ? (
                <div style={{ padding: '14px 16px', borderTop: `1px solid ${D.border}`, textAlign: 'center', color: D.textMuted, fontSize: 12.5, fontWeight: 600 }}>
                  {etat.statut === 'fermee'
                    ? 'Conversation fermée définitivement — vous ne pouvez plus y répondre. Une nouvelle conversation apparaîtra dès que l’institution réécrira.'
                    : etat.statut === 'prise_en_charge'
                    ? `Prise en charge par un autre admin — vous ne pouvez pas répondre ici.`
                    : 'Prenez en charge cette conversation pour pouvoir y répondre.'}
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', gap: 8 }}>
                  <input
                    value={reponse}
                    onChange={e => setReponse(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') envoyer() }}
                    placeholder="Répondre…"
                    style={{ flex: 1, backgroundColor: D.surface2, border: `1px solid ${D.border2}`, borderRadius: 10, padding: '10px 13px', fontSize: 13, color: D.text, outline: 'none' }}
                  />
                  <button onClick={envoyer} disabled={sending || !reponse.trim()} style={{ backgroundColor: D.yellow, color: '#000', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: sending || !reponse.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {sending ? <YelenLoader size={13} color="#000"/> : 'Envoyer'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmation de fermeture — jamais window.confirm (retour Bryan
          21/08/2026 : "afficher que cette action est irréversible"). */}
      {confirmFermeture && selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => !actionEnCours && setConfirmFermeture(false)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: 16, padding: '22px 20px', maxWidth: 380, width: '100%' }}>
            <div style={{ color: D.text, fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Fermer définitivement cette conversation ?</div>
            <div style={{ color: D.textSub, fontSize: 12.5, lineHeight: 1.6, marginBottom: 18 }}>
              Cette action est <strong>irréversible</strong> — {selected.nom} ne pourra plus recevoir de réponse ici. Vous ne pourrez plus reprendre cette conversation : si l&apos;institution a besoin d&apos;aide à nouveau, elle devra écrire un nouveau message, qui ouvrira une conversation entièrement neuve.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmFermeture(false)} disabled={actionEnCours} style={{ flex: 1, backgroundColor: 'transparent', border: `1px solid ${D.border2}`, color: D.textSub, borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={() => appliquerAction('fermer')} disabled={actionEnCours} style={{ flex: 1, backgroundColor: D.red, border: 'none', color: '#fff', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: actionEnCours ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {actionEnCours ? <YelenLoader size={13} color="#fff"/> : 'Fermer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
