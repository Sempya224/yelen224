"use client";

// Projets de l'espace de travail — V3 "couche de coordination" (refonte
// CEO, 20/09/2026, audit complet en amont — voir échange avec Bryan).
// Réutilise le modèle existant (projets, statuts réels a_venir/en_cours/
// termine/bloque) + les ajouts validés le 20/09/2026 : priorite/sante sur
// projets, projet_id sur taches/documents_travail (liaison réelle, "même
// donnée deux contextes"), table projet_milestones (nouvelle).
//
// Dépendances (taches, dépendances entre projets, item 7 du brief) :
// aucun modèle backend n'existe — non inventées, non construites. La
// progression déjà dérivée des vraies tâches liées (computeProgress) et le
// projet_id partagé forment la base sur laquelle un futur chantier data
// pourrait brancher un vrai système de dépendances sans tout refaire.
//
// Même discipline que Agenda/Tâches/Documents V3 : détails avant édition
// (Project Overview, pas un formulaire), suppression avec confirmation
// dédiée, garde "modifications non enregistrées", PC-first sans logique
// mobile, persistance recherche/filtres/tri/vue/projet ouvert.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { type Tache } from "./TachesOverlays";
import { type DocumentTravail } from "./DocumentsOverlays";
import {
  type Projet, type Membre, STATUTS_PROJET, PRIORITES_PROJET,
  statutColor, prioriteColor, prioriteLabel,
  nomMembre, peutGerer, computeProgress,
  ProjectQuickDrawer,
} from "./ProjetsOverlays";
import { useDialogA11y } from "./AgendaOverlays";
import { ProjectOverview } from "./ProjectOverview";
import { ProjetsStyles, ProjectCardView, ProjectsSkeleton, StatutBadge, PrioriteBadge, ResponsableLabel, CibleLabel, ProgressBar, type ProjetAction } from "./ProjetsUi";
import { TasksToolbar, TasksMessage } from "./TachesUi";
import { ClockStyles, ClockModal, ModalField, champStyle, ComboField, DateField, RowActionsMenu } from "../../components/ClockInShiftUi";

type TabKey = "toutes" | "mes" | "a_venir" | "en_cours" | "bloque" | "termine";
type SortKey = "echeance" | "progression" | "nom" | "recent";
type ViewKey = "cartes" | "liste" | "kanban" | "timeline";
type EcheanceBucket = "retard" | "semaine" | "mois" | "sans" | null;
type Filters = { responsables: string[]; priorites: string[]; creePar: string[]; echeance: EcheanceBucket };
const EMPTY_FILTERS: Filters = { responsables: [], priorites: [], creePar: [], echeance: null };

const TABS: { value: TabKey; label: string }[] = [
  { value: "toutes", label: "Tous" },
  { value: "mes", label: "Mes projets" },
  { value: "a_venir", label: "À venir" },
  { value: "en_cours", label: "En cours" },
  { value: "bloque", label: "Bloqués" },
  { value: "termine", label: "Terminés" },
];

const SORTS: { value: SortKey; label: string }[] = [{ value: "echeance", label: "Échéance" }, { value: "progression", label: "Progression" }, { value: "nom", label: "Nom" }, { value: "recent", label: "Dernière modification" }];
const ICO = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const VUES: { key: ViewKey; label: string; icone: React.ReactNode }[] = [
  { key: "cartes", label: "Cartes", icone: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICO}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { key: "liste", label: "Liste", icone: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICO}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg> },
  { key: "kanban", label: "Kanban", icone: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICO}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/></svg> },
  { key: "timeline", label: "Timeline", icone: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICO}><line x1="3" y1="6" x2="14" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="5" y1="18" x2="16" y2="18"/></svg> },
];

function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }
function toggleArr(arr: string[], v: string): string[] { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

function matchesTab(p: Projet, tab: TabKey, moiId: string | null): boolean {
  if (tab === "mes") return p.responsable_membre_id === moiId || p.cree_par_membre_id === moiId;
  if (tab === "a_venir" || tab === "en_cours" || tab === "bloque" || tab === "termine") return p.statut === tab;
  return true;
}

function matchesFilters(p: Projet, f: Filters): boolean {
  if (f.responsables.length > 0 && !(p.responsable_membre_id && f.responsables.includes(p.responsable_membre_id))) return false;
  if (f.priorites.length > 0 && !f.priorites.includes(p.priorite)) return false;
  if (f.creePar.length > 0 && !(p.cree_par_membre_id && f.creePar.includes(p.cree_par_membre_id))) return false;
  if (f.echeance) {
    if (!p.date_fin_prevue) return f.echeance === "sans";
    const today = toISODate(new Date());
    if (f.echeance === "sans") return false;
    if (f.echeance === "retard") return p.date_fin_prevue < today && p.statut !== "termine";
    const d = new Date(`${p.date_fin_prevue}T00:00:00`);
    const diff = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
    if (f.echeance === "semaine") return diff >= 0 && diff < 7;
    if (f.echeance === "mois") return diff >= 0 && diff < 31;
  }
  return true;
}

function matchesSearch(p: Projet, q: string, membres: Membre[]): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const resp = nomMembre(p.responsable_membre_id, membres) || "";
  return p.nom.toLowerCase().includes(needle) || (p.description || "").toLowerCase().includes(needle) || resp.toLowerCase().includes(needle);
}

