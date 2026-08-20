'use client'

// Console de vérification (Trust Lot 2.5) — interface opérationnelle du
// moteur de confiance validé aux Lots 2.2-2.4 (documents_institution
// versionné, verification_decisions/verification_decision_preuves
// immuables, RPC prendre_decision_verification à verrouillage optimiste,
// 15/15 tests VERIFIED IN DATABASE + 13/13 VERIFIED IN APPLICATION — voir
// docs/product/YELEN_TRUST_VERIFICATION_ADMIN_WORKFLOW.md). Patron UI
// répliqué de app/admin/moderation/page.tsx (CasTab) — même kit
// (DataTable/SlidePanel/Badge/ToastContainer/YelenLoader), aucun nouveau
// système visuel.
//
// Principe non négociable (Lot 0, jamais relâché ici) : ce dossier
// n'affiche et ne modifie jamais que les axes Identité/Autorité, jamais un
// bouton "Valider l'institution" générique, jamais la Réputation
// (moyenne_avis/reputationScore) mélangée aux preuves de confiance.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Ic } from '@/app/admin/adminIcons'
import { Badge, DataTable, SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { ToastItem } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'

type InstitutionListItem = {
  id: string; name: string; statut: string; statut_juridique: string | null
  secteur: string | null; badge_verifie: boolean; niveau_confiance: string; created_at: string
}

type DocumentEntry = {
  id: string; type: string; nom: string; statut: string; motif_rejet: string | null
  soumis_le: string; examine_le: string | null; numero_version: number
  statut_actif: boolean; remplace_version_id: string | null; hash_integrite: string | null; url: string | null
}

type PreuveSnapshot = {
  decision_id: string; document_institution_id: string; type_snapshot: string
  numero_version_snapshot: number; statut_snapshot: string; examine_par_nom_snapshot: string | null
}

type Axe = 'identite' | 'autorite'
type TypeDecision = 'accordee' | 'complement_demande' | 'rejetee' | 'revoquee'

type Decision = {
  id: string; decision_id: string; axe: Axe; type_decision: TypeDecision
  niveau_preuve: string | null; examinateur_nom: string; decide_le: string
  justification: string; expire_le: string | null; complement_demande_motif: string | null
  decision_precedente_id: string | null; revoque_decision_id: string | null
  preuves: PreuveSnapshot[]
}

type Dossier = {
  institution: {
    id: string; name: string; statut: string; statut_juridique: string | null
    secteur: string | null; badge_verifie: boolean; niveau_confiance: string; created_at: string
  }
  responsable: { prenom: string; nom: string; role: string | null; phone: string | null; email: string | null } | null
  requis: { type: string; label: string; description: string; obligatoire: boolean }[]
  documents: DocumentEntry[]
  decisions: Record<Axe, { actuelle: Decision | null; historique: Decision[] }>
}

const TYPE_DECISION_LABEL: Record<TypeDecision, { label: string; color: string; bg: string }> = {
  accordee: { label: 'Vérifié', color: D.green, bg: D.greenDim },
  complement_demande: { label: 'Complément demandé', color: D.orange, bg: D.orangeDim },
  rejetee: { label: 'Non vérifié', color: D.red, bg: D.redDim },
  revoquee: { label: 'Révoqué', color: D.red, bg: D.redDim },
}
const AXE_LABEL: Record<Axe, string> = { identite: 'Identité', autorite: 'Autorité' }
// Vocabulaire distinct de TYPE_DECISION_LABEL — documents_institution.statut
// (recu/valide/rejete/complement_demande) n'est PAS le même enum que
// verification_decisions.type_decision (accordee/rejetee/complement_demande/
// revoquee), malgré le chevauchement trompeur sur "complement_demande".
// Trouvé en relecture : réutiliser TYPE_DECISION_LABEL ici faisait
// afficher tout document valide/rejeté en gris neutre (clé jamais trouvée).
const STATUT_DOCUMENT_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  recu: { label: 'Reçu', color: D.blue, bg: D.blueDim },
  valide: { label: 'Validé', color: D.green, bg: D.greenDim },
  rejete: { label: 'Rejeté', color: D.red, bg: D.redDim },
  complement_demande: { label: 'Complément demandé', color: D.orange, bg: D.orangeDim },
}
const NIVEAU_PREUVE_LABEL: Record<string, string> = { profil_verifie: 'Identité vérifiée', institution_certifiee: 'Identité vérifiée — preuve renforcée' }

