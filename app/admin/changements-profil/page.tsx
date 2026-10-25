'use client'

// File d'examen des changements sensibles de profil d'établissement (nom,
// ville, adresse, coordonnées, catégorie + activité principale) — voir
// docs/product/YELEN_REVERIFICATION_POLICY.md. Les modifications sont déjà
// appliquées au moment où une demande arrive ici ; cet écran sert à les
// examiner et à tracer la décision (conforme / à corriger). Décider n'a AUCUN
// effet automatique sur le profil, le statut ou le badge de l'établissement.
// Même kit que app/admin/activites/page.tsx (DataTable / SlidePanel / Badge /
// ToastContainer), aucun nouveau système visuel. Écriture via
// /api/admin/changements-profil/[id]/decision (fonction SQL
// decider_changement_profil), jamais directe.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Badge, DataTable, SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { ToastItem } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'
import { LIBELLE_TYPE_DOCUMENT, type DocumentTypeSlug } from '@/lib/documentsInstitution'
import { libelleRelance } from '@/lib/changementsProfilAffichage'

type Demande = {
  id: string; numero: string; institution_id: string; institution_name: string | null; institution_statut: string | null
  champ: string; champ_libelle: string; ancienne_affichage: string; nouvelle_affichage: string
  membre_nom: string; statut: 'a_examiner' | 'examinee'; decision: 'conforme' | 'a_corriger' | null
  decide_par_nom: string | null; decide_le: string | null; commentaire_admin: string | null; created_at: string
  evenements: { type: 'complement_demande' | 'complement_fourni' | 'acces_restreint' | 'relance_envoyee'; acteur_nom: string; message: string | null; types_documents_libelles: string[]; suspension_reference: string | null; created_at: string }[]
  etat_complement: 'aucun' | 'demande' | 'fourni'
  documents_depuis_demande: number
}

