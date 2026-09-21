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
import { YelenLoader } from "@/components/YelenLoader";
import {
  type Tache, type Membre, type ChecklistItem, STATUTS, PRIORITES,
  prioriteColor, prioriteLabel, statutColor, statutLabel, estEnRetard, estAujourdhui, echeanceLabel,
  nomMembre, initiales, peutGerer, useDialogA11y,
  AssigneePicker, StatusPicker, PriorityPicker, EcheancePicker, TaskDetailsPanel,
} from "./TachesOverlays";
import { type Projet, ProjectLinkPicker } from "./ProjetsOverlays";

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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)} style={{ background: tab === t.value ? C.goldL : C.bgCard, border: `1px solid ${tab === t.value ? C.goldL : C.border}`, borderRadius: "8px", padding: "6px 12px", fontSize: "11.5px", fontWeight: tab === t.value ? 800 : 600, color: tab === t.value ? C.goldD : C.t2, cursor: "pointer" }}>{t.label}</button>
          ))}
        </div>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={openCreateForm}>+ Nouvelle tâche</Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une tâche…" style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 10px 8px 30px", fontSize: "12.5px", color: C.t1, boxSizing: "border-box" }}/>
        </div>
        <button ref={filtersBtnRef} onClick={() => setFiltersOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>
          Filtres{activeFilterChips.length > 0 && <span style={{ backgroundColor: C.gold, color: "#000", fontSize: "9.5px", fontWeight: "800", borderRadius: "20px", padding: "1px 6px" }}>{activeFilterChips.length}</span>}
        </button>
        <button ref={sortBtnRef} onClick={() => setSortOpen(v => !v)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>Trier · {SORTS.find(s => s.value === sortBy)?.label}</button>
        <div style={{ display: "flex", gap: "4px", backgroundColor: C.bg3, borderRadius: "9px", padding: "3px" }}>
          {(["liste", "kanban"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? C.bgCard : "transparent", border: "none", borderRadius: "7px", padding: "6px 12px", fontSize: "11.5px", fontWeight: "700", color: view === v ? C.gold : C.t2, cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
          ))}
        </div>
      </div>

      {activeFilterChips.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
          {activeFilterChips.map(c => (
            <button key={c.key} onClick={c.onRemove} style={{ display: "flex", alignItems: "center", gap: "5px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "20px", padding: "3px 6px 3px 10px", fontSize: "11px", fontWeight: "700", color: C.t1, cursor: "pointer" }}>
              {c.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ))}
          <button onClick={resetFilters} style={{ background: "none", border: "none", color: C.t3, fontSize: "11px", fontWeight: "700", cursor: "pointer", textDecoration: "underline" }}>Réinitialiser</button>
        </div>
      )}

      {loadError && !loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: C.red }}>Impossible de charger les tâches.</span>
          <button onClick={load} style={{ background: "none", border: "none", color: C.red, fontSize: "12px", fontWeight: "800", cursor: "pointer", textDecoration: "underline" }}>Réessayer</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : isTrueEmpty ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: C.t1, marginBottom: "4px" }}>Aucune tâche à afficher</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Créez votre première tâche ou modifiez vos filtres.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={openCreateForm}>+ Nouvelle tâche</Button>
        </div>
      ) : isNoResults ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.t1, marginBottom: "4px" }}>Aucun résultat pour ces filtres</div>
          <button onClick={resetFilters} style={{ color: C.gold, background: "none", border: "none", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Réinitialiser les filtres</button>
        </div>
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
function TaskList({ C, taches, membres, projets, moiId, moiRole, onOpenDetails, onToggleFait, onChangeStatut, onChangePriorite, onChangeEcheance, onChangeAssigne }: {
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

  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
      {taches.map((t, i) => {
        const verrouille = !peutGerer(t, moiId, moiRole);
        const enRetard = estEnRetard(t);
        const aujourdhui = estAujourdhui(t);
        const init = initiales(t.membre_id, membres);
        const assigneNom = nomMembre(t.membre_id, membres);
        const projet = t.projet_id ? projets.find(p => p.id === t.projet_id) : null;
        return (
          <div key={t.id} onClick={() => onOpenDetails(t)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
            <div onClick={e => { e.stopPropagation(); if (!verrouille) onToggleFait(t); }} style={{ width: "17px", height: "17px", borderRadius: "5px", border: `1.5px solid ${t.statut === "termine" ? C.green : C.border2}`, backgroundColor: t.statut === "termine" ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: verrouille ? "default" : "pointer", opacity: verrouille ? 0.5 : 1 }}>
              {t.statut === "termine" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>

            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: prioriteColor(t.priorite, C), flexShrink: 0 }} title={prioriteLabel(t.priorite)}/>

            {/* Projet en 2e ligne discrète (pas un badge de plus) — une
                liste chargée doit rester scannable (revue finale, item 3) :
                la relation reste visible sans élargir chaque ligne pour
                l'immense majorité des tâches qui n'ont pas de projet. */}
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: "600", color: t.statut === "termine" ? C.t3 : C.t1, textDecoration: t.statut === "termine" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titre}</div>
              {projet && <div style={{ fontSize: "10px", color: C.goldD, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projet.nom}</div>}
            </span>

            {(t.citoyen_id || t.rdv_id) && <span style={{ color: C.blue, fontSize: "9.5px", fontWeight: "700", flexShrink: 0 }}>Client lié</span>}
            {t.checklist.length > 0 && <span style={{ color: C.t3, fontSize: "10px", flexShrink: 0 }}>{t.checklist.filter(c => c.fait).length}/{t.checklist.length}</span>}

            <button ref={el => { refs.current[`${t.id}-assigne`] = el; }} onClick={e => { e.stopPropagation(); if (!verrouille) setOpenPicker({ id: t.id, kind: "assigne" }); }} disabled={verrouille} style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: verrouille ? "default" : "pointer", flexShrink: 0, padding: "2px" }}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: init ? C.gold : C.bg3, color: init ? "#000" : C.t3, fontSize: "8.5px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>{init || "—"}</span>
            </button>
            <AssigneePicker open={openPicker?.id === t.id && openPicker.kind === "assigne"} onClose={() => setOpenPicker(null)} anchorRef={anchorRef(`${t.id}-assigne`)} tokens={C} membres={membres} value={t.membre_id} onSelect={id => onChangeAssigne(t.id, id)}/>

            <button ref={el => { refs.current[`${t.id}-echeance`] = el; }} onClick={e => { e.stopPropagation(); if (!verrouille) setOpenPicker({ id: t.id, kind: "echeance" }); }} disabled={verrouille} style={{ background: "none", border: "none", cursor: verrouille ? "default" : "pointer", color: enRetard ? C.red : aujourdhui ? C.gold : C.t3, fontSize: "10.5px", fontWeight: enRetard || aujourdhui ? "800" : "600", flexShrink: 0, width: "78px", textAlign: "right" }}>{echeanceLabel(t)}</button>
            <EcheancePicker open={openPicker?.id === t.id && openPicker.kind === "echeance"} onClose={() => setOpenPicker(null)} anchorRef={anchorRef(`${t.id}-echeance`)} tokens={C} value={t.echeance || ""} onSelect={iso => onChangeEcheance(t.id, iso)}/>

            <button ref={el => { refs.current[`${t.id}-statut`] = el; }} onClick={e => { e.stopPropagation(); if (!verrouille) setOpenPicker({ id: t.id, kind: "statut" }); }} disabled={verrouille} style={{ background: `${statutColor(t.statut, C)}15`, border: "none", borderRadius: "20px", padding: "3px 10px", fontSize: "10px", fontWeight: "800", color: statutColor(t.statut, C), cursor: verrouille ? "default" : "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>{statutLabel(t.statut)}</button>
            <StatusPicker open={openPicker?.id === t.id && openPicker.kind === "statut"} onClose={() => setOpenPicker(null)} anchorRef={anchorRef(`${t.id}-statut`)} tokens={C} value={t.statut} onSelect={s => onChangeStatut(t.id, s)}/>

            {verrouille && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }} aria-label="Vous ne pouvez pas modifier cet élément"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            )}
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
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUTS.length}, 1fr)`, gap: "12px", alignItems: "start" }}>
      {STATUTS.map(col => {
        const items = taches.filter(t => t.statut === col.value);
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
            style={{ backgroundColor: dragOverCol === col.value ? `${C.gold}0D` : C.bg3, borderRadius: "12px", padding: "10px", minHeight: "80px", border: `1px solid ${dragOverCol === col.value ? C.gold + "60" : "transparent"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px 10px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: statutColor(col.value, C) }}/>
              <span style={{ fontSize: "11.5px", fontWeight: "800", color: C.t1, letterSpacing: "0.3px" }}>{col.label.toUpperCase()}</span>
              <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map(t => {
                const verrouille = !peutGerer(t, moiId, moiRole);
                const init = initiales(t.membre_id, membres);
                const enRetard = estEnRetard(t);
                return (
                  <div key={t.id}
                    draggable={!verrouille}
                    onDragStart={e => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => onOpenDetails(t)}
                    className="tap"
                    style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", cursor: verrouille ? "pointer" : "grab" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: "700", color: C.t1, marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{t.titre}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: prioriteColor(t.priorite, C), flexShrink: 0 }}/>
                      <span style={{ width: "18px", height: "18px", borderRadius: "50%", backgroundColor: init ? C.gold : C.bg3, color: init ? "#000" : C.t3, fontSize: "7.5px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{init || "—"}</span>
                      <span style={{ fontSize: "9.5px", fontWeight: enRetard ? 800 : 600, color: enRetard ? C.red : C.t3, flexShrink: 0 }}>{echeanceLabel(t)}</span>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div style={{ fontSize: "11px", color: C.t3, textAlign: "center", padding: "10px 0" }}>Aucune tâche</div>}
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
        <div style={{ fontSize: "9.5px", fontWeight: "800", color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{title}</div>
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

function fieldBtnStyle(C: ThemeTokens): React.CSSProperties {
  return { textAlign: "left", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 12px", fontSize: "12px", color: C.t1, cursor: "pointer", fontFamily: "inherit" };
}
function inputStyle(C: ThemeTokens): React.CSSProperties {
  return { width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "8px", color: C.t1, boxSizing: "border-box", fontFamily: "inherit" };
}

// ───────────────────────────────────────────────────────────────────────
// B — Création / édition (même composant, deux modes, item 9). PC-first :
// dialogue centré unique, aucune logique mobile (retour Bryan 20/09/2026).
// ───────────────────────────────────────────────────────────────────────
function TaskForm({ C, form, onChange, onRequestClose, onSave, saving, membres, projets }: {
  C: ThemeTokens; form: FormState; onChange: (patch: Partial<FormValues>) => void; onRequestClose: () => void;
  onSave: () => void; saving: boolean; membres: Membre[]; projets: Projet[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, onRequestClose);

  const statutBtnRef = useRef<HTMLButtonElement>(null);
  const prioriteBtnRef = useRef<HTMLButtonElement>(null);
  const echeanceBtnRef = useRef<HTMLButtonElement>(null);
  const membreBtnRef = useRef<HTMLButtonElement>(null);
  const projetBtnRef = useRef<HTMLButtonElement>(null);
  const [openPicker, setOpenPicker] = useState<"statut" | "priorite" | "echeance" | "membre" | "projet" | null>(null);
  const [newItem, setNewItem] = useState("");

  const v = form.values;
  const assigneLabel = v.membre_id ? (nomMembre(v.membre_id, membres) || "Non assigné") : "Non assigné";
  const projetLabel = v.projet_id ? (projets.find(p => p.id === v.projet_id)?.nom ?? "Projet") : "Aucun projet";
  const faitCount = v.checklist.filter(c => c.fait).length;

  function ajouterItem() {
    if (!newItem.trim()) return;
    onChange({ checklist: [...v.checklist, { label: newItem.trim(), fait: false }] });
    setNewItem("");
  }

  return (
    <>
      <div
        onClick={() => { if (openPicker) { setOpenPicker(null); return; } onRequestClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      >
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "24px", width: "100%", maxWidth: "540px", maxHeight: "88vh", overflowY: "auto", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", outline: "none" }}>
          <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "14px" }}>{form.mode === "edit" ? "Modifier la tâche" : "Nouvelle tâche"}</div>

          <input value={v.titre} onChange={e => onChange({ titre: e.target.value })} placeholder="Ex. Renouveler le contrat de maintenance" style={inputStyle(C)}/>
          <textarea value={v.description} onChange={e => onChange({ description: e.target.value })} placeholder="Description (optionnel)" rows={2} style={{ ...inputStyle(C), resize: "none" }}/>

          <div style={{ display: "grid", gridTemplateColumns: form.mode === "edit" ? "1fr 1fr 1fr" : "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <button ref={prioriteBtnRef} onClick={() => setOpenPicker(p => p === "priorite" ? null : "priorite")} style={fieldBtnStyle(C)}>{prioriteLabel(v.priorite)}</button>
            <button ref={echeanceBtnRef} onClick={() => setOpenPicker(p => p === "echeance" ? null : "echeance")} style={fieldBtnStyle(C)}>{v.echeance ? new Date(`${v.echeance}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "Sans échéance"}</button>
            {form.mode === "edit" && (
              <button ref={statutBtnRef} onClick={() => setOpenPicker(p => p === "statut" ? null : "statut")} style={fieldBtnStyle(C)}>{statutLabel(v.statut)}</button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <button ref={membreBtnRef} onClick={() => setOpenPicker(p => p === "membre" ? null : "membre")} style={fieldBtnStyle(C)}>Assigné à — {assigneLabel}</button>
            <button ref={projetBtnRef} onClick={() => setOpenPicker(p => p === "projet" ? null : "projet")} style={fieldBtnStyle(C)}>{projetLabel}</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <label style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px" }}>Checklist</label>
            {v.checklist.length > 0 && <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700" }}>{faitCount}/{v.checklist.length}</span>}
          </div>
          {v.checklist.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <div onClick={() => onChange({ checklist: v.checklist.map((it, idx) => idx === i ? { ...it, fait: !it.fait } : it) })} style={{ width: "17px", height: "17px", borderRadius: "5px", border: `1.5px solid ${item.fait ? C.green : C.border2}`, backgroundColor: item.fait ? C.green : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {item.fait && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span style={{ flex: 1, fontSize: "12.5px", color: item.fait ? C.t3 : C.t1, textDecoration: item.fait ? "line-through" : "none" }}>{item.label}</span>
              <button onClick={() => onChange({ checklist: v.checklist.filter((_, idx) => idx !== i) })} aria-label="Retirer" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", display: "flex" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", marginBottom: "18px" }}>
            <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ajouterItem(); } }} placeholder="Ajouter un élément…" style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "12px", color: C.t1 }}/>
            <button onClick={ajouterItem} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 14px", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onRequestClose}>Annuler</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!v.titre.trim()} loading={saving} onClick={onSave}>Enregistrer</Button>
          </div>
        </div>
      </div>

      <PriorityPicker open={openPicker === "priorite"} onClose={() => setOpenPicker(null)} anchorRef={prioriteBtnRef} tokens={C} value={v.priorite} onSelect={p => onChange({ priorite: p })}/>
      <EcheancePicker open={openPicker === "echeance"} onClose={() => setOpenPicker(null)} anchorRef={echeanceBtnRef} tokens={C} value={v.echeance} onSelect={iso => onChange({ echeance: iso || "" })}/>
      {form.mode === "edit" && (
        <StatusPicker open={openPicker === "statut"} onClose={() => setOpenPicker(null)} anchorRef={statutBtnRef} tokens={C} value={v.statut} onSelect={s => onChange({ statut: s })}/>
      )}
      <AssigneePicker open={openPicker === "membre"} onClose={() => setOpenPicker(null)} anchorRef={membreBtnRef} tokens={C} membres={membres} value={v.membre_id || null} onSelect={id => onChange({ membre_id: id || "" })}/>
      <ProjectLinkPicker open={openPicker === "projet"} onClose={() => setOpenPicker(null)} anchorRef={projetBtnRef} tokens={C} projets={projets} value={v.projet_id || null} onSelect={id => onChange({ projet_id: id || "" })}/>
    </>
  );
}