function fieldRow(label: string, value: React.ReactNode) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${D.border}`, gap: '12px' }}>
      <span style={{ fontSize: '12px', color: D.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: '600', color: D.text, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function VerificationPage() {
  const [items, setItems] = useState<InstitutionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/verification?search=${encodeURIComponent(q)}`)
      if (res.ok) setItems(await res.json())
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Vérification</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>
          Registre de confiance — décisions Identité/Autorité fondées sur des preuves versionnées, jamais sur la réputation.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
          <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: D.textMuted }}>{Ic.Search(D.textMuted)}</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(search) }}
            placeholder="Rechercher une institution…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface2, color: D.text, fontSize: '12.5px' }}
          />
        </div>
        <button onClick={() => load(search)} style={{ padding: '9px 14px', backgroundColor: D.surface2, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Rechercher</button>
      </div>

      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24} /></div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucune institution</div>
        ) : (
          <DataTable
            cols={[
              { key: 'name', label: 'Institution', width: '30%' },
              { key: 'statut', label: 'Statut compte', width: '16%' },
              { key: 'juridique', label: 'Statut juridique', width: '18%' },
              { key: 'niveau', label: 'Niveau de confiance', width: '20%' },
              { key: 'date', label: 'Inscrite le', width: '16%' },
            ]}
            onRowClick={row => setSelectedId(row.id as unknown as string)}
            rows={items.map(it => ({
              id: it.id as unknown as React.ReactNode,
              name: <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{it.name}</span>,
              statut: <span style={{ color: D.textSub, fontSize: '12px' }}>{it.statut}</span>,
              juridique: <span style={{ color: D.textSub, fontSize: '12px' }}>{it.statut_juridique || '—'}</span>,
              niveau: <span style={{ color: D.textMuted, fontSize: '11px' }}>{it.niveau_confiance}</span>,
              date: <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(it.created_at).toLocaleDateString('fr-FR')}</span>,
            }))}
          />
        )}
      </div>

      <SlidePanel open={!!selectedId} onClose={() => setSelectedId(null)} title="Dossier de vérification" width="620px">
        {selectedId && <DossierPanel institutionId={selectedId} toast={toast} onClosed={() => setSelectedId(null)} />}
      </SlidePanel>
    </div>
  )
}

