"use client";

// Tâches de l'espace de travail — V3 "centre opérationnel du travail"
// (refonte CEO, 20/09/2026, audit complet en amont — voir échange avec
// Bryan). Réutilise le modèle Task existant, l'API existante
// (/api/institution/taches), les permissions existantes ("chacun gère le
// sien"), les membres existants — zéro nouvelle logique backend (item 18
// du brief). Statuts (à faire/en cours/terminée) et priorités (basse/
// normale/haute) : les 3 valeurs réelles de la base, pas les 5/4 de la
// maquette de référence. Projet lié : `taches.projet_id` ajouté lors du
// chantier Projets (20/09/2026) — visible ici (badge + filtre) depuis la
// revue finale du même jour, pour qu'une tâche liée à un projet ne soit
// plus invisible en tant que telle depuis l'onglet Tâches.
//
// Même discipline que l'Agenda V3 : détails avant édition (jamais la
// modification directement au clic), suppression avec confirmation
// dédiée, garde "modifications non enregistrées", popovers ancrés pour
// les actions rapides (assigné/statut/priorité/échéance), PC-first sans
// aucune logique mobile (retour Bryan 20/09/2026).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  type Tache, type Membre, type ChecklistItem, STATUTS, PRIORITES,
  prioriteColor, prioriteLabel, statutColor, statutLabel, estEnRetard, estAujourdhui, echeanceLabel,
  nomMembre, initiales, peutGerer, useDialogA11y,
  AssigneePicker, StatusPicker, EcheancePicker, TaskDetailsPanel,
} from "./TachesOverlays";
import { type Projet } from "./ProjetsOverlays";
import { TachesStyles, TasksToolbar, TasksSkeleton, TasksMessage, PriorityBadge, ChecklistProgress, DueLabel } from "./TachesUi";
import { ClockStyles, ClockModal, ModalField, champStyle, ComboField, DateField, ScheduleTypeCards, StatusPill } from "../../components/ClockInShiftUi";

type TabKey = "toutes" | "mes" | "retard" | "aujourdhui" | "terminees";
type SortKey = "echeance" | "priorite" | "titre" | "recent";
type ViewKey = "liste" | "kanban";
type EcheanceBucket = "retard" | "aujourdhui" | "semaine" | "sans" | null;
type Filters = { responsables: string[]; statuts: string[]; priorites: string[]; creePar: string[]; echeance: EcheanceBucket; projetId: string | null };

const EMPTY_FILTERS: Filters = { responsables: [], statuts: [], priorites: [], creePar: [], echeance: null, projetId: null };

const TABS: { value: TabKey; label: string }[] = [
  { value: "toutes", label: "Toutes" },
  { value: "mes", label: "Mes tâches" },
  { value: "retard", label: "En retard" },
  { value: "aujourdhui", label: "Aujourd'hui" },
  { value: "terminees", label: "Terminées" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "echeance", label: "Échéance" },
  { value: "priorite", label: "Priorité" },
  { value: "titre", label: "Titre" },
  { value: "recent", label: "Plus récentes" },
];

function toggleInArray(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}

function matchesTab(t: Tache, tab: TabKey, moiId: string | null): boolean {
  if (tab === "mes") return t.membre_id === moiId;
  if (tab === "retard") return estEnRetard(t);
  if (tab === "aujourdhui") return estAujourdhui(t);
  if (tab === "terminees") return t.statut === "termine";
  return true;
}