function SectionLabel({ text }: { text: string }) {
  return <p style={{ margin: '0 0 4px', fontSize: '11px', color: D.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{text}</p>
}

// Ancienneté d'une proposition en attente : rappel pour la relance interne (aucune
// publication automatique, l'ancienne valeur reste publique tant qu'on n'a pas décidé).
function joursEcoules(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function formaterDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

export default function ChangementsProfilPage() {
  const [vue, setVue] = useState<'a_examiner' | 'examinee'>('a_examiner')
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [totalAExaminer, setTotalAExaminer] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(false)
  const [selected, setSelected] = useState<Demande | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setErreur(false)
    try {
      const res = await fetch(`/api/admin/changements-profil?statut=${vue}`)
      if (!res.ok) { setErreur(true); return }
      const body = await res.json()
      setDemandes(body.demandes ?? [])
      setTotalAExaminer(body.total_a_examiner ?? 0)
    } catch {
      setErreur(true)
    } finally { setLoading(false) }
  }, [vue])
  useEffect(() => { load() }, [load])

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Changements de profil</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>
          Propositions de modification (nom, localisation, activité) en attente de validation : les citoyens voient la valeur publiée jusqu'à votre décision. Approuver publie la proposition ; refuser conserve la valeur publiée.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: `1px solid ${D.border}` }}>
        {(['a_examiner', 'examinee'] as const).map(v => (
          <button key={v} onClick={() => setVue(v)} style={{
            padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${vue === v ? D.yellow : 'transparent'}`,
            color: vue === v ? D.text : D.textMuted, fontSize: '12.5px', fontWeight: '700',
          }}>{v === 'a_examiner' ? `À examiner (${totalAExaminer})` : 'Examinées'}</button>
        ))}
      </div>

      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24} /></div>
        ) : erreur ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.red, fontSize: '13px' }}>
            Impossible de charger la liste.{' '}
            <button onClick={load} style={{ background: 'none', border: 'none', color: D.yellow, fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}>Réessayer</button>
          </div>
        ) : demandes.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>
            {vue === 'a_examiner' ? 'Aucun changement à examiner.' : 'Aucune demande examinée.'}
          </div>
        ) : (
          <DataTable
            cols={[
              { key: 'institution', label: 'Établissement', width: '21%' },
              { key: 'champ', label: 'Champ', width: '13%' },
              { key: 'nouvelle', label: 'Nouvelle valeur', width: '23%' },
              { key: 'par', label: 'Modifié par', width: '12%' },
              { key: 'echange', label: 'Échange', width: '13%' },
              { key: 'date', label: vue === 'a_examiner' ? 'Reçue le' : 'Décision', width: '18%' },
            ]}
            onRowClick={row => setSelected(demandes.find(d => d.id === row.id) ?? null)}
            rows={demandes.map(d => ({
              id: d.id as unknown as React.ReactNode,
              institution: <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{d.institution_name ?? '—'}</span>,
              champ: <span style={{ color: D.textSub, fontSize: '12px' }}>{d.champ_libelle}</span>,
              nouvelle: <span style={{ color: D.textSub, fontSize: '12px' }}>{d.nouvelle_affichage}</span>,
              par: <span style={{ color: D.textMuted, fontSize: '11px' }}>{d.membre_nom}</span>,
              echange: d.statut === 'a_examiner' && d.etat_complement === 'demande'
                ? <Badge label="Complément demandé" color={D.orange} bg={D.orangeDim} />
                : d.statut === 'a_examiner' && d.etat_complement === 'fourni'
                  ? <Badge label="Complément reçu" color={D.yellow} bg={D.yellowDim} />
                  : <span style={{ color: D.textMuted, fontSize: '11px' }}>—</span>,
              date: d.statut === 'a_examiner'
                ? <span style={{ color: joursEcoules(d.created_at) >= 7 ? D.orange : D.textMuted, fontSize: '11px' }}>{formaterDate(d.created_at)} · en attente depuis {joursEcoules(d.created_at)} j</span>
                : <Badge label={d.decision === 'conforme' ? 'Approuvée' : 'Refusée'} color={d.decision === 'conforme' ? D.green : D.orange} bg={d.decision === 'conforme' ? D.greenDim : D.orangeDim} />,
            }))}
          />
        )}
      </div>

      <SlidePanel open={!!selected} onClose={() => setSelected(null)} title="Changement de profil" width="560px">
        {selected && (
          <DetailDemande
            demande={selected}
            toast={toast}
            onDecided={() => { setSelected(null); load() }}
          />
        )}
      </SlidePanel>
    </div>
  )
}

function DetailDemande({ demande, toast, onDecided }: {
  demande: Demande
  toast: (m: string, t?: ToastItem['type']) => void
  onDecided: () => void
}) {
  const [decision, setDecision] = useState<'conforme' | 'a_corriger' | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Lot 2 : demande de complément (répétable), la proposition reste ouverte.
  const [complementOuvert, setComplementOuvert] = useState(false)
  const [motifComplement, setMotifComplement] = useState('')
  const [typesComplement, setTypesComplement] = useState<DocumentTypeSlug[]>([])
  // Lot 3 : restriction de l'accès citoyen = suspension existante liée à la demande.
  const [restrictionOuverte, setRestrictionOuverte] = useState(false)
  const [motifRestriction, setMotifRestriction] = useState('')
  const [dureeRestriction, setDureeRestriction] = useState<'indefinie' | '7' | '30' | '90'>('indefinie')
  const [restrictionConfirmee, setRestrictionConfirmee] = useState(false)
  const inputStyle: React.CSSProperties = { padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface2, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', width: '100%' }

  async function envoyer() {
    if (!decision) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/changements-profil/${demande.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, commentaire: commentaire.trim() || null, statut_vu: demande.statut }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) { toast('Décision enregistrée'); onDecided() }
      else if (body?.code === 'CONFLIT_CONCURRENCE') { toast('Cette demande a déjà été traitée entretemps — rechargement.', 'error'); onDecided() }
      else { toast(body?.error || 'Erreur — décision non enregistrée', 'error') }
    } catch {
      toast('Erreur réseau', 'error')
    } finally { setSubmitting(false) }
  }

  async function demanderComplement() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/changements-profil/${demande.id}/complement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif: motifComplement.trim(), types_documents: typesComplement }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) { toast(body?.notifie === false ? 'Complément demandé (notification non envoyée)' : 'Complément demandé — l’établissement est prévenu'); onDecided() }
      else if (body?.code === 'CONFLIT_CONCURRENCE') { toast('Cette demande a déjà été traitée entretemps — rechargement.', 'error'); onDecided() }
      else { toast(body?.error || 'Erreur — demande de complément non enregistrée', 'error') }
    } catch {
      toast('Erreur réseau', 'error')
    } finally { setSubmitting(false) }
  }

  async function restreindre() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/changements-profil/${demande.id}/restreindre`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif: motifRestriction.trim(), duree_jours: dureeRestriction === 'indefinie' ? null : Number(dureeRestriction), confirme: restrictionConfirmee }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) { toast(body?.notifie === false ? 'Accès restreint (notification non envoyée)' : 'Accès citoyen restreint — l’établissement est prévenu'); onDecided() }
      else if (body?.code === 'CONFLIT_CONCURRENCE' || body?.code === 'DEJA_RESTREINT') { toast(body.error, 'error'); onDecided() }
      else { toast(body?.error || 'Erreur — restriction non enregistrée', 'error') }
    } catch {
      toast('Erreur réseau', 'error')
    } finally { setSubmitting(false) }
  }

  const examinee = demande.statut === 'examinee'
  const restreint = demande.institution_statut === 'suspendue'
  const typesProposes = [...new Set(Object.keys(LIBELLE_TYPE_DOCUMENT))] as DocumentTypeSlug[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <SectionLabel text="Établissement" />
          <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: D.text }}>{demande.institution_name ?? '—'}</p>
        </div>
        <div>
          <SectionLabel text={`Champ modifié · ${demande.numero}`} />
          <p style={{ margin: 0, fontSize: '12.5px', color: D.textSub }}>{demande.champ_libelle}</p>
        </div>
        <div>
          <SectionLabel text="Valeur publiée (vue des citoyens)" />
          <p style={{ margin: 0, fontSize: '12.5px', color: D.textMuted, wordBreak: 'break-word' }}>{demande.ancienne_affichage}</p>
        </div>
        <div>
          <SectionLabel text="Proposé (non publié)" />
          <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: D.text, wordBreak: 'break-word' }}>{demande.nouvelle_affichage}</p>
        </div>
        <div>
          <SectionLabel text="Modifié par" />
          <p style={{ margin: 0, fontSize: '12.5px', color: D.textSub }}>{demande.membre_nom} · {formaterDate(demande.created_at)}</p>
        </div>
      </div>

      {restreint && (
        <div style={{ backgroundColor: D.redDim, borderRadius: D.radiusSm, border: `1px solid ${D.redBrd}`, padding: '10px 12px', color: D.red, fontSize: '12px', lineHeight: 1.5 }}>
          L’accès citoyen à cet établissement est restreint (suspension). Pour le rétablir, utilisez la page{' '}
          <a href="/admin/institutions" style={{ color: D.red, fontWeight: 700, textDecoration: 'underline' }}>Institutions</a>.
        </div>
      )}

      {demande.evenements.length > 0 && (
        <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <SectionLabel text="Échanges avec l’établissement" />
          {demande.evenements.map((e, i) => (
            <div key={i} style={{ borderTop: i > 0 ? `1px solid ${D.border}` : 'none', paddingTop: i > 0 ? '8px' : 0 }}>
              <p style={{ margin: 0, fontSize: '11px', color: D.textMuted }}>
                {e.type === 'relance_envoyee' ? libelleRelance(e.message) : e.type === 'complement_demande' ? `Complément demandé par ${e.acteur_nom}` : e.type === 'acces_restreint' ? `Accès citoyen restreint par ${e.acteur_nom}${e.suspension_reference ? ` (réf. ${e.suspension_reference})` : ''}` : `Réponse de l’établissement (${e.acteur_nom})`} · {formaterDate(e.created_at)}
              </p>
              {e.message && e.type !== 'relance_envoyee' && <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: D.textSub, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{e.message}</p>}
              {e.types_documents_libelles.length > 0 && <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: D.textMuted }}>Pièces attendues : {e.types_documents_libelles.join(', ')}</p>}
            </div>
          ))}
          {demande.etat_complement !== 'aucun' && (
            <p style={{ margin: 0, fontSize: '11.5px', color: demande.documents_depuis_demande > 0 ? D.green : D.textMuted }}>
              {demande.documents_depuis_demande} document{demande.documents_depuis_demande > 1 ? 's' : ''} déposé{demande.documents_depuis_demande > 1 ? 's' : ''} depuis la dernière demande —{' '}
              <a href="/admin/verification" style={{ color: D.yellow, textDecoration: 'underline' }}>ouvrir le dossier de vérification</a>
            </p>
          )}
        </div>
      )}

      {examinee ? (
        <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <SectionLabel text="Décision" />
            <Badge label={demande.decision === 'conforme' ? 'Approuvée' : 'Refusée'} color={demande.decision === 'conforme' ? D.green : D.orange} bg={demande.decision === 'conforme' ? D.greenDim : D.orangeDim} />
          </div>
          <div>
            <SectionLabel text="Examinée par" />
            <p style={{ margin: 0, fontSize: '12.5px', color: D.textSub }}>{demande.decide_par_nom ?? '—'} · {formaterDate(demande.decide_le)}</p>
          </div>
          {demande.commentaire_admin && (
            <div>
              <SectionLabel text="Commentaire" />
              <p style={{ margin: 0, fontSize: '12.5px', color: D.textSub, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{demande.commentaire_admin}</p>
            </div>
          )}
        </div>
      ) : restrictionOuverte ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ backgroundColor: D.redDim, borderRadius: D.radiusSm, border: `1px solid ${D.redBrd}`, padding: '10px 12px', color: D.red, fontSize: '12px', lineHeight: 1.6 }}>
            Action lourde : l’établissement ne sera plus visible des citoyens, les rendez-vous imminents seront annulés automatiquement et il verra l’écran « Espace suspendu » avec la possibilité de demander une révision. La proposition reste en attente.
          </div>
          <div>
            <SectionLabel text="Motif (obligatoire, transmis à l’établissement)" />
            <textarea value={motifRestriction} onChange={e => setMotifRestriction(e.target.value)} rows={3} maxLength={1000} style={{ ...inputStyle, resize: 'none' }} />
          </div>
          <div>
            <SectionLabel text="Durée" />
            <select value={dureeRestriction} onChange={e => setDureeRestriction(e.target.value as 'indefinie' | '7' | '30' | '90')} style={inputStyle}>
              <option value="indefinie">Jusqu’à nouvel ordre</option>
              <option value="7">7 jours</option>
              <option value="30">30 jours</option>
              <option value="90">90 jours</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: D.textSub, cursor: 'pointer' }}>
            <input type="checkbox" checked={restrictionConfirmee} onChange={e => setRestrictionConfirmee(e.target.checked)} style={{ marginTop: '2px' }} />
            Je confirme vouloir restreindre l’accès citoyen à cet établissement.
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={submitting || motifRestriction.trim().length === 0 || !restrictionConfirmee}
              onClick={restreindre}
              style={{ flex: 1, padding: '10px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, color: D.red, fontSize: '12.5px', fontWeight: '700', cursor: submitting ? 'default' : 'pointer' }}
            >{submitting ? 'Envoi…' : 'Restreindre l’accès'}</button>
            <button disabled={submitting} onClick={() => setRestrictionOuverte(false)} style={{ flex: 1, padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Retour</button>
          </div>
        </div>
      ) : complementOuvert ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ margin: 0, fontSize: '11.5px', color: D.textMuted, lineHeight: 1.5 }}>
            Les documents fournis à Yelen ne correspondent pas à la modification ? Demandez un complément : la proposition reste en attente, la valeur publiée ne change pas, et l’établissement est prévenu. Vous pourrez redemander autant de fois que nécessaire.
          </p>
          <div>
            <SectionLabel text="Motif (obligatoire, transmis à l’établissement)" />
            <textarea value={motifComplement} onChange={e => setMotifComplement(e.target.value)} rows={3} maxLength={1000} style={{ ...inputStyle, resize: 'none' }} />
          </div>
          <div>
            <SectionLabel text="Pièces attendues (facultatif)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {typesProposes.map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: D.textSub, cursor: 'pointer' }}>
                  <input type="checkbox" checked={typesComplement.includes(t)} onChange={e => setTypesComplement(cur => e.target.checked ? [...cur, t] : cur.filter(x => x !== t))} />
                  {LIBELLE_TYPE_DOCUMENT[t]}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={submitting || motifComplement.trim().length === 0}
              onClick={demanderComplement}
              style={{ flex: 1, padding: '10px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12.5px', fontWeight: '700', cursor: submitting ? 'default' : 'pointer' }}
            >{submitting ? 'Envoi…' : 'Envoyer la demande'}</button>
            <button disabled={submitting} onClick={() => setComplementOuvert(false)} style={{ flex: 1, padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Retour</button>
          </div>
        </div>
      ) : !decision ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '11.5px', color: D.textMuted, lineHeight: 1.5 }}>
            La décision est enregistrée de façon permanente. Approuver publie la nouvelle valeur côté citoyen ; refuser conserve la valeur publiée. Dans les deux cas, ni le statut ni le badge de l&apos;établissement ne changent.
          </p>
          <button onClick={() => setDecision('conforme')} style={{ padding: '10px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Approuver et publier</button>
          <button onClick={() => setDecision('a_corriger')} style={{ padding: '10px', backgroundColor: D.orangeDim, border: `1px solid ${D.orangeBrd}`, borderRadius: D.radiusSm, color: D.orange, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Refuser la proposition</button>
          <button onClick={() => setComplementOuvert(true)} style={{ padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Demander un complément</button>
          {demande.institution_statut === 'validee' && (
            <button onClick={() => setRestrictionOuverte(true)} style={{ padding: '10px', backgroundColor: D.redDim, border: `1px solid ${D.redBrd}`, borderRadius: D.radiusSm, color: D.red, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Restreindre l’accès citoyen</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <SectionLabel text={decision === 'a_corriger' ? 'Motif du refus (obligatoire, transmis à l’établissement)' : 'Commentaire (facultatif)'} />
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={submitting || (decision === 'a_corriger' && commentaire.trim().length === 0)}
              onClick={envoyer}
              style={{ flex: 1, padding: '10px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12.5px', fontWeight: '700', cursor: submitting ? 'default' : 'pointer' }}
            >{submitting ? 'Envoi…' : 'Confirmer'}</button>
            <button disabled={submitting} onClick={() => setDecision(null)} style={{ flex: 1, padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Retour</button>
          </div>
        </div>
      )}
    </div>
  )
}
