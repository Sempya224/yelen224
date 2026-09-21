'use client'

// Écran de gestion de la taxonomie des activités (chantier Taxonomie des
// activités, 20/08/2026, docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md
// §12/§19). Deux vues : Activités (renommer/désactiver/ajuster le statut
// réglementaire d'une activité existante, jamais la catégorie/le code —
// renommage contrôlé) et Demandes ("Autre activité", spec §11 — valider
// crée une nouvelle activité officielle, rattacher lie à une activité
// existante, refuser). Patron UI répliqué de app/admin/verification/page.tsx
// (AxeSection) — même kit (DataTable/SlidePanel/Badge/ToastContainer/
// YelenLoader), aucun nouveau système visuel. Toute écriture passe par
// les RPC modifier_activite/decider_demande_activite (jamais un
// update/insert direct) — voir supabase/migrations/20260821000003 et
// .../20260821000007.
import { useCallback, useEffect, useState } from 'react'
import { D } from '@/app/admin/adminTheme'
import { Badge, DataTable, SlidePanel, ToastContainer } from '@/app/admin/adminUiKit'
import type { ToastItem } from '@/app/admin/adminTypes'
import { YelenLoader } from '@/components/YelenLoader'

type Categorie = { id: string; code: string; label: string; ordre: number }
type Activite = {
  id: string; categorie_id: string; code: string; label: string; description: string | null
  alias: string[]; ordre: number; statut: 'active' | 'desactivee'
  regulatory_status: string; regulatory_source: string | null; cree_le: string
}
type Demande = {
  id: string; institution_id: string; institution_name: string | null; categorie_id: string
  libelle_propose: string; description: string; statut: string; cree_le: string
}

const REGULATORY_LABEL: Record<string, string> = {
  non_regulated: 'Non réglementé', regulated: 'Réglementé', license_required: 'Licence requise',
  accreditation_required: 'Agrément requis', professional_order: 'Ordre professionnel', verification_required: 'Vérification requise',
}
const REGULATORY_OPTIONS = Object.keys(REGULATORY_LABEL)

function SectionLabel({ text }: { text: string }) {
  return <p style={{ margin: '0 0 8px', fontSize: '11px', color: D.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{text}</p>
}

export default function ActivitesPage() {
  const [tab, setTab] = useState<'activites' | 'demandes'>('activites')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])

  return (
    <div>
      <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: D.text, letterSpacing: '-0.5px' }}>Activités</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: D.textMuted }}>
          Taxonomie catégorie → activité des établissements — gestion du référentiel et file &quot;Autre activité&quot;.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: `1px solid ${D.border}` }}>
        {(['activites', 'demandes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === t ? D.yellow : 'transparent'}`,
            color: tab === t ? D.text : D.textMuted, fontSize: '12.5px', fontWeight: '700',
          }}>{t === 'activites' ? 'Activités' : 'Demandes "Autre activité"'}</button>
        ))}
      </div>

      {tab === 'activites' ? <ActivitesTab toast={toast} /> : <DemandesTab toast={toast} />}
    </div>
  )
}