function DossierPanel({ institutionId, toast, onClosed }: {
  institutionId: string
  toast: (message: string, type?: ToastItem['type']) => void
  onClosed: () => void
}) {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/verification`)
      if (res.ok) setDossier(await res.json())
      else { toast('Impossible de charger le dossier', 'error'); onClosed() }
    } finally { setLoading(false) }
  }, [institutionId, toast, onClosed])
  useEffect(() => { load() }, [load])

  if (loading || !dossier) {
    return <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24} /></div>
  }

  const documentsActifs = dossier.documents.filter(d => d.statut_actif)
  const groupesParType = Array.from(new Set(dossier.documents.map(d => d.type))).map(type => ({
    type,
    versions: dossier.documents.filter(d => d.type === type).sort((a, b) => b.numero_version - a.numero_version),
  }))
  const manquants = dossier.requis.filter(r => !documentsActifs.some(d => d.type === r.type))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* ── Rappel de séparation des axes — toujours visible ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: D.radiusSm }}>
        <span style={{ flexShrink: 0, marginTop: '1px' }}>{Ic.Shield(D.blue)}</span>
        <p style={{ margin: 0, fontSize: '11.5px', color: D.textSub, lineHeight: 1.5 }}>
          Ce dossier ne reflète jamais la réputation (avis, activité) — uniquement les preuves d&apos;Identité et d&apos;Autorité examinées par Yelen, axe par axe.
        </p>
      </div>

      {/* ── Identité de l'institution ── */}
      <div>
        <SectionLabel text="Institution" />
        <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
          {fieldRow('Nom', dossier.institution.name)}
          {fieldRow('Statut du compte', dossier.institution.statut)}
          {fieldRow('Statut juridique', dossier.institution.statut_juridique || '—')}
          {fieldRow('Secteur', dossier.institution.secteur || '—')}
          {fieldRow('Niveau de confiance affiché', dossier.institution.niveau_confiance)}
          {fieldRow('Badge public', dossier.institution.badge_verifie ? 'Accordé' : 'Non accordé')}
        </div>
      </div>

      {/* ── Responsable / Autorité déclarée ── */}
      <div>
        <SectionLabel text="Responsable déclaré (Autorité)" />
        {dossier.responsable ? (
          <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
            {fieldRow('Nom', `${dossier.responsable.prenom} ${dossier.responsable.nom}`)}
            {fieldRow('Rôle déclaré', dossier.responsable.role || '—')}
            {fieldRow('Téléphone', dossier.responsable.phone || '—')}
          </div>
        ) : (
          <EmptyNote text="Aucun responsable déclaré." />
        )}
        <p style={{ margin: '6px 0 0', fontSize: '11px', color: D.textMuted, fontStyle: 'italic' }}>
          Déclaratif uniquement — aucune preuve n&apos;est aujourd&apos;hui rattachée directement au responsable (limite connue, hors périmètre de ce lot).
        </p>
      </div>

      {/* ── Documents manquants ── */}
      {manquants.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', backgroundColor: D.orangeDim, border: `1px solid ${D.orangeBrd}`, borderRadius: D.radiusSm }}>
          <span style={{ flexShrink: 0, marginTop: '1px' }}>{Ic.Warn(D.orange)}</span>
          <p style={{ margin: 0, fontSize: '11.5px', color: D.textSub, lineHeight: 1.5 }}>
            Preuve(s) attendue(s) jamais déposée(s) : {manquants.map(m => m.label).join(', ')}.
          </p>
        </div>
      )}

      {/* ── Documents déposés, versionnés ── */}
      <div>
        <SectionLabel text="Documents déposés (toutes versions)" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {groupesParType.map(g => (
            <div key={g.type} style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', backgroundColor: D.surface3, fontSize: '11.5px', fontWeight: '700', color: D.text }}>{g.type}</div>
              {g.versions.map((d, i) => (
                <div key={d.id} style={{ padding: '9px 12px', borderTop: i > 0 ? `1px solid ${D.border}` : 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', color: D.text, fontWeight: '600' }}>Version {d.numero_version}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Badge label={d.statut_actif ? 'Active' : 'Remplacée'} color={d.statut_actif ? D.green : D.textMuted} bg={d.statut_actif ? D.greenDim : D.surface3} />
                      <Badge label={STATUT_DOCUMENT_LABEL[d.statut]?.label || d.statut} color={STATUT_DOCUMENT_LABEL[d.statut]?.color || D.textMuted} bg={STATUT_DOCUMENT_LABEL[d.statut]?.bg || D.surface3} />
                    </div>
                  </div>
                  <span style={{ fontSize: '10.5px', color: D.textMuted }}>
                    Déposé le {new Date(d.soumis_le).toLocaleString('fr-FR')}
                    {d.examine_le && ` · Examiné le ${new Date(d.examine_le).toLocaleString('fr-FR')}`}
                    {d.motif_rejet && ` · Motif : ${d.motif_rejet}`}
                  </span>
                  {d.hash_integrite && <span style={{ fontSize: '10px', color: D.textMuted, fontFamily: 'monospace' }}>hash {d.hash_integrite.slice(0, 16)}…</span>}
                  {d.url && <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: D.blue, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>{Ic.Eye(D.blue)} Aperçu sécurisé (lien valide 60s)</a>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Décision par axe ── */}
      {(['identite', 'autorite'] as const).map(axe => (
        <AxeSection key={axe} axe={axe} dossier={dossier} documentsActifs={documentsActifs} toast={toast} onDecided={load} />
      ))}
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return <p style={{ margin: '0 0 8px', fontSize: '11px', color: D.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{text}</p>
}
function EmptyNote({ text }: { text: string }) {
  return <p style={{ margin: 0, fontSize: '12px', color: D.textMuted, fontStyle: 'italic', padding: '10px 12px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}` }}>{text}</p>
}