type FormValues = { nom: string; description: string; responsable_membre_id: string; date_debut: string; date_fin_prevue: string; statut: string; priorite: string };
type FormState = { mode: "create" | "edit"; id?: string; values: FormValues; initial: string };
function snapshotValues(v: FormValues): string { return JSON.stringify(v); }

export function ProjetsSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [projets, setProjets] = useState<Projet[]>([]);
  const [allTaches, setAllTaches] = useState<Tache[]>([]);
  const [allDocuments, setAllDocuments] = useState<DocumentTravail[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("toutes");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("echeance");
  const [view, setView] = useState<ViewKey>("cartes");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [quickDrawerId, setQuickDrawerId] = useState<string | null>(null);
  const [quickDrawerMilestoneCount, setQuickDrawerMilestoneCount] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formStep, setFormStep] = useState<"form" | "unsaved">("form");
  const [deleteTarget, setDeleteTarget] = useState<Projet | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const storageKey = `yelen224_projets_state_${instId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { search?: string; tab?: TabKey; filters?: Filters; sortKey?: SortKey; view?: ViewKey; openProjectId?: string | null };
      if (typeof saved.search === "string") setSearch(saved.search);
      if (saved.tab) setTab(saved.tab);
      if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters });
      if (saved.sortKey) setSortKey(saved.sortKey);
      if (saved.view) setView(saved.view);
      if (saved.openProjectId) setOpenProjectId(saved.openProjectId);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ search, tab, filters, sortKey, view, openProjectId })); } catch {}
  }, [search, tab, filters, sortKey, view, openProjectId, storageKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [pRes, tRes, dRes] = await Promise.all([
      fetch("/api/institution/projets"),
      fetch("/api/institution/taches"),
      fetch("/api/institution/documents-travail"),
    ]);
    if (!pRes.ok) { setLoadError(true); setProjets([]); setAllTaches([]); setAllDocuments([]); setLoading(false); return; }
    const pJ = await pRes.json().catch(() => null);
    const tJ = tRes.ok ? await tRes.json().catch(() => null) : null;
    const dJ = dRes.ok ? await dRes.json().catch(() => null) : null;
    setProjets(pJ?.projets ?? []);
    setAllTaches(tJ?.taches ?? []);
    setAllDocuments(dJ?.documents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, instId]);

  // Nombre de milestones du tiroir rapide — chargé uniquement à
  // l'ouverture (un seul projet à la fois), pas au chargement de la liste
  // entière (item 14 : pas de requête massive inutile ; l'API milestones
  // n'expose de toute façon qu'un GET par projet, pas un total agrégé).
  useEffect(() => {
    if (!quickDrawerId) { setQuickDrawerMilestoneCount(null); return; }
    let cancelled = false;
    fetch(`/api/institution/projets/milestones?projet_id=${quickDrawerId}`).then(res => res.ok ? res.json() : null).then(j => {
      if (!cancelled) setQuickDrawerMilestoneCount(j?.milestones?.length ?? 0);
    });
    return () => { cancelled = true; };
  }, [quickDrawerId]);

  useEffect(() => {
    fetch("/api/institution/membres").then(res => res.ok ? res.json() : null).then(j => {
      if (!j) return;
      setMembres(j.membres ?? []);
      setMoiId(j.membreId ?? null);
      setMoiRole(j.role ?? null);
    });
  }, [instId]);

  const tachesByProjet = useMemo(() => {
    const map = new Map<string, Tache[]>();
    for (const t of allTaches) {
      if (!t.projet_id) continue;
      const arr = map.get(t.projet_id) ?? [];
      arr.push(t);
      map.set(t.projet_id, arr);
    }
    return map;
  }, [allTaches]);

  const documentsByProjet = useMemo(() => {
    const map = new Map<string, DocumentTravail[]>();
    for (const d of allDocuments) {
      if (!d.projet_id) continue;
      const arr = map.get(d.projet_id) ?? [];
      arr.push(d);
      map.set(d.projet_id, arr);
    }
    return map;
  }, [allDocuments]);

  const filtered = useMemo(() => {
    const list = projets
      .filter(p => matchesTab(p, tab, moiId))
      .filter(p => matchesFilters(p, filters))
      .filter(p => matchesSearch(p, search, membres));
    return list.slice().sort((a, b) => {
      if (sortKey === "nom") return a.nom.localeCompare(b.nom, "fr");
      if (sortKey === "progression") return computeProgress(tachesByProjet.get(b.id) ?? []).pct - computeProgress(tachesByProjet.get(a.id) ?? []).pct;
      if (sortKey === "recent") return (b.updated_at || "").localeCompare(a.updated_at || "");
      if (!a.date_fin_prevue && !b.date_fin_prevue) return 0;
      if (!a.date_fin_prevue) return 1;
      if (!b.date_fin_prevue) return -1;
      return a.date_fin_prevue.localeCompare(b.date_fin_prevue);
    });
  }, [projets, tab, filters, search, membres, sortKey, tachesByProjet]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    filters.responsables.forEach(id => { const n = nomMembre(id, membres); if (n) chips.push({ key: `r-${id}`, label: n, onRemove: () => setFilters(f => ({ ...f, responsables: f.responsables.filter(x => x !== id) })) }); });
    filters.priorites.forEach(p => chips.push({ key: `p-${p}`, label: prioriteLabel(p), onRemove: () => setFilters(f => ({ ...f, priorites: f.priorites.filter(x => x !== p) })) }));
    filters.creePar.forEach(id => { const n = nomMembre(id, membres); if (n) chips.push({ key: `c-${id}`, label: `Créé par ${n}`, onRemove: () => setFilters(f => ({ ...f, creePar: f.creePar.filter(x => x !== id) })) }); });
    if (filters.echeance) {
      const labels: Record<string, string> = { retard: "En retard", semaine: "Cette semaine", mois: "Ce mois", sans: "Sans échéance" };
      chips.push({ key: "ech", label: labels[filters.echeance], onRemove: () => setFilters(f => ({ ...f, echeance: null })) });
    }
    return chips;
  }, [filters, membres]);

  function resetFilters() { setFilters(EMPTY_FILTERS); setSearch(""); setTab("toutes"); }

  function openCreateForm() {
    const values: FormValues = { nom: "", description: "", responsable_membre_id: "", date_debut: "", date_fin_prevue: "", statut: "a_venir", priorite: "normale" };
    setForm({ mode: "create", values, initial: snapshotValues(values) });
    setFormStep("form");
  }
  function openEditForm(p: Projet) {
    const values: FormValues = { nom: p.nom, description: p.description || "", responsable_membre_id: p.responsable_membre_id || "", date_debut: p.date_debut || "", date_fin_prevue: p.date_fin_prevue || "", statut: p.statut, priorite: p.priorite };
    setForm({ mode: "edit", id: p.id, values, initial: snapshotValues(values) });
    setFormStep("form");
  }
  function updateFormValues(patch: Partial<FormValues>) { setForm(f => f ? { ...f, values: { ...f.values, ...patch } } : f); }
  function requestCloseForm() {
    if (form && snapshotValues(form.values) !== form.initial) { setFormStep("unsaved"); return; }
    setForm(null);
  }
  function discardForm() { setForm(null); setFormStep("form"); }

  async function performSave(f: FormState) {
    setSaving(true);
    const isEdit = f.mode === "edit";
    const body = { nom: f.values.nom.trim(), description: f.values.description || null, responsable_membre_id: f.values.responsable_membre_id || null, date_debut: f.values.date_debut || null, date_fin_prevue: f.values.date_fin_prevue || null, priorite: f.values.priorite, ...(isEdit ? { statut: f.values.statut } : {}) };
    const res = isEdit
      ? await fetch("/api/institution/projets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id, ...body }) })
      : await fetch("/api/institution/projets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
    const j = await res.json().catch(() => null);
    setForm(null); setFormStep("form");
    onToast(isEdit ? "Projet modifié" : "Projet créé", C.green);
    await load();
    // Le projet ne doit pas "mourir" dans un formulaire après sa création
    // (item 15 du brief) — ouverture directe du Project Overview.
    if (!isEdit && j?.id) setOpenProjectId(j.id);
  }

  function requestDelete(p: Projet) { setQuickDrawerId(null); setDeleteTarget(p); }
  async function confirmDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/institution/projets?id=${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    if (openProjectId === deleteTarget.id) setOpenProjectId(null);
    onToast("Projet supprimé", C.orange);
    load();
  }

  async function changerStatut(id: string, statut: string) {
    setProjets(prev => prev.map(p => p.id === id ? { ...p, statut } : p));
    const res = await fetch("/api/institution/projets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, statut }) });
    if (!res.ok) { onToast("Erreur — statut non enregistré", C.red); load(); }
  }

  const isTrueEmpty = !loading && !loadError && projets.length === 0;
  const isNoResults = !loading && !loadError && projets.length > 0 && filtered.length === 0;

  // Project Overview — remplace toute la liste (navigation locale "← Projets").
  if (openProjectId) {
    const projet = projets.find(p => p.id === openProjectId);
    if (projet) {
      return (
        <ProjectOverview
          projet={projet} membres={membres} moiId={moiId} moiRole={moiRole}
          onBack={() => setOpenProjectId(null)}
          onToast={onToast}
          onProjetChange={load}
          onEdit={() => openEditForm(projet)}
          onDeleteRequest={() => requestDelete(projet)}
          C={C}
        />
      );
    }
  }

  const actionsDe = (p: Projet): ProjetAction[] => [
    { label: "Aperçu rapide", onClick: () => setQuickDrawerId(p.id) },
    { label: "Ouvrir le projet", onClick: () => setOpenProjectId(p.id) },
    ...(peutGerer(p, moiId, moiRole) ? [{ label: "Modifier", onClick: () => openEditForm(p) }, { label: "Supprimer", onClick: () => requestDelete(p), danger: true }] : []),
  ];
  const tabsDef = TABS.map(t => ({ key: t.value, label: t.label, count: projets.filter(p => matchesTab(p, t.value, moiId)).length, alerte: t.value === "bloque" }));
  const aFiltre = activeFilterChips.length > 0 || search.trim() !== "" || tab !== "toutes";

  return (
    <div>
      <ClockStyles C={C}/>
      <ProjetsStyles C={C}/>
      <TasksToolbar C={C} unite="projet" nouveauLabel="Nouveau projet" tabs={tabsDef} tab={tab} onTab={k => { const t = TABS.find(x => x.value === k); if (t) setTab(t.value); }} onNew={openCreateForm}
        search={search} onSearch={setSearch}
        filtersRef={filtersBtnRef} filtersCount={activeFilterChips.length} onFilters={() => setFiltersOpen(v => !v)}
        sortRef={sortBtnRef} sortLabel={SORTS.find(o => o.value === sortKey)?.label ?? ""} onSort={() => setSortOpen(v => !v)}
        view={view} onView={setView} vues={VUES} chips={activeFilterChips} onReset={resetFilters} aFiltre={aFiltre} total={filtered.length}/>

      {loadError && !loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px" }}>
          <span role="alert" style={{ fontSize: "13px", fontWeight: 500, color: C.red }}>Impossible de charger les projets.</span>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={load}>Réessayer</Button>
        </div>
      )}

      {loading ? (
        <ProjectsSkeleton/>
      ) : isTrueEmpty ? (
        <TasksMessage C={C} titre="Aucun projet" texte="Les projets permettent de regrouper objectifs, tâches, documents et échéances au même endroit."
          icone={<svg width="28" height="28" viewBox="0 0 24 24" {...ICO}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>}
          action={{ label: "+ Nouveau projet", onClick: openCreateForm, primaire: true }}/>
      ) : isNoResults ? (
        <TasksMessage C={C} titre="Aucun résultat" texte="Aucun projet ne correspond à ces critères." action={{ label: "Réinitialiser", onClick: resetFilters }}/>
      ) : view === "cartes" ? (
        <div className="prj-grid">
          {filtered.map(p => (
            <ProjectCardView key={p.id} C={C} projet={p} membres={membres} progress={computeProgress(tachesByProjet.get(p.id) ?? [])}
              onOpen={() => setQuickDrawerId(p.id)} actions={actionsDe(p)}/>
          ))}
        </div>
      ) : view === "liste" ? (
        <ProjectTable C={C} projets={filtered} membres={membres} tachesByProjet={tachesByProjet} onOpen={id => setQuickDrawerId(id)} actionsDe={actionsDe}/>
      ) : view === "kanban" ? (
        <ProjectKanban C={C} projets={filtered} membres={membres} moiId={moiId} moiRole={moiRole} tachesByProjet={tachesByProjet}
          onOpen={id => setQuickDrawerId(id)} onChangeStatut={changerStatut} dragOverCol={dragOverCol} setDragOverCol={setDragOverCol}/>
      ) : (
        <ProjectTimeline C={C} projets={filtered} onOpen={id => setQuickDrawerId(id)}/>
      )}

      {filtersOpen && <FiltersPopover C={C} anchorRef={filtersBtnRef} onClose={() => setFiltersOpen(false)} filters={filters} setFilters={setFilters} membres={membres}/>}
      {sortOpen && <SortPopover C={C} anchorRef={sortBtnRef} onClose={() => setSortOpen(false)} value={sortKey} onSelect={setSortKey}/>}

      {quickDrawerId && (() => {
        const p = projets.find(x => x.id === quickDrawerId);
        if (!p) return null;
        const progress = computeProgress(tachesByProjet.get(p.id) ?? []);
        return (
          <ProjectQuickDrawer open={!!quickDrawerId} onClose={() => setQuickDrawerId(null)} projet={p} membres={membres}
            progress={progress} docCount={(documentsByProjet.get(p.id) ?? []).length} milestoneCount={quickDrawerMilestoneCount}
            onOpenFull={() => { setOpenProjectId(p.id); setQuickDrawerId(null); }}
            C={C}/>
        );
      })()}

      {form && formStep === "form" && (
        <ProjectForm C={C} form={form} onChange={updateFormValues} onRequestClose={requestCloseForm} onSave={() => performSave(form)} saving={saving} membres={membres}/>
      )}
      {form && formStep === "unsaved" && (
        <ConfirmModal open onClose={() => setFormStep("form")} onConfirm={discardForm} tokens={toUiTokens(C)} level={1} danger
          title="Modifications non enregistrées ?" description="Vos modifications seront perdues si vous quittez maintenant."
          confirmLabel="Quitter sans enregistrer" cancelLabel="Continuer l'édition"/>
      )}

      {deleteTarget && (
        <ConfirmModal open onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} tokens={toUiTokens(C)} level={1} danger
          title="Supprimer ce projet ?"
          consequences={[`« ${deleteTarget.nom} »`, "Les tâches et documents déjà liés seront détachés, jamais supprimés."]}
          reversible={false}
          confirmLabel="Supprimer" cancelLabel="Annuler"/>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Vue Liste (item 4) — portefeuille en un coup d'œil.
// ─────────────────────────────────────────────────────────────────────────
function ProjectTable({ C, projets, membres, tachesByProjet, onOpen, actionsDe }: {
  C: ThemeTokens; projets: Projet[]; membres: Membre[]; tachesByProjet: Map<string, Tache[]>; onOpen: (id: string) => void; actionsDe: (p: Projet) => ProjetAction[];
}) {
  const th = { color: C.t2, fontSize: "12px", fontWeight: 500 } as const;
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "12px", border: `1px solid ${C.border}`, overflowX: "auto" }}>
      <style>{`.prj-sub{display:none}@media(max-width:1023px){.prj-sub{display:flex}}`}</style>
      <div role="table" aria-label="Projets">
        <div role="row" className="prj-listhead" style={{ height: "40px", borderBottom: `1px solid ${C.border}`, backgroundColor: C.bgCard2 }}>
          <span role="columnheader" style={th}>Projet</span><span role="columnheader" style={th}>Responsable</span><span role="columnheader" style={th}>Priorité</span>
          <span role="columnheader" style={th}>Échéance</span><span role="columnheader" style={th}>Progression</span><span role="columnheader" style={th}>Statut</span>
          <span role="columnheader" style={th}><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Actions</span></span>
        </div>
        {projets.map((p, i) => {
          const progress = computeProgress(tachesByProjet.get(p.id) ?? []);
          return (
            <div key={p.id} role="row" tabIndex={0} onClick={() => onOpen(p.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(p.id); } }}
              className="prj-row tap" style={{ borderBottom: i < projets.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div role="cell" style={{ minWidth: 0 }}>
                <div title={p.nom} style={{ fontSize: "14px", fontWeight: 500, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</div>
                <div className="prj-sub" style={{ alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "6px" }}><StatutBadge C={C} statut={p.statut}/><CibleLabel C={C} projet={p} court/><span style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{progress.pct} %</span></div>
              </div>
              <div role="cell" className="prj-c" style={{ minWidth: 0 }}><ResponsableLabel C={C} projet={p} membres={membres}/></div>
              <div role="cell" className="prj-c"><PrioriteBadge C={C} priorite={p.priorite}/></div>
              <div role="cell" className="prj-c"><CibleLabel C={C} projet={p} court/></div>
              <div role="cell" className="prj-c" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1 }}><ProgressBar C={C} pct={progress.pct} hauteur={5}/></div>
                <span style={{ fontSize: "12px", color: C.t2, fontVariantNumeric: "tabular-nums", width: "36px", textAlign: "right" }}>{progress.pct} %</span>
              </div>
              <div role="cell" className="prj-c"><StatutBadge C={C} statut={p.statut}/></div>
              <div role="cell" style={{ textAlign: "right" }}><RowActionsMenu C={C} label={`Actions pour ${p.nom}`} items={actionsDe(p)}/></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Vue Kanban (item 5) — colonnes = statuts réels, drag & drop natif.
// ─────────────────────────────────────────────────────────────────────────
function ProjectKanban({ C, projets, membres, moiId, moiRole, tachesByProjet, onOpen, onChangeStatut, dragOverCol, setDragOverCol }: {
  C: ThemeTokens; projets: Projet[]; membres: Membre[]; moiId: string | null; moiRole: string | null; tachesByProjet: Map<string, Tache[]>;
  onOpen: (id: string) => void; onChangeStatut: (id: string, s: string) => void;
  dragOverCol: string | null; setDragOverCol: (v: string | null) => void;
}) {
  return (
    <div className="prj-kan">
      {STATUTS_PROJET.map(col => {
        const items = projets.filter(p => p.statut === col.value);
        return (
          <div key={col.value}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.value); }}
            onDragLeave={() => { if (dragOverCol === col.value) setDragOverCol(null); }}
            onDrop={e => {
              e.preventDefault();
              setDragOverCol(null);
              const id = e.dataTransfer.getData("text/plain");
              const p = projets.find(x => x.id === id);
              if (p && p.statut !== col.value && peutGerer(p, moiId, moiRole)) onChangeStatut(id, col.value);
            }}
            style={{ backgroundColor: dragOverCol === col.value ? `${C.gold}0D` : C.bgCard2, borderRadius: "12px", padding: "10px", minHeight: "96px", border: `1.5px ${dragOverCol === col.value ? "dashed" : "solid"} ${dragOverCol === col.value ? C.gold : C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px 10px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: statutColor(col.value, C) }}/>
              <span style={{ fontSize: "13px", fontWeight: 600, color: C.t1 }}>{col.label}</span>
              <span style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map(p => {
                const verrouille = !peutGerer(p, moiId, moiRole);
                const progress = computeProgress(tachesByProjet.get(p.id) ?? []);
                return (
                  <div key={p.id} draggable={!verrouille} onDragStart={e => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => onOpen(p.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(p.id); } }} tabIndex={0} className="prj-kcard tap"
                    style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", cursor: verrouille ? "pointer" : "grab", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div title={p.nom} style={{ fontSize: "13px", fontWeight: 600, color: C.t1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{p.nom}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ flex: 1 }}><ProgressBar C={C} pct={progress.pct} hauteur={4}/></div>
                      <span style={{ fontSize: "12px", color: C.t2, fontVariantNumeric: "tabular-nums" }}>{progress.pct} %</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                      <ResponsableLabel C={C} projet={p} membres={membres}/>
                      <CibleLabel C={C} projet={p} court/>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div style={{ fontSize: "11px", color: C.t3, textAlign: "center", padding: "10px 0" }}>Aucun projet</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Vue Timeline (item 6) — portefeuille dans le temps. Pas de dépendances
// dessinées (item 7 : aucun modèle backend, non inventées).
// ─────────────────────────────────────────────────────────────────────────
function ProjectTimeline({ C, projets, onOpen }: { C: ThemeTokens; projets: Projet[]; onOpen: (id: string) => void }) {
  const [maintenant] = useState(() => Date.now());
  const withDates = projets.filter(p => p.date_debut || p.date_fin_prevue);
  if (withDates.length === 0) {
    return <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "40px 20px", textAlign: "center", color: C.t3, fontSize: "12.5px" }}>Aucun projet avec des dates définies.</div>;
  }
  const starts = withDates.map(p => new Date(p.date_debut || p.date_fin_prevue!).getTime());
  const ends = withDates.map(p => new Date(p.date_fin_prevue || p.date_debut!).getTime());
  const rangeStart = Math.min(...starts);
  const rangeEnd = Math.max(...ends, rangeStart + 30 * 86400000);
  const totalSpan = rangeEnd - rangeStart;

  const months: { label: string; left: number }[] = [];
  const cur = new Date(rangeStart);
  cur.setDate(1);
  while (cur.getTime() <= rangeEnd) {
    months.push({ label: cur.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }), left: ((cur.getTime() - rangeStart) / totalSpan) * 100 });
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "16px", overflowX: "auto" }}>
      <div style={{ minWidth: "560px" }}>
        <div style={{ position: "relative", height: "20px", marginBottom: "10px", borderBottom: `1px solid ${C.border}` }}>
          {months.map((m, i) => <span key={i} style={{ position: "absolute", left: `${m.left}%`, fontSize: "12px", fontWeight: 500, color: C.t2 }}>{m.label}</span>)}
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "10px" }}>
          {maintenant >= rangeStart && maintenant <= rangeEnd && <span aria-hidden="true" title="Aujourd'hui" style={{ position: "absolute", left: `${((maintenant - rangeStart) / totalSpan) * 100}%`, top: 0, bottom: 0, width: "1px", backgroundColor: C.gold, pointerEvents: "none", zIndex: 1 }}/>}
          {withDates.map(p => {
            const s = new Date(p.date_debut || p.date_fin_prevue!).getTime();
            const e = new Date(p.date_fin_prevue || p.date_debut!).getTime();
            const left = ((s - rangeStart) / totalSpan) * 100;
            const width = Math.max(((e - s) / totalSpan) * 100, 1.5);
            const color = statutColor(p.statut, C);
            return (
              <div key={p.id} onClick={() => onOpen(p.id)} className="tap" style={{ position: "relative", height: "26px", cursor: "pointer" }}>
                <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", backgroundColor: `${color}1c`, border: `1px solid ${color}55`, borderRadius: "6px", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: p.statut === "a_venir" ? C.t2 : color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FiltersPopover({ C, anchorRef, onClose, filters, setFilters, membres }: {
  C: ThemeTokens; anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void; filters: Filters; setFilters: (f: Filters | ((f: Filters) => Filters)) => void; membres: Membre[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, onClose);
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [anchorRef, onClose]);
  const anchor = anchorRef.current;
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return <div style={{ marginBottom: "12px" }}><div style={{ fontSize: "13px", fontWeight: 600, color: C.t1, marginBottom: "6px" }}>{title}</div><div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>{children}</div></div>;
  }
  function CheckRow({ checked, label, color, onClick }: { checked: boolean; label: string; color?: string; onClick: () => void }) {
    return (
      <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: "5px 4px", cursor: "pointer", textAlign: "left" }}>
        <div style={{ width: "14px", height: "14px", borderRadius: "4px", border: `1.5px solid ${checked ? C.gold : C.border2}`, backgroundColor: checked ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
        {color && <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>}
        <span style={{ fontSize: "12px", color: C.t1 }}>{label}</span>
      </button>
    );
  }

  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, width: "250px", maxHeight: "400px", overflowY: "auto", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "12px", outline: "none" }}>
      <Section title="Priorité">{PRIORITES_PROJET.map(p => <CheckRow key={p.value} checked={filters.priorites.includes(p.value)} label={p.label} color={prioriteColor(p.value, C)} onClick={() => setFilters(f => ({ ...f, priorites: toggleArr(f.priorites, p.value) }))}/>)}</Section>
      <Section title="Échéance">
        {[{ v: "retard", l: "En retard" }, { v: "semaine", l: "Cette semaine" }, { v: "mois", l: "Ce mois" }, { v: "sans", l: "Sans échéance" }].map(o => (
          <CheckRow key={o.v} checked={filters.echeance === o.v} label={o.l} onClick={() => setFilters(f => ({ ...f, echeance: f.echeance === o.v ? null : o.v as EcheanceBucket }))}/>
        ))}
      </Section>
      <Section title="Responsable">{membres.map(m => <CheckRow key={m.id} checked={filters.responsables.includes(m.id)} label={`${m.prenom} ${m.nom}`} onClick={() => setFilters(f => ({ ...f, responsables: toggleArr(f.responsables, m.id) }))}/>)}</Section>
      <Section title="Créé par">{membres.map(m => <CheckRow key={m.id} checked={filters.creePar.includes(m.id)} label={`${m.prenom} ${m.nom}`} onClick={() => setFilters(f => ({ ...f, creePar: toggleArr(f.creePar, m.id) }))}/>)}</Section>
    </div>
  );
}