function ActivitesTab({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
  const [activites, setActivites] = useState<Activite[]>([])
  const [categories, setCategories] = useState<Categorie[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Activite | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/activites')
      if (res.ok) {
        const body = await res.json()
        setActivites(body.activites ?? [])
        setCategories(body.categories ?? [])
      }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const labelCategorie = (id: string) => categories.find(c => c.id === id)?.label ?? '—'

  return (
    <div>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24} /></div>
        ) : activites.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucune activité</div>
        ) : (
          <DataTable
            cols={[
              { key: 'label', label: 'Activité', width: '30%' },
              { key: 'categorie', label: 'Catégorie', width: '24%' },
              { key: 'statut', label: 'Statut', width: '14%' },
              { key: 'reglementaire', label: 'Statut réglementaire', width: '22%' },
              { key: 'alias', label: 'Alias', width: '10%' },
            ]}
            onRowClick={row => setSelected(activites.find(a => a.id === row.id) ?? null)}
            rows={activites.map(a => ({
              id: a.id as unknown as React.ReactNode,
              label: <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{a.label}</span>,
              categorie: <span style={{ color: D.textSub, fontSize: '12px' }}>{labelCategorie(a.categorie_id)}</span>,
              statut: <Badge label={a.statut === 'active' ? 'Active' : 'Désactivée'} color={a.statut === 'active' ? D.green : D.textMuted} bg={a.statut === 'active' ? D.greenDim : D.surface3} />,
              reglementaire: <span style={{ color: D.textMuted, fontSize: '11px' }}>{REGULATORY_LABEL[a.regulatory_status] ?? a.regulatory_status}</span>,
              alias: <span style={{ color: D.textMuted, fontSize: '11px' }}>{a.alias.length}</span>,
            }))}
          />
        )}
      </div>

      <SlidePanel open={!!selected} onClose={() => setSelected(null)} title="Modifier l'activité" width="480px">
        {selected && (
          <ActiviteEditForm
            activite={selected}
            categorieLabel={labelCategorie(selected.categorie_id)}
            toast={toast}
            onSaved={() => { setSelected(null); load() }}
          />
        )}
      </SlidePanel>
    </div>
  )
}

function ActiviteEditForm({ activite, categorieLabel, toast, onSaved }: {
  activite: Activite; categorieLabel: string
  toast: (m: string, t?: ToastItem['type']) => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState(activite.label)
  const [description, setDescription] = useState(activite.description ?? '')
  const [statut, setStatut] = useState(activite.statut)
  const [regulatoryStatus, setRegulatoryStatus] = useState(activite.regulatory_status)
  const [regulatorySource, setRegulatorySource] = useState(activite.regulatory_source ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/activites/${activite.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label, description: description.trim() || null, statut,
          regulatory_status: regulatoryStatus, regulatory_source: regulatorySource.trim() || null,
        }),
      })
      if (res.ok) { toast('Activité mise à jour'); onSaved() }
      else { const body = await res.json().catch(() => null); toast(body?.error || 'Erreur — non enregistré', 'error') }
    } catch {
      toast('Erreur réseau', 'error')
    } finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface2, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', width: '100%' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <SectionLabel text="Catégorie (non modifiable ici)" />
        <p style={{ margin: 0, fontSize: '12.5px', color: D.textSub }}>{categorieLabel}</p>
      </div>
      <div>
        <SectionLabel text="Code (non modifiable)" />
        <p style={{ margin: 0, fontSize: '11.5px', color: D.textMuted, fontFamily: 'monospace' }}>{activite.code}</p>
      </div>
      <div>
        <SectionLabel text="Libellé" />
        <input value={label} onChange={e => setLabel(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <SectionLabel text="Description" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'none' }} />
      </div>
      <div>
        <SectionLabel text="Statut" />
        <select value={statut} onChange={e => setStatut(e.target.value as 'active' | 'desactivee')} style={inputStyle}>
          <option value="active">Active</option>
          <option value="desactivee">Désactivée</option>
        </select>
      </div>
      <div>
        <SectionLabel text="Statut réglementaire" />
        <select value={regulatoryStatus} onChange={e => setRegulatoryStatus(e.target.value)} style={inputStyle}>
          {REGULATORY_OPTIONS.map(o => <option key={o} value={o}>{REGULATORY_LABEL[o]}</option>)}
        </select>
      </div>
      <div>
        <SectionLabel text="Source (loi/décret/régulateur — laisser vide si non réglementé)" />
        <textarea value={regulatorySource} onChange={e => setRegulatorySource(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
      </div>
      <button disabled={saving || label.trim().length === 0} onClick={save} style={{ padding: '10px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12.5px', fontWeight: '700', cursor: saving ? 'default' : 'pointer', opacity: label.trim().length === 0 ? 0.45 : 1 }}>
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      <p style={{ margin: 0, fontSize: '10.5px', color: D.textMuted, fontStyle: 'italic' }}>
        Chaque modification est tracée (auteur, ancienne/nouvelle valeur) de façon permanente.
      </p>
    </div>
  )
}