function AxeSection({ axe, dossier, documentsActifs, toast, onDecided }: {
  axe: Axe
  dossier: Dossier
  documentsActifs: DocumentEntry[]
  toast: (message: string, type?: ToastItem['type']) => void
  onDecided: () => void
}) {
  const actuelle = dossier.decisions[axe].actuelle
  const historique = dossier.decisions[axe].historique
  const [niveauPreuve, setNiveauPreuve] = useState('profil_verifie')
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [justification, setJustification] = useState('')
  const [complementMotif, setComplementMotif] = useState('')
  const [pending, setPending] = useState<TypeDecision | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showHistorique, setShowHistorique] = useState(false)

  function resetForm() {
    setNiveauPreuve('profil_verifie'); setSelectedDocs([]); setJustification(''); setComplementMotif(''); setPending(null)
  }

  async function envoyer(typeDecision: TypeDecision) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/institutions/${dossier.institution.id}/verification/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          axe, type_decision: typeDecision,
          niveau_preuve: typeDecision === 'accordee' ? niveauPreuve : null,
          justification,
          complement_demande_motif: typeDecision === 'complement_demande' ? complementMotif : null,
          derniere_decision_vue_id: actuelle?.id ?? null,
          document_institution_ids: typeDecision === 'rejetee' ? null : selectedDocs,
        }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast(`Décision enregistrée — axe ${AXE_LABEL[axe]}`)
        resetForm()
        onDecided()
      } else if (body?.code === 'CONFLIT_CONCURRENCE') {
        toast('Le dossier a changé depuis son ouverture — une autre décision a déjà été prise. Rechargement du dossier…', 'error')
        resetForm()
        onDecided()
      } else if (body?.code === 'PREUVE_PERIMEE') {
        toast('Une preuve sélectionnée a été remplacée pendant l’examen — rechargement du dossier.', 'error')
        resetForm()
        onDecided()
      } else {
        toast(body?.error || 'Erreur — décision non enregistrée', 'error')
        setPending(null)
      }
    } catch {
      toast('Erreur réseau — décision non enregistrée', 'error')
      setPending(null)
    } finally { setSubmitting(false) }
  }

  const peutValider = selectedDocs.length > 0 && justification.trim().length > 0
  const peutDemanderComplement = complementMotif.trim().length > 0 && justification.trim().length > 0
  const peutRejeter = justification.trim().length > 0
  const estPerimee = !!actuelle?.expire_le && new Date(actuelle.expire_le).getTime() < Date.now()

  return (
    <div style={{ padding: '14px', backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: D.text }}>Axe {AXE_LABEL[axe]}</p>
        {actuelle ? (
          <Badge label={TYPE_DECISION_LABEL[actuelle.type_decision].label} color={TYPE_DECISION_LABEL[actuelle.type_decision].color} bg={TYPE_DECISION_LABEL[actuelle.type_decision].bg} />
        ) : (
          <Badge label="Jamais examiné" color={D.textMuted} bg={D.surface3} />
        )}
      </div>

      {actuelle && (
        <div style={{ fontSize: '11.5px', color: D.textSub, lineHeight: 1.6 }}>
          {NIVEAU_PREUVE_LABEL[actuelle.niveau_preuve || ''] || TYPE_DECISION_LABEL[actuelle.type_decision].label} par <strong style={{ color: D.text }}>{actuelle.examinateur_nom}</strong> le {new Date(actuelle.decide_le).toLocaleString('fr-FR')}
          {actuelle.justification && <> — « {actuelle.justification} »</>}
          {estPerimee && <span style={{ color: D.orange, fontWeight: '700' }}> · Périmée depuis le {new Date(actuelle.expire_le!).toLocaleDateString('fr-FR')}</span>}
        </div>
      )}

      {historique.length > 0 && (
        <button onClick={() => setShowHistorique(s => !s)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: D.blue, fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: 0 }}>
          {showHistorique ? 'Masquer' : 'Voir'} l&apos;historique complet ({historique.length} décision{historique.length > 1 ? 's' : ''})
        </button>
      )}
      {showHistorique && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {historique.map(d => (
            <div key={d.id} style={{ fontSize: '11px', color: D.textMuted, padding: '6px 8px', backgroundColor: D.surface, borderRadius: '6px', border: `1px solid ${D.border}` }}>
              <span style={{ color: D.text, fontWeight: '600' }}>{d.decision_id}</span> — {TYPE_DECISION_LABEL[d.type_decision].label} par {d.examinateur_nom} le {new Date(d.decide_le).toLocaleString('fr-FR')}
              {d.preuves.length > 0 && <div style={{ marginTop: '2px' }}>Preuves : {d.preuves.map(p => `${p.type_snapshot} v${p.numero_version_snapshot} (${p.statut_snapshot})`).join(', ')}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Formulaire de décision ── */}
      {!pending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: '11px', color: D.textMuted }}>Preuves actives examinées pour cet axe</p>
            {documentsActifs.length === 0 ? (
              <EmptyNote text="Aucune preuve active — impossible de vérifier cet axe pour le moment." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {documentsActifs.map(d => (
                  <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: D.textSub, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={e => setSelectedDocs(prev => e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id))} />
                    {d.type} — version {d.numero_version} ({d.statut})
                  </label>
                ))}
              </div>
            )}
          </div>

          <select value={niveauPreuve} onChange={e => setNiveauPreuve(e.target.value)} style={{ padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface, color: D.text, fontSize: '12.5px' }}>
            <option value="profil_verifie">Identité vérifiée</option>
            <option value="institution_certifiee">Identité vérifiée — preuve renforcée</option>
          </select>

          <textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} placeholder="Justification (obligatoire, conservée de façon permanente)…" style={{ padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', resize: 'none' }} />

          <textarea value={complementMotif} onChange={e => setComplementMotif(e.target.value)} rows={2} placeholder="Motif du complément demandé (si applicable)…" style={{ padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', resize: 'none' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button disabled={!peutValider} onClick={() => setPending('accordee')} style={{ padding: '10px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12.5px', fontWeight: '700', cursor: peutValider ? 'pointer' : 'default', opacity: peutValider ? 1 : 0.45 }}>Vérifier l&apos;axe {AXE_LABEL[axe]}</button>
            <button disabled={!peutDemanderComplement} onClick={() => setPending('complement_demande')} style={{ padding: '10px', backgroundColor: D.orangeDim, border: `1px solid ${D.orangeBrd}`, borderRadius: D.radiusSm, color: D.orange, fontSize: '12.5px', fontWeight: '700', cursor: peutDemanderComplement ? 'pointer' : 'default', opacity: peutDemanderComplement ? 1 : 0.45 }}>Demander un complément</button>
            <button disabled={!peutRejeter} onClick={() => setPending('rejetee')} style={{ padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: peutRejeter ? 'pointer' : 'default', opacity: peutRejeter ? 1 : 0.45 }}>Refuser la vérification de l&apos;axe {AXE_LABEL[axe]}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', backgroundColor: D.surface, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm }}>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: D.text }}>Confirmer l&apos;enregistrement de cette décision</p>
          <div style={{ fontSize: '11.5px', color: D.textSub, lineHeight: 1.7 }}>
            <div>Axe : <strong style={{ color: D.text }}>{AXE_LABEL[axe]}</strong></div>
            <div>Décision : <strong style={{ color: D.text }}>{TYPE_DECISION_LABEL[pending].label}</strong></div>
            {pending === 'accordee' && <div>Niveau : <strong style={{ color: D.text }}>{NIVEAU_PREUVE_LABEL[niveauPreuve]}</strong></div>}
            {pending !== 'rejetee' && <div>Preuves : <strong style={{ color: D.text }}>{selectedDocs.length === 0 ? 'aucune' : dossier.documents.filter(d => selectedDocs.includes(d.id)).map(d => `${d.type} v${d.numero_version}`).join(', ')}</strong></div>}
            {pending === 'complement_demande' && <div>Motif du complément : <strong style={{ color: D.text }}>{complementMotif}</strong></div>}
            <div>Justification : <strong style={{ color: D.text }}>{justification}</strong></div>
          </div>
          <p style={{ margin: 0, fontSize: '10.5px', color: D.orange, fontWeight: '600' }}>
            Cette justification sera transmise telle quelle à l&apos;institution par notification — n&apos;y écrivez rien qui doive rester strictement interne.
          </p>
          <p style={{ margin: 0, fontSize: '10.5px', color: D.textMuted, fontStyle: 'italic' }}>
            Cette décision sera enregistrée de façon permanente et ne pourra jamais être modifiée — seule une nouvelle décision pourra la remplacer.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button disabled={submitting} onClick={() => envoyer(pending)} style={{ flex: 1, padding: '10px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12.5px', fontWeight: '700', cursor: submitting ? 'default' : 'pointer' }}>{submitting ? 'Envoi…' : 'Confirmer l’envoi'}</button>
            <button disabled={submitting} onClick={() => setPending(null)} style={{ flex: 1, padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}