function SortPopover({ C, anchorRef, onClose, value, onSelect }: {
  C: ThemeTokens; anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void; value: SortKey; onSelect: (s: SortKey) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, onClose);
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [anchorRef, onClose]);
  const anchor = anchorRef.current;
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  const OPTIONS = SORTS;
  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, minWidth: "180px", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "6px", outline: "none" }}>
      {OPTIONS.map(o => (
        <button key={o.value} onClick={() => { onSelect(o.value); onClose(); }} style={{ display: "block", width: "100%", textAlign: "left", background: o.value === value ? `${C.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: o.value === value ? 800 : 500, color: o.value === value ? C.goldD : C.t1, cursor: "pointer" }}>{o.label}</button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// B — Création / édition (item 14 : seul le nom est obligatoire).
// ─────────────────────────────────────────────────────────────────────────
function ProjectForm({ C, form, onChange, onRequestClose, onSave, saving, membres }: {
  C: ThemeTokens; form: FormState; onChange: (patch: Partial<FormValues>) => void; onRequestClose: () => void;
  onSave: () => void; saving: boolean; membres: Membre[];
}) {
  const v = form.values;
  const ui = toUiTokens(C);
  const edit = form.mode === "edit";
  const nomOk = v.nom.trim().length > 0;
  const datesKo = !!v.date_debut && !!v.date_fin_prevue && v.date_fin_prevue < v.date_debut;
  const valide = nomOk && !datesKo;
  const soumettre = () => { if (valide && !saving) onSave(); };
  const effacer = (cible: string, onClear: () => void) => (
    <button type="button" className="cix-btn tap" aria-label={`Effacer ${cible}`} onClick={onClear}
      style={{ position: "absolute", right: "6px", top: "7px", zIndex: 2, width: "26px", height: "26px", background: "none", border: "none", borderRadius: "6px", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  );
  return (
    <ClockModal C={C} titre={edit ? "Modifier le projet" : "Nouveau projet"} sousTitre="Définissez l'objectif et l'échéance." labelId="projet-modal-titre" largeur={560}
      onClose={onRequestClose} modifie={false} onSubmit={soumettre}
      aide={!nomOk ? "Renseignez le nom du projet." : datesKo ? "La date cible doit suivre la date de début." : undefined}
      actions={<>
        <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={onRequestClose}>Annuler</Button>
        <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!valide} loading={saving} onClick={soumettre}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <ModalField C={C} id="projet-nom" label="Nom du projet" requis>
          <input id="projet-nom" data-autofocus className="cix-input" value={v.nom} onChange={e => onChange({ nom: e.target.value })} placeholder="ex : Renouvellement de contrat" style={champStyle(C)}/>
        </ModalField>
        <ModalField C={C} id="projet-objectif" label="Objectif" optionnel>
          <textarea id="projet-objectif" className="cix-input" rows={4} value={v.description} onChange={e => onChange({ description: e.target.value })} placeholder="Quel résultat ce projet doit-il atteindre ?"
            style={{ ...champStyle(C), height: "auto", minHeight: "96px", padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}/>
        </ModalField>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <ModalField C={C} id="projet-debut" label="Date de début" optionnel>
            <div style={{ position: "relative" }}>
              <DateField C={C} id="projet-debut" value={v.date_debut} onChange={d => onChange({ date_debut: d })} vide="Choisir une date"/>
              {v.date_debut && effacer("la date de début", () => onChange({ date_debut: "" }))}
            </div>
          </ModalField>
          <ModalField C={C} id="projet-cible" label="Date cible" optionnel erreur={datesKo ? "La date cible précède la date de début." : null}>
            <div style={{ position: "relative" }}>
              <DateField C={C} id="projet-cible" value={v.date_fin_prevue} onChange={d => onChange({ date_fin_prevue: d })} vide="Choisir une date"/>
              {v.date_fin_prevue && effacer("la date cible", () => onChange({ date_fin_prevue: "" }))}
            </div>
          </ModalField>
        </div>
        <ModalField C={C} id="projet-responsable" label="Responsable" optionnel>
          <ComboField C={C} id="projet-responsable" valeur={v.responsable_membre_id} onChange={id => onChange({ responsable_membre_id: id })} aucunLabel="Non assigné"
            options={membres.map(m => ({ value: m.id, label: `${m.prenom} ${m.nom}`, avatar: `${m.prenom.slice(0, 1)}${m.nom.slice(0, 1)}`.toUpperCase() }))}/>
        </ModalField>
        {edit && (
          <ModalField C={C} id="projet-statut" label="Statut">
            <ComboField C={C} id="projet-statut" sansAucun valeur={v.statut} onChange={st => onChange({ statut: st })} options={STATUTS_PROJET.map(st => ({ value: st.value, label: st.label }))}/>
          </ModalField>
        )}
        <div>
          <div id="projet-priorite-label" style={{ color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Priorité</div>
          <div role="radiogroup" aria-labelledby="projet-priorite-label" style={{ display: "grid", gridTemplateColumns: `repeat(${PRIORITES_PROJET.length}, 1fr)`, gap: "8px" }}>
            {PRIORITES_PROJET.map(pr => {
              const on = v.priorite === pr.value;
              return (
                <button key={pr.value} type="button" role="radio" aria-checked={on} className="cix-btn tap" onClick={() => onChange({ priorite: pr.value })}
                  style={{ height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: on ? 600 : 500, color: on ? C.t1 : C.t2, backgroundColor: on ? C.bg3 : C.bgCard, border: `1px solid ${on ? C.gold : C.border2}`, boxShadow: on ? `inset 0 0 0 1px ${C.gold}` : "none" }}>
                  <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: prioriteColor(pr.value, C) }}/>{pr.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ClockModal>
  );
}