function DemandesTab({ toast }: { toast: (m: string, t?: ToastItem['type']) => void }) {
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Demande | null>(null)
  const [categories, setCategories] = useState<Categorie[]>([])
  const [activites, setActivites] = useState<Activite[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [resDemandes, resActivites] = await Promise.all([
        fetch('/api/admin/activite-demandes?statut=a_examiner'),
        fetch('/api/admin/activites'),
      ])
      if (resDemandes.ok) setDemandes(await resDemandes.json())
      if (resActivites.ok) {
        const body = await resActivites.json()
        setActivites(body.activites ?? [])
        setCategories(body.categories ?? [])
      }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const labelCategorie = (id: string) => categories.find(c => c.id === id)?.label ?? '—'

  return (
    <div>
      <div style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><YelenLoader size={24} /></div>
        ) : demandes.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: D.textMuted, fontSize: '13px' }}>Aucune demande à examiner</div>
        ) : (
          <DataTable
            cols={[
              { key: 'institution', label: 'Établissement', width: '26%' },
              { key: 'libelle', label: 'Activité proposée', width: '26%' },
              { key: 'categorie', label: 'Catégorie', width: '24%' },
              { key: 'date', label: 'Soumise le', width: '14%' },
            ]}
            onRowClick={row => setSelected(demandes.find(d => d.id === row.id) ?? null)}
            rows={demandes.map(d => ({
              id: d.id as unknown as React.ReactNode,
              institution: <span style={{ fontWeight: '600', color: D.text, fontSize: '12px' }}>{d.institution_name ?? '—'}</span>,
              libelle: <span style={{ color: D.textSub, fontSize: '12px' }}>{d.libelle_propose}</span>,
              categorie: <span style={{ color: D.textMuted, fontSize: '11px' }}>{labelCategorie(d.categorie_id)}</span>,
              date: <span style={{ color: D.textMuted, fontSize: '11px' }}>{new Date(d.cree_le).toLocaleDateString('fr-FR')}</span>,
            }))}
          />
        )}
      </div>

      <SlidePanel open={!!selected} onClose={() => setSelected(null)} title="Demande d'activité" width="560px">
        {selected && (
          <DemandeDecisionForm
            demande={selected}
            categorieLabel={labelCategorie(selected.categorie_id)}
            activitesCategorie={activites.filter(a => a.categorie_id === selected.categorie_id && a.statut === 'active')}
            toast={toast}
            onDecided={() => { setSelected(null); load() }}
          />
        )}
      </SlidePanel>
    </div>
  )
}