function matchesFilters(t: Tache, f: Filters): boolean {
  if (f.responsables.length > 0 && !(t.membre_id && f.responsables.includes(t.membre_id))) return false;
  if (f.statuts.length > 0 && !f.statuts.includes(t.statut)) return false;
  if (f.priorites.length > 0 && !f.priorites.includes(t.priorite)) return false;
  if (f.creePar.length > 0 && !(t.cree_par_membre_id && f.creePar.includes(t.cree_par_membre_id))) return false;
  if (f.projetId && t.projet_id !== f.projetId) return false;
  if (f.echeance === "retard") return estEnRetard(t);
  if (f.echeance === "aujourdhui") return estAujourdhui(t);
  if (f.echeance === "sans") return !t.echeance;
  if (f.echeance === "semaine") {
    if (!t.echeance) return false;
    const d = new Date(`${t.echeance}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0 || diff > 6) return false;
  }
  return true;
}

function matchesSearch(t: Tache, q: string, membres: Membre[]): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const assigne = nomMembre(t.membre_id, membres) || "";
  return t.titre.toLowerCase().includes(needle) || (t.description || "").toLowerCase().includes(needle) || assigne.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle);
}

function compareTaches(a: Tache, b: Tache, sortBy: SortKey): number {
  if (sortBy === "echeance") {
    if (!a.echeance && !b.echeance) return 0;
    if (!a.echeance) return 1;
    if (!b.echeance) return -1;
    return a.echeance.localeCompare(b.echeance);
  }
  if (sortBy === "priorite") {
    const order: Record<string, number> = { haute: 0, normale: 1, basse: 2 };
    return (order[a.priorite] ?? 3) - (order[b.priorite] ?? 3);
  }
  if (sortBy === "titre") return a.titre.localeCompare(b.titre, "fr");
  return (b.created_at || "").localeCompare(a.created_at || "");
}

type FormValues = { titre: string; description: string; priorite: string; statut: string; echeance: string; membre_id: string; projet_id: string; checklist: ChecklistItem[] };
type FormState = { mode: "create" | "edit"; id?: string; values: FormValues; initial: string };

function snapshotValues(v: FormValues): string { return JSON.stringify(v); }

export function TachesSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [taches, setTaches] = useState<Tache[]>([]);
  const [projets, setProjets] = useState<Projet[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("toutes");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<SortKey>("echeance");
  const [view, setView] = useState<ViewKey>("liste");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);

  const [detailsTask, setDetailsTask] = useState<Tache | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formStep, setFormStep] = useState<"form" | "unsaved">("form");
  const [deleteTarget, setDeleteTarget] = useState<Tache | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const storageKey = `yelen224_taches_state_${instId}`;

  // Persistance (item 17 du brief) — recherche/onglet/filtres/tri/vue
  // conservés après navigation Agenda↔Tâches ou rafraîchissement.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { search?: string; tab?: TabKey; filters?: Filters; sortBy?: SortKey; view?: ViewKey };
      if (typeof saved.search === "string") setSearch(saved.search);
      if (saved.tab) setTab(saved.tab);
      if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters });
      if (saved.sortBy) setSortBy(saved.sortBy);
      if (saved.view) setView(saved.view);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ search, tab, filters, sortBy, view })); } catch {}
  }, [search, tab, filters, sortBy, view, storageKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [res, pRes] = await Promise.all([fetch("/api/institution/taches"), fetch("/api/institution/projets")]);
    if (!res.ok) { setLoadError(true); setTaches([]); setLoading(false); return; }
    const j = await res.json().catch(() => null);
    const pJ = pRes.ok ? await pRes.json().catch(() => null) : null;
    setTaches(j?.taches ?? []);
    setProjets(pJ?.projets ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, instId]);

  useEffect(() => {
    fetch("/api/institution/membres").then(res => res.ok ? res.json() : null).then(j => {
      if (!j) return;
      setMembres(j.membres ?? []);
      setMoiId(j.membreId ?? null);
      setMoiRole(j.role ?? null);
    });
  }, [instId]);

  // Raccourci "n" (item 8 — réduire le nombre d'étapes entre intention et
  // création, esprit Linear) — ignoré si un champ a le focus ou un overlay
  // est déjà ouvert.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (form || detailsTask || deleteTarget) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement | null)?.isContentEditable) return;
      if (e.key.toLowerCase() === "n") openCreateForm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, detailsTask, deleteTarget]);

  const filtered = useMemo(() => {
    return taches
      .filter(t => matchesTab(t, tab, moiId))
      .filter(t => matchesFilters(t, filters))
      .filter(t => matchesSearch(t, search, membres))
      .sort((a, b) => compareTaches(a, b, sortBy));
  }, [taches, tab, filters, search, membres, sortBy]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    filters.responsables.forEach(id => { const n = nomMembre(id, membres); if (n) chips.push({ key: `r-${id}`, label: n, onRemove: () => setFilters(f => ({ ...f, responsables: f.responsables.filter(x => x !== id) })) }); });
    filters.statuts.forEach(s => chips.push({ key: `s-${s}`, label: statutLabel(s), onRemove: () => setFilters(f => ({ ...f, statuts: f.statuts.filter(x => x !== s) })) }));
    filters.priorites.forEach(p => chips.push({ key: `p-${p}`, label: prioriteLabel(p), onRemove: () => setFilters(f => ({ ...f, priorites: f.priorites.filter(x => x !== p) })) }));
    filters.creePar.forEach(id => { const n = nomMembre(id, membres); if (n) chips.push({ key: `c-${id}`, label: `Créé par ${n}`, onRemove: () => setFilters(f => ({ ...f, creePar: f.creePar.filter(x => x !== id) })) }); });
    if (filters.echeance) {
      const labels: Record<string, string> = { retard: "En retard", aujourdhui: "Aujourd'hui", semaine: "Cette semaine", sans: "Sans échéance" };
      chips.push({ key: "ech", label: labels[filters.echeance], onRemove: () => setFilters(f => ({ ...f, echeance: null })) });
    }
    if (filters.projetId) { const p = projets.find(p => p.id === filters.projetId); if (p) chips.push({ key: "proj", label: p.nom, onRemove: () => setFilters(f => ({ ...f, projetId: null })) }); }
    return chips;
  }, [filters, membres, projets]);

  function resetFilters() { setFilters(EMPTY_FILTERS); setSearch(""); setTab("toutes"); }

  // ───────────────────────────────────────────────────────────────────────
  // Formulaire (création/édition) — état levé, même architecture que
  // EventForm côté Agenda.
  // ───────────────────────────────────────────────────────────────────────
  function openCreateForm() {
    const values: FormValues = { titre: "", description: "", priorite: "normale", statut: "a_faire", echeance: "", membre_id: "", projet_id: "", checklist: [] };
    setForm({ mode: "create", values, initial: snapshotValues(values) });
    setFormStep("form");
  }

  function openEditForm(t: Tache) {
    const values: FormValues = { titre: t.titre, description: t.description || "", priorite: t.priorite, statut: t.statut, echeance: t.echeance || "", membre_id: t.membre_id || "", projet_id: t.projet_id || "", checklist: t.checklist };
    setForm({ mode: "edit", id: t.id, values, initial: snapshotValues(values) });
    setFormStep("form");
  }

  function updateFormValues(patch: Partial<FormValues>) {
    setForm(f => f ? { ...f, values: { ...f.values, ...patch } } : f);
  }

  function requestCloseForm() {
    if (form && snapshotValues(form.values) !== form.initial) { setFormStep("unsaved"); return; }
    setForm(null);
  }
  function discardForm() { setForm(null); setFormStep("form"); }
  function resumeForm() { setFormStep("form"); }

  async function performSave(f: FormState) {
    setSaving(true);
    const isEdit = f.mode === "edit";
    const body = { titre: f.values.titre.trim(), description: f.values.description || null, priorite: f.values.priorite, echeance: f.values.echeance || null, membre_id: f.values.membre_id || null, projet_id: f.values.projet_id || null, checklist: f.values.checklist, ...(isEdit ? { statut: f.values.statut } : {}) };
    const res = isEdit
      ? await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id, ...body }) })
      : await fetch("/api/institution/taches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
    setForm(null); setFormStep("form");
    onToast(isEdit ? "Tâche modifiée" : "Tâche créée", C.green);
    load();
  }

  // Statut modifiable en un clic depuis n'importe où (checkbox, popover
  // rapide, drag & drop Kanban) — optimiste, revert par rechargement en cas
  // d'échec réseau (jamais de tâche perdue silencieusement, item 15).
  async function changerStatut(id: string, statut: string) {
    setTaches(prev => prev.map(t => t.id === id ? { ...t, statut } : t));
    const res = await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, statut }) });
    if (!res.ok) { onToast("Erreur — statut non enregistré", C.red); load(); }
  }
  async function changerPriorite(id: string, priorite: string) {
    setTaches(prev => prev.map(t => t.id === id ? { ...t, priorite } : t));
    const res = await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, priorite }) });
    if (!res.ok) { onToast("Erreur — priorité non enregistrée", C.red); load(); }
  }
  async function changerEcheance(id: string, echeance: string | null) {
    setTaches(prev => prev.map(t => t.id === id ? { ...t, echeance } : t));
    const res = await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, echeance }) });
    if (!res.ok) { onToast("Erreur — échéance non enregistrée", C.red); load(); }
  }
  async function changerAssigne(id: string, membre_id: string | null) {
    setTaches(prev => prev.map(t => t.id === id ? { ...t, membre_id } : t));
    const res = await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, membre_id }) });
    if (!res.ok) { onToast("Erreur — assignation non enregistrée", C.red); load(); }
  }

  function requestDelete(t: Tache) {
    setDetailsTask(null);
    setDeleteTarget(t);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/institution/taches?id=${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    onToast("Tâche supprimée", C.orange);
    load();
  }

  const isTrueEmpty = !loading && !loadError && taches.length === 0;
  const isNoResults = !loading && !loadError && taches.length > 0 && filtered.length === 0;

  const aFiltre = activeFilterChips.length > 0 || search.trim() !== "" || tab !== "toutes";
  const tabsDef = TABS.map(t => ({ key: t.value as string, label: t.label, count: taches.filter(x => matchesTab(x, t.value, moiId)).length, alerte: t.value === "retard" }));
  const rienEnRetard = isNoResults && tab === "retard" && !search.trim() && activeFilterChips.length === 0;

  return (
    <div>
      <ClockStyles C={C}/>
      <TachesStyles C={C}/>
      <TasksToolbar C={C} tabs={tabsDef} tab={tab} onTab={k => { const t = TABS.find(x => x.value === k); if (t) setTab(t.value); }} onNew={openCreateForm}
        search={search} onSearch={setSearch}
        filtersRef={filtersBtnRef} filtersCount={activeFilterChips.length} onFilters={() => setFiltersOpen(v => !v)}
        sortRef={sortBtnRef} sortLabel={SORTS.find(s => s.value === sortBy)?.label ?? ""} onSort={() => setSortOpen(v => !v)}
        view={view} onView={setView} vues={[{ key: "liste", label: "Liste" }, { key: "kanban", label: "Kanban" }]} chips={activeFilterChips} onReset={resetFilters} aFiltre={aFiltre} total={filtered.length}/>

      {loadError && !loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px" }}>
          <span role="alert" style={{ fontSize: "13px", fontWeight: 500, color: C.red }}>Impossible de charger les tâches.</span>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={load}>Réessayer</Button>
        </div>
      )}

      {loading ? (
        <TasksSkeleton/>
      ) : isTrueEmpty ? (
        <TasksMessage C={C} titre="Aucune tâche" texte="Créez votre première tâche ou modifiez vos filtres." action={{ label: "+ Nouvelle tâche", onClick: openCreateForm, primaire: true }}/>
      ) : rienEnRetard ? (
        <TasksMessage C={C} titre="Rien en retard" texte="Toutes vos tâches sont à jour."
          icone={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}/>
      ) : isNoResults ? (
        <TasksMessage C={C} titre="Aucun résultat" texte="Aucune tâche ne correspond à ces filtres." action={{ label: "Réinitialiser les filtres", onClick: resetFilters }}/>
      ) : view === "liste" ? (
        <TaskList C={C} taches={filtered} membres={membres} projets={projets} moiId={moiId} moiRole={moiRole}
          onOpenDetails={setDetailsTask} onToggleFait={(t) => changerStatut(t.id, t.statut === "termine" ? "a_faire" : "termine")}
          onChangeStatut={changerStatut} onChangePriorite={changerPriorite} onChangeEcheance={changerEcheance} onChangeAssigne={changerAssigne}/>
      ) : (
        <TaskKanban C={C} taches={filtered} membres={membres} moiId={moiId} moiRole={moiRole}
          onOpenDetails={setDetailsTask} onChangeStatut={changerStatut}
          dragOverCol={dragOverCol} setDragOverCol={setDragOverCol}/>
      )}

      {filtersOpen && (
        <FiltersPopover C={C} anchorRef={filtersBtnRef} onClose={() => setFiltersOpen(false)} filters={filters} setFilters={setFilters} membres={membres} projets={projets}/>
      )}
      {sortOpen && (
        <SortPopover C={C} anchorRef={sortBtnRef} onClose={() => setSortOpen(false)} value={sortBy} onSelect={setSortBy}/>
      )}

      {detailsTask && (
        <TaskDetailsPanel
          open={!!detailsTask} onClose={() => setDetailsTask(null)} tache={detailsTask} membres={membres}
          peutGerer={peutGerer(detailsTask, moiId, moiRole)}
          onEdit={() => { const t = detailsTask; setDetailsTask(null); openEditForm(t); }}
          onDeleteRequest={() => requestDelete(detailsTask)}
          C={C}
        />
      )}

      {form && formStep === "form" && (
        <TaskForm C={C} form={form} onChange={updateFormValues} onRequestClose={requestCloseForm} onSave={() => performSave(form)} saving={saving} membres={membres} projets={projets}/>
      )}
      {form && formStep === "unsaved" && (
        <ConfirmModal open onClose={resumeForm} onConfirm={discardForm} tokens={toUiTokens(C)} level={1} danger
          title="Modifications non enregistrées ?" description="Vos modifications seront perdues si vous quittez maintenant."
          confirmLabel="Quitter sans enregistrer" cancelLabel="Continuer l'édition"/>
      )}

      {deleteTarget && (
        <ConfirmModal open onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} tokens={toUiTokens(C)} level={1} danger
          title="Supprimer cette tâche ?"
          consequences={[`« ${deleteTarget.titre} »`]}
          reversible={false}
          confirmLabel="Supprimer" cancelLabel="Annuler"/>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Vue Liste — table dense, une ligne = une tâche (item 3 du brief).
// ───────────────────────────────────────────────────────────────────────
function TaskList({ C, taches, membres, projets, moiId, moiRole, onOpenDetails, onToggleFait, onChangeStatut, onChangeEcheance, onChangeAssigne }: {
  C: ThemeTokens; taches: Tache[]; membres: Membre[]; projets: Projet[]; moiId: string | null; moiRole: string | null;
  onOpenDetails: (t: Tache) => void; onToggleFait: (t: Tache) => void;
  onChangeStatut: (id: string, s: string) => void; onChangePriorite: (id: string, p: string) => void;
  onChangeEcheance: (id: string, e: string | null) => void; onChangeAssigne: (id: string, m: string | null) => void;
}) {
  const [openPicker, setOpenPicker] = useState<{ id: string; kind: "statut" | "priorite" | "echeance" | "assigne" } | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function anchorRef(id: string) {
    return { current: refs.current[id] ?? null };
  }
  const discret: React.CSSProperties = { background: "none", border: "none", padding: 0, font: "inherit" };

  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "12px", border: `1px solid ${C.border}` }}>
      {taches.map((t, i) => {
        const verrouille = !peutGerer(t, moiId, moiRole);
        const enRetard = estEnRetard(t);
        const aujourdhui = estAujourdhui(t);
        const init = initiales(t.membre_id, membres);
        const assigneNom = nomMembre(t.membre_id, membres);
        const projet = t.projet_id ? projets.find(p => p.id === t.projet_id) : null;
        const fait = t.statut === "termine";
        const faits = t.checklist.filter(c => c.fait).length;
        const echeanceComplete = t.echeance ? new Date(`${t.echeance}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Sans échéance";
        const sousLigne = [projet ? `Projet : ${projet.nom}` : null, assigneNom ? `Assigné : ${assigneNom}` : null, (t.citoyen_id || t.rdv_id) ? "Client lié" : null].filter(Boolean).join(" · ");
        return (
          <div key={t.id} role="button" tabIndex={0} onClick={() => onOpenDetails(t)}
            onKeyDown={e => { if (e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); onOpenDetails(t); } }}
            className="tsk-row tap" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
            <div className="tsk-main">
              <button type="button" role="checkbox" aria-checked={fait} aria-disabled={verrouille} className="tsk-btn"
                aria-label={fait ? `Remettre « ${t.titre} » à faire` : `Marquer « ${t.titre} » comme terminée`}
                onClick={e => { e.stopPropagation(); if (!verrouille) onToggleFait(t); }}
                style={{ width: "20px", height: "20px", borderRadius: "5px", border: `1.5px solid ${fait ? C.green : C.border2}`, backgroundColor: fait ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: verrouille ? "default" : "pointer", opacity: verrouille ? 0.5 : 1, padding: 0 }}>
                {fait && <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div title={t.titre} style={{ fontSize: "14px", fontWeight: 500, color: fait ? C.t3 : C.t1, textDecoration: fait ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titre}</div>
                {sousLigne && <div title={sousLigne} style={{ fontSize: "12px", color: C.t3, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sousLigne}</div>}
              </div>
            </div>

            <div className="tsk-meta">
              <span className="tsk-prio"><PriorityBadge C={C} priorite={t.priorite} label={prioriteLabel(t.priorite)}/></span>

              <button ref={el => { refs.current[`${t.id}-echeance`] = el; }} type="button" className="tsk-due tsk-btn" aria-label={`Échéance : ${echeanceLabel(t)}`}
                onClick={e => { e.stopPropagation(); if (!verrouille) setOpenPicker({ id: t.id, kind: "echeance" }); }} disabled={verrouille}
                style={{ ...discret, cursor: verrouille ? "default" : "pointer" }}>
                <DueLabel C={C} texte={echeanceLabel(t)} etat={enRetard ? "retard" : aujourdhui ? "aujourdhui" : t.echeance ? "normal" : "sans"} complet={echeanceComplete}/>
              </button>
              <EcheancePicker open={openPicker?.id === t.id && openPicker.kind === "echeance"} onClose={() => setOpenPicker(null)} anchorRef={anchorRef(`${t.id}-echeance`)} tokens={C} value={t.echeance || ""} onSelect={iso => onChangeEcheance(t.id, iso)}/>

              <span className="tsk-check"><ChecklistProgress C={C} fait={faits} total={t.checklist.length}/></span>

              <button ref={el => { refs.current[`${t.id}-assigne`] = el; }} type="button" className="tsk-btn" title={assigneNom ?? "Non assigné"} aria-label={`Assigné à : ${assigneNom ?? "personne"}`}
                onClick={e => { e.stopPropagation(); if (!verrouille) setOpenPicker({ id: t.id, kind: "assigne" }); }} disabled={verrouille}
                style={{ ...discret, cursor: verrouille ? "default" : "pointer", flexShrink: 0 }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", border: init ? "none" : `1px dashed ${C.border2}` }}>
                  {init ?? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                </span>
              </button>
              <AssigneePicker open={openPicker?.id === t.id && openPicker.kind === "assigne"} onClose={() => setOpenPicker(null)} anchorRef={anchorRef(`${t.id}-assigne`)} tokens={C} membres={membres} value={t.membre_id} onSelect={id => onChangeAssigne(t.id, id)}/>

              <button ref={el => { refs.current[`${t.id}-statut`] = el; }} type="button" className="tsk-btn" aria-label={`Statut : ${statutLabel(t.statut)}`}
                onClick={e => { e.stopPropagation(); if (!verrouille) setOpenPicker({ id: t.id, kind: "statut" }); }} disabled={verrouille}
                style={{ ...discret, cursor: verrouille ? "default" : "pointer", flexShrink: 0 }}>
                <StatusPill label={statutLabel(t.statut)} color={statutColor(t.statut, C)}/>
              </button>
              <StatusPicker open={openPicker?.id === t.id && openPicker.kind === "statut"} onClose={() => setOpenPicker(null)} anchorRef={anchorRef(`${t.id}-statut`)} tokens={C} value={t.statut} onSelect={s => onChangeStatut(t.id, s)}/>

              {verrouille && (
                <svg role="img" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }} aria-label="Vous ne pouvez pas modifier cet élément"><title>Vous ne pouvez pas modifier cet élément</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Vue Kanban — colonnes = les 3 statuts réels, drag & drop natif HTML5
// pour changer le statut (item 11 du brief).
// ───────────────────────────────────────────────────────────────────────
function TaskKanban({ C, taches, membres, moiId, moiRole, onOpenDetails, onChangeStatut, dragOverCol, setDragOverCol }: {
  C: ThemeTokens; taches: Tache[]; membres: Membre[]; moiId: string | null; moiRole: string | null;
  onOpenDetails: (t: Tache) => void; onChangeStatut: (id: string, s: string) => void;
  dragOverCol: string | null; setDragOverCol: (v: string | null) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`, gap: "16px", alignItems: "start" }}>
      {STATUTS.map(col => {
        const items = taches.filter(t => t.statut === col.value);
        const survol = dragOverCol === col.value;
        return (
          <div key={col.value}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.value); }}
            onDragLeave={() => { if (dragOverCol === col.value) setDragOverCol(null); }}
            onDrop={e => {
              e.preventDefault();
              setDragOverCol(null);
              const id = e.dataTransfer.getData("text/plain");
              const t = taches.find(x => x.id === id);
              if (t && t.statut !== col.value && peutGerer(t, moiId, moiRole)) onChangeStatut(id, col.value);
            }}
            style={{ backgroundColor: survol ? `${C.gold}0d` : C.bgCard2, borderRadius: "12px", padding: "12px", minHeight: "96px", border: survol ? `1.5px dashed ${C.gold}` : "1.5px solid transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px 12px" }}>
              <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: statutColor(col.value, C) }}/>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: C.t1, margin: 0 }}>{col.label}</h3>
              <span style={{ minWidth: "20px", height: "20px", borderRadius: "10px", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map(t => {
                const verrouille = !peutGerer(t, moiId, moiRole);
                const init = initiales(t.membre_id, membres);
                const enRetard = estEnRetard(t);
                const aujourdhui = estAujourdhui(t);
                const faits = t.checklist.filter(c => c.fait).length;
                return (
                  <div key={t.id} role="button" tabIndex={0}
                    draggable={!verrouille}
                    onDragStart={e => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => onOpenDetails(t)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onOpenDetails(t); } }}
                    className="tap tsk-btn"
                    style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", cursor: verrouille ? "pointer" : "grab" }}>
                    <div title={t.titre} style={{ fontSize: "14px", fontWeight: 500, color: t.statut === "termine" ? C.t3 : C.t1, textDecoration: t.statut === "termine" ? "line-through" : "none", marginBottom: "10px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{t.titre}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <PriorityBadge C={C} priorite={t.priorite} label={prioriteLabel(t.priorite)}/>
                      <DueLabel C={C} texte={echeanceLabel(t)} etat={enRetard ? "retard" : aujourdhui ? "aujourdhui" : t.echeance ? "normal" : "sans"} complet={t.echeance ? new Date(`${t.echeance}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Sans échéance"}/>
                      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <ChecklistProgress C={C} fait={faits} total={t.checklist.length}/>
                        <span title={nomMembre(t.membre_id, membres) ?? "Non assigné"} style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{init ?? "—"}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div style={{ fontSize: "13px", color: C.t3, textAlign: "center", padding: "10px 0" }}>Aucune tâche</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FiltersPopover({ C, anchorRef, onClose, filters, setFilters, membres, projets }: {
  C: ThemeTokens; anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void; filters: Filters; setFilters: (f: Filters | ((f: Filters) => Filters)) => void; membres: Membre[]; projets: Projet[];
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
    return (
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: C.t1, marginBottom: "6px" }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>{children}</div>
      </div>
    );
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
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, width: "260px", maxHeight: "420px", overflowY: "auto", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "12px", outline: "none" }}>
      <Section title="Statut">
        {STATUTS.map(s => <CheckRow key={s.value} checked={filters.statuts.includes(s.value)} label={s.label} color={statutColor(s.value, C)} onClick={() => setFilters(f => ({ ...f, statuts: toggleInArray(f.statuts, s.value) }))}/>)}
      </Section>
      <Section title="Priorité">
        {PRIORITES.map(p => <CheckRow key={p.value} checked={filters.priorites.includes(p.value)} label={p.label} color={prioriteColor(p.value, C)} onClick={() => setFilters(f => ({ ...f, priorites: toggleInArray(f.priorites, p.value) }))}/>)}
      </Section>
      <Section title="Échéance">
        {[{ v: "retard", l: "En retard" }, { v: "aujourdhui", l: "Aujourd'hui" }, { v: "semaine", l: "Cette semaine" }, { v: "sans", l: "Sans échéance" }].map(o => (
          <CheckRow key={o.v} checked={filters.echeance === o.v} label={o.l} onClick={() => setFilters(f => ({ ...f, echeance: f.echeance === o.v ? null : o.v as EcheanceBucket }))}/>
        ))}
      </Section>
      <Section title="Responsable">
        {membres.map(m => <CheckRow key={m.id} checked={filters.responsables.includes(m.id)} label={`${m.prenom} ${m.nom}`} onClick={() => setFilters(f => ({ ...f, responsables: toggleInArray(f.responsables, m.id) }))}/>)}
      </Section>
      {projets.length > 0 && (
        <Section title="Projet">
          {projets.map(p => <CheckRow key={p.id} checked={filters.projetId === p.id} label={p.nom} onClick={() => setFilters(f => ({ ...f, projetId: f.projetId === p.id ? null : p.id }))}/>)}
        </Section>
      )}
      <Section title="Créé par">
        {membres.map(m => <CheckRow key={m.id} checked={filters.creePar.includes(m.id)} label={`${m.prenom} ${m.nom}`} onClick={() => setFilters(f => ({ ...f, creePar: toggleInArray(f.creePar, m.id) }))}/>)}
      </Section>
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
  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, minWidth: "160px", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "6px", outline: "none" }}>
      {SORTS.map(s => (
        <button key={s.value} onClick={() => { onSelect(s.value); onClose(); }} style={{ display: "block", width: "100%", textAlign: "left", background: s.value === value ? `${C.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: s.value === value ? 800 : 500, color: s.value === value ? C.goldD : C.t1, cursor: "pointer" }}>{s.label}</button>
      ))}
    </div>
  );
}

// B — Création / édition (même composant, deux modes, item 9). Gabarit commun
// ClockModal ; la garde « modifications non enregistrées » reste celle de la
// section (ConfirmModal dédié), d'où modifie={false} ici.
function TaskForm({ C, form, onChange, onRequestClose, onSave, saving, membres, projets }: {
  C: ThemeTokens; form: FormState; onChange: (patch: Partial<FormValues>) => void; onRequestClose: () => void;
  onSave: () => void; saving: boolean; membres: Membre[]; projets: Projet[];
}) {
  const [newItem, setNewItem] = useState("");
  const v = form.values;
  const ui = toUiTokens(C);
  const faitCount = v.checklist.filter(c => c.fait).length;

  function ajouterItem() {
    if (!newItem.trim()) return;
    onChange({ checklist: [...v.checklist, { label: newItem.trim(), fait: false }] });
    setNewItem("");
  }

  return (
    <ClockModal C={C} titre={form.mode === "edit" ? "Modifier la tâche" : "Nouvelle tâche"} labelId="tache-modal-titre" largeur={560}
      onClose={onRequestClose} modifie={false} onSubmit={() => { if (v.titre.trim() && !saving) onSave(); }}
      aide={!v.titre.trim() ? "Renseignez le titre." : undefined}
      actions={
        <>
          <Button tokens={ui} className="tap" variant="secondary" size="md" disabled={saving} onClick={onRequestClose}>Annuler</Button>
          <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!v.titre.trim()} loading={saving} onClick={onSave}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <ModalField C={C} id="tache-titre" label="Titre" requis>
          <input id="tache-titre" data-autofocus className="cix-input" value={v.titre} onChange={e => onChange({ titre: e.target.value })} placeholder="ex : Renouveler le contrat de maintenance" style={champStyle(C)}/>
        </ModalField>
        <ModalField C={C} id="tache-description" label="Description" optionnel>
          <textarea id="tache-description" className="cix-input" rows={4} value={v.description} onChange={e => onChange({ description: e.target.value })}
            style={{ ...champStyle(C), height: "auto", minHeight: "96px", padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}/>
        </ModalField>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Priorité</div>
            <ScheduleTypeCards C={C} ariaLabel="Priorité" minCarte={90} value={v.priorite} onChange={p => onChange({ priorite: p })}
              options={PRIORITES.map(p => ({ value: p.value, label: p.label, desc: "", couleur: p.value === "haute" ? C.orange : p.value === "basse" ? C.t3 : C.t2 }))}/>
          </div>
          <ModalField C={C} id="tache-echeance" label="Échéance" optionnel>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}><DateField C={C} id="tache-echeance" value={v.echeance} onChange={d => onChange({ echeance: d })} vide="Sans échéance"/></div>
              {v.echeance && (
                <button type="button" className="cix-btn tap" aria-label="Effacer l'échéance" title="Effacer l'échéance" onClick={() => onChange({ echeance: "" })}
                  style={{ width: "40px", height: "40px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </ModalField>
        </div>

        {form.mode === "edit" && (
          <div>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Statut</div>
            <ScheduleTypeCards C={C} ariaLabel="Statut" minCarte={110} value={v.statut} onChange={s => onChange({ statut: s })}
              options={STATUTS.map(s => ({ value: s.value, label: s.label, desc: "", couleur: statutColor(s.value, C) }))}/>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <ModalField C={C} id="tache-membre" label="Assigné à" optionnel>
            <ComboField C={C} id="tache-membre" valeur={v.membre_id} onChange={id => onChange({ membre_id: id })} aucunLabel="Non assigné"
              options={membres.map(m => ({ value: m.id, label: `${m.prenom} ${m.nom}`, avatar: `${m.prenom.slice(0, 1)}${m.nom.slice(0, 1)}`.toUpperCase() }))}/>
          </ModalField>
          <ModalField C={C} id="tache-projet" label="Projet" optionnel>
            <ComboField C={C} id="tache-projet" valeur={v.projet_id} onChange={id => onChange({ projet_id: id })} aucunLabel="Aucun projet"
              options={projets.map(p => ({ value: p.id, label: p.nom }))} vide={{ titre: "Aucun projet", aide: "Créez-en un dans l'onglet Projets." }}/>
          </ModalField>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
            <label htmlFor="tache-checklist" style={{ color: C.t1, fontSize: "13px", fontWeight: 500 }}>Checklist</label>
            {v.checklist.length > 0 && <span aria-live="polite" style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{v.checklist.length} élément{v.checklist.length > 1 ? "s" : ""} · {faitCount} terminé{faitCount > 1 ? "s" : ""}</span>}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input id="tache-checklist" className="cix-input" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Ajouter un élément…"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ajouterItem(); } }} style={{ ...champStyle(C), flex: 1, minWidth: 0 }}/>
            <Button tokens={ui} className="tap" variant="secondary" size="md" style={{ height: "40px" }} disabled={!newItem.trim()} onClick={ajouterItem}
              icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>Ajouter</Button>
          </div>
          {v.checklist.length > 0 && (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, border: `1px solid ${C.border}`, borderRadius: "10px" }}>
              {v.checklist.map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                  <button type="button" role="checkbox" aria-checked={item.fait} aria-label={`${item.fait ? "Décocher" : "Cocher"} : ${item.label}`} className="cix-btn"
                    onClick={() => onChange({ checklist: v.checklist.map((it, idx) => idx === i ? { ...it, fait: !it.fait } : it) })}
                    style={{ width: "18px", height: "18px", borderRadius: "5px", border: `1.5px solid ${item.fait ? C.green : C.border2}`, backgroundColor: item.fait ? C.green : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    {item.fait && <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "14px", color: item.fait ? C.t3 : C.t1, textDecoration: item.fait ? "line-through" : "none", overflowWrap: "anywhere" }}>{item.label}</span>
                  <button type="button" className="cix-btn tap" aria-label={`Retirer : ${item.label}`} onClick={() => onChange({ checklist: v.checklist.filter((_, idx) => idx !== i) })}
                    style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", padding: "4px" }}>
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ClockModal>
  );
}
