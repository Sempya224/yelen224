'use client'

// Console agent "Support Yelen" (04/09/2026) — ticketing citoyen↔agent
// humain, zéro LLM (voir CLAUDE.md /protocole : philosophie systématique
// du projet, aucun calcul produit par appel LLM). Distincte de
// /admin/messagerie (messages_yelen_citoyen/institution, système existant
// non touché par ce chantier — portée citoyen uniquement pour l'instant).
import { useCallback, useEffect, useRef, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { YelenLoader } from '@/components/YelenLoader'
import {
  SUPPORT_CATEGORIE_LABELS, SUPPORT_CATEGORIE_INSTITUTION_LABELS, SUPPORT_STATUT_LABELS, SUPPORT_PRIORITE_LABELS,
  type SupportCategorie, type SupportCategorieInstitution, type SupportStatut, type SupportPriorite,
} from '@/lib/supportTicketsConstants'

// Origine citoyen/institution (chantier "Support Yelen institution",
// 06/09/2026) — file unifiée, badge distinctif plutôt que deux consoles
// séparées. citoyen_nom/institution_nom : exactement un des deux non-null.
type FileItem = {
  id: string; numero_public: string; categorie: SupportCategorie | SupportCategorieInstitution; sujet: string;
  statut: SupportStatut; priorite: SupportPriorite;
  origine: 'citoyen' | 'institution'; citoyen_nom: string | null; institution_nom: string | null;
  assigned_agent_id: string | null; agent_nom: string | null; cree_le: string; dernier_message_at: string | null;
}
type Msg = { id: string; expediteur_type: 'citoyen' | 'agent' | 'institution'; agent_nom: string | null; contenu: string | null; image_url: string | null; type: string; cree_le: string }
type TicketDetail = {
  id: string; numero_public: string; categorie: SupportCategorie | SupportCategorieInstitution; sujet: string; statut: SupportStatut; priorite: SupportPriorite;
  agent_nom: string | null; contexte_type: string | null; contexte_id: string | null; cree_le: string;
  citoyen_nom: string | null; institution_id: string | null; institution_nom: string | null; messages: Msg[]
}

function categorieLabel(c: SupportCategorie | SupportCategorieInstitution): string {
  return (SUPPORT_CATEGORIE_LABELS as Record<string, string>)[c] ?? (SUPPORT_CATEGORIE_INSTITUTION_LABELS as Record<string, string>)[c] ?? c
}
function requerantNom(item: { citoyen_nom: string | null; institution_nom: string | null }): string {
  return item.institution_nom ?? item.citoyen_nom ?? 'Inconnu'
}
type Vue = 'active' | 'attente_agent' | 'en_cours' | 'resolu' | 'cloture'

function formatDateHeure(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function tempsEcoule(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} j`
}
function badgeStatut(statut: SupportStatut): { bg: string; fg: string } {
  if (statut === 'attente_agent') return { bg: D.yellowDim, fg: D.yellow }
  if (statut === 'en_cours') return { bg: D.blueDim, fg: D.blue }
  if (statut === 'resolu') return { bg: D.greenDim, fg: D.green }
  return { bg: D.border2, fg: D.textMuted }
}
function badgePriorite(p: SupportPriorite): { bg: string; fg: string } | null {
  if (p === 'urgente') return { bg: `${D.red}18`, fg: D.red }
  if (p === 'haute') return { bg: D.yellowDim, fg: D.yellow }
  return null
}

export default function SupportAdminPage() {
  const [vue, setVue] = useState<Vue>('active')
  const [items, setItems] = useState<FileItem[]>([])
  const [compteurs, setCompteurs] = useState<Record<SupportStatut, number>>({ attente_agent: 0, en_cours: 0, resolu: 0, cloture: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [reponse, setReponse] = useState('')
  const [sending, setSending] = useState(false)
  const [actionEnCours, setActionEnCours] = useState(false)
  const [confirmCloture, setConfirmCloture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadFile = useCallback(async (v: Vue) => {
    setLoading(true)
    const qs = v === 'active' ? '' : `?statut=${v}`
    const res = await fetch(`/api/admin/support${qs}`)
    const j = await res.json().catch(() => null)
    setItems(res.ok ? (j?.items ?? []) : [])
    if (res.ok && j?.compteurs) setCompteurs(j.compteurs)
    setLoading(false)
  }, [])

  const loadTicket = useCallback(async (id: string) => {
    setTicketLoading(true)
    const res = await fetch(`/api/admin/support?id=${id}`)
    const j = await res.json().catch(() => null)
    setTicket(res.ok ? (j?.ticket ?? null) : null)
    setTicketLoading(false)
  }, [])

  useEffect(() => { loadFile(vue); setSelectedId(null); setTicket(null) }, [vue, loadFile])
  useEffect(() => { if (selectedId) loadTicket(selectedId) }, [selectedId, loadTicket])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [ticket?.messages])

  async function prendreEnCharge() {
    if (!selectedId || actionEnCours) return
    setActionEnCours(true); setErreur(null)
    try {
      const res = await fetch('/api/admin/support', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: selectedId, action: 'prendre_en_charge' }) })
      const j = await res.json().catch(() => null)
      if (!res.ok) { setErreur(j?.error || 'Action impossible.'); await loadFile(vue); return }
      await loadTicket(selectedId); await loadFile(vue)
    } finally { setActionEnCours(false) }
  }

  async function resoudre() {
    if (!selectedId || actionEnCours) return
    setActionEnCours(true); setErreur(null)
    try {
      const res = await fetch('/api/admin/support', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: selectedId, action: 'resoudre' }) })
      const j = await res.json().catch(() => null)
      if (!res.ok) { setErreur(j?.error || 'Action impossible.'); return }
      await loadTicket(selectedId); await loadFile(vue)
    } finally { setActionEnCours(false) }
  }

  async function cloturer() {
    if (!selectedId || actionEnCours) return
    setActionEnCours(true); setErreur(null)
    try {
      const res = await fetch('/api/admin/support', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: selectedId, action: 'cloturer' }) })
      const j = await res.json().catch(() => null)
      if (!res.ok) { setErreur(j?.error || 'Action impossible.'); setConfirmCloture(false); return }
      setConfirmCloture(false)
      await loadTicket(selectedId); await loadFile(vue)
    } finally { setActionEnCours(false) }
  }

  async function envoyer() {
    if (!selectedId || !reponse.trim() || sending) return
    const contenu = reponse.trim()
    setSending(true); setErreur(null)
    try {
      const res = await fetch('/api/admin/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: selectedId, contenu }) })
      const j = await res.json().catch(() => null)
      if (!res.ok) { setErreur(j?.error || 'Envoi impossible.'); return }
      setReponse('')
      await loadTicket(selectedId)
    } finally { setSending(false) }
  }

  const onglets: { k: Vue; label: string; count?: number }[] = [
    { k: 'active', label: 'Toutes' },
    { k: 'attente_agent', label: 'En attente', count: compteurs.attente_agent },
    { k: 'en_cours', label: 'En cours', count: compteurs.en_cours },
    { k: 'resolu', label: 'Résolues', count: compteurs.resolu },
    { k: 'cloture', label: 'Clôturées' },
  ]

  return (
    <div>
      <h1 style={{ color: D.text, fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>Support</h1>
      <p style={{ color: D.textSub, fontSize: '13px', marginBottom: '20px' }}>
        File d&apos;attente des demandes citoyennes — prise en charge par un agent humain, jamais automatisée.
      </p>

      {/* KPI (brief section 17) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ color: D.textMuted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>EN ATTENTE</div>
          <div style={{ color: D.yellow, fontSize: 22, fontWeight: 800 }}>{compteurs.attente_agent}</div>
        </div>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ color: D.textMuted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>EN COURS</div>
          <div style={{ color: D.blue, fontSize: 22, fontWeight: 800 }}>{compteurs.en_cours}</div>
        </div>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ color: D.textMuted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>RÉSOLUES</div>
          <div style={{ color: D.green, fontSize: 22, fontWeight: 800 }}>{compteurs.resolu}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {onglets.map(o => (
          <button key={o.k} onClick={() => setVue(o.k)} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${vue === o.k ? D.yellow : D.border}`, background: vue === o.k ? D.yellowDim : 'transparent', color: vue === o.k ? D.yellow : D.textSub, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            {o.label}{typeof o.count === 'number' ? ` (${o.count})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '16px', height: 'calc(100vh - 340px)', minHeight: '480px' }}>
        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={22}/></div>
          ) : items.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucune demande.</div>
          ) : items.map(t => {
            const active = selectedId === t.id
            const bs = badgeStatut(t.statut)
            const bp = badgePriorite(t.priorite)
            return (
              <div key={t.id} onClick={() => setSelectedId(t.id)} style={{ padding: '13px 14px', borderBottom: `1px solid ${D.border}`, cursor: 'pointer', backgroundColor: active ? D.surface2 : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: D.textMuted, fontSize: 10.5, fontWeight: 700 }}>{t.numero_public}</span>
                  <span style={{ color: D.textMuted, fontSize: 10.5 }}>{tempsEcoule(t.dernier_message_at ?? t.cree_le)}</span>
                </div>
                <div style={{ color: D.text, fontSize: 13, fontWeight: 700, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sujet}</div>
                <div style={{ color: D.textSub, fontSize: 11.5, marginBottom: 6 }}>
                  {t.origine === 'institution' && <span style={{ color: D.blue, fontWeight: 700 }}>Institution · </span>}
                  {requerantNom(t)} · {categorieLabel(t.categorie)}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: bs.bg, color: bs.fg, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{SUPPORT_STATUT_LABELS[t.statut]}</span>
                  {bp && <span style={{ backgroundColor: bp.bg, color: bp.fg, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{SUPPORT_PRIORITE_LABELS[t.priorite]}</span>}
                  {t.agent_nom && <span style={{ color: D.textMuted, fontSize: 9.5, fontWeight: 600, alignSelf: 'center' }}>{t.agent_nom}</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!ticket ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.textMuted, fontSize: 13 }}>
              {ticketLoading ? <YelenLoader size={22}/> : 'Sélectionnez une demande'}
            </div>
          ) : (
            <>
              <div style={{ padding: '13px 16px', borderBottom: `1px solid ${D.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <div>
                    <div style={{ color: D.text, fontSize: 14, fontWeight: 800 }}>{ticket.sujet}</div>
                    <div style={{ color: D.textMuted, fontSize: 11 }}>
                      {ticket.numero_public} · {ticket.institution_id && <span style={{ color: D.blue, fontWeight: 700 }}>Institution </span>}{requerantNom(ticket)} · {categorieLabel(ticket.categorie)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ticket.statut === 'attente_agent' && (
                      <button onClick={prendreEnCharge} disabled={actionEnCours} style={{ backgroundColor: D.yellow, color: '#000', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: actionEnCours ? 0.5 : 1 }}>
                        Prendre en charge
                      </button>
                    )}
                    {ticket.statut === 'en_cours' && (
                      <button onClick={resoudre} disabled={actionEnCours} style={{ backgroundColor: 'transparent', color: D.green, border: `1px solid ${D.green}40`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: actionEnCours ? 0.5 : 1 }}>
                        Marquer résolue
                      </button>
                    )}
                    {ticket.statut === 'resolu' && (
                      <button onClick={() => setConfirmCloture(true)} disabled={actionEnCours} style={{ backgroundColor: 'transparent', color: D.textSub, border: `1px solid ${D.border2}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: actionEnCours ? 0.5 : 1 }}>
                        Clôturer
                      </button>
                    )}
                  </div>
                </div>
                {erreur && <div style={{ color: D.red, fontSize: 11.5, fontWeight: 600 }}>{erreur}</div>}
              </div>

              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                {ticket.messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: D.textMuted, fontSize: 13, padding: '32px 0' }}>Aucun message.</div>
                ) : ticket.messages.map(m => {
                  const mine = m.expediteur_type === 'agent'
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                      <div style={{ maxWidth: '65%', backgroundColor: mine ? D.yellowDim : D.surface2, border: `1px solid ${mine ? D.yellow + '40' : D.border2}`, borderRadius: 12, padding: '8px 12px' }}>
                        {mine && m.agent_nom && <div style={{ color: D.yellow, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{m.agent_nom}</div>}
                        {m.contenu && <div style={{ color: D.text, fontSize: 12.5, lineHeight: 1.5 }}>{m.contenu}</div>}
                        <div style={{ color: D.textMuted, fontSize: 9.5, marginTop: 3, textAlign: 'right' }}>{formatDateHeure(m.cree_le)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {ticket.statut === 'en_cours' ? (
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
              ) : (
                <div style={{ padding: '14px 16px', borderTop: `1px solid ${D.border}`, textAlign: 'center', color: D.textMuted, fontSize: 12.5, fontWeight: 600 }}>
                  {ticket.statut === 'attente_agent' ? 'Prenez en charge cette demande pour pouvoir y répondre.'
                    : ticket.statut === 'resolu' ? 'Demande résolue — réponse possible uniquement si le citoyen répond à nouveau (réouverture automatique).'
                    : 'Demande clôturée — définitif.'}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {confirmCloture && ticket && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => !actionEnCours && setConfirmCloture(false)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: 16, padding: '22px 20px', maxWidth: 380, width: '100%' }}>
            <div style={{ color: D.text, fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Clôturer définitivement cette demande ?</div>
            <div style={{ color: D.textSub, fontSize: 12.5, lineHeight: 1.6, marginBottom: 18 }}>
              {requerantNom(ticket)} ne pourra plus écrire dans {ticket.numero_public} — une nouvelle demande devra être ouverte si besoin d&apos;aide à nouveau.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmCloture(false)} disabled={actionEnCours} style={{ flex: 1, backgroundColor: 'transparent', border: `1px solid ${D.border2}`, color: D.textSub, borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={cloturer} disabled={actionEnCours} style={{ flex: 1, backgroundColor: D.red, border: 'none', color: '#fff', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: actionEnCours ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {actionEnCours ? <YelenLoader size={13} color="#fff"/> : 'Clôturer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