// Blocklist serveur déjà en place côté soumission institution (Phase 4) —
// reprise ici en repli d'affichage seulement, la vraie barrière reste
// côté route de soumission, pas cet écran de décision.
function DemandeDecisionForm({ demande, categorieLabel, activitesCategorie, toast, onDecided }: {
  demande: Demande; categorieLabel: string; activitesCategorie: Activite[]
  toast: (m: string, t?: ToastItem['type']) => void
  onDecided: () => void
}) {
  const [action, setAction] = useState<'validee' | 'rattachee' | 'refusee' | null>(null)
  const [note, setNote] = useState('')
  const [activiteExistanteId, setActiviteExistanteId] = useState('')
  const [nouveauCode, setNouveauCode] = useState('')
  const [nouveauLabel, setNouveauLabel] = useState(demande.libelle_propose)
  const [nouvelleDescription, setNouvelleDescription] = useState(demande.description)
  const [submitting, setSubmitting] = useState(false)

  const inputStyle: React.CSSProperties = { padding: '9px 10px', borderRadius: D.radiusSm, border: `1px solid ${D.border}`, backgroundColor: D.surface2, color: D.text, fontSize: '12.5px', fontFamily: 'inherit', width: '100%' }

  async function envoyer() {
    if (!action) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/activite-demandes/${demande.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: action, note, statut_vu: demande.statut,
          activite_existante_id: action === 'rattachee' ? activiteExistanteId : null,
          nouvelle_categorie_id: action === 'validee' ? demande.categorie_id : null,
          nouvelle_code: action === 'validee' ? nouveauCode : null,
          nouveau_label: action === 'validee' ? nouveauLabel : null,
          nouvelle_description: action === 'validee' ? nouvelleDescription : null,
        }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) { toast('Décision enregistrée'); onDecided() }
      else if (body?.code === 'CONFLIT_CONCURRENCE') { toast('Cette demande a déjà été traitée entretemps — rechargement.', 'error'); onDecided() }
      else { toast(body?.error || 'Erreur — décision non enregistrée', 'error') }
    } catch {
      toast('Erreur réseau', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ backgroundColor: D.surface2, borderRadius: D.radiusSm, border: `1px solid ${D.border}`, padding: '12px' }}>
        <p style={{ margin: '0 0 4px', fontSize: '11px', color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Établissement</p>
        <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: '700', color: D.text }}>{demande.institution_name ?? '—'}</p>
        <p style={{ margin: '0 0 4px', fontSize: '11px', color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Catégorie</p>
        <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: D.textSub }}>{categorieLabel}</p>
        <p style={{ margin: '0 0 4px', fontSize: '11px', color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activité proposée</p>
        <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: '700', color: D.text }}>{demande.libelle_propose}</p>
        <p style={{ margin: '0 0 4px', fontSize: '11px', color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description fournie</p>
        <p style={{ margin: 0, fontSize: '12.5px', color: D.textSub, lineHeight: 1.6 }}>{demande.description}</p>
      </div>

      {!action ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button onClick={() => setAction('validee')} style={{ padding: '10px', backgroundColor: D.greenDim, border: `1px solid ${D.greenBrd}`, borderRadius: D.radiusSm, color: D.green, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Créer une nouvelle activité officielle</button>
          <button onClick={() => setAction('rattachee')} style={{ padding: '10px', backgroundColor: D.blueDim, border: `1px solid ${D.blueBrd}`, borderRadius: D.radiusSm, color: D.blue, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Rattacher à une activité existante</button>
          <button onClick={() => setAction('refusee')} style={{ padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>Refuser</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {action === 'validee' && (
            <>
              <div>
                <SectionLabel text="Code (snake_case, unique)" />
                <input value={nouveauCode} onChange={e => setNouveauCode(e.target.value)} placeholder="ex. fournisseur_solutions_x" style={inputStyle} />
              </div>
              <div>
                <SectionLabel text="Libellé officiel" />
                <input value={nouveauLabel} onChange={e => setNouveauLabel(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <SectionLabel text="Description" />
                <textarea value={nouvelleDescription} onChange={e => setNouvelleDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
              </div>
            </>
          )}
          {action === 'rattachee' && (
            <div>
              <SectionLabel text="Activité existante de cette catégorie" />
              <select value={activiteExistanteId} onChange={e => setActiviteExistanteId(e.target.value)} style={inputStyle}>
                <option value="">— Sélectionner —</option>
                {activitesCategorie.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <SectionLabel text="Note (obligatoire, conservée de façon permanente)" />
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={submitting || note.trim().length === 0 || (action === 'validee' && (!nouveauCode.trim() || !nouveauLabel.trim())) || (action === 'rattachee' && !activiteExistanteId)}
              onClick={envoyer}
              style={{ flex: 1, padding: '10px', backgroundColor: D.yellowDim, border: `1px solid ${D.yellowBrd}`, borderRadius: D.radiusSm, color: D.yellow, fontSize: '12.5px', fontWeight: '700', cursor: submitting ? 'default' : 'pointer' }}
            >{submitting ? 'Envoi…' : 'Confirmer'}</button>
            <button disabled={submitting} onClick={() => setAction(null)} style={{ flex: 1, padding: '10px', backgroundColor: D.surface3, border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.textSub, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>Retour</button>
          </div>
        </div>
      )}
    </div>
  )
}
