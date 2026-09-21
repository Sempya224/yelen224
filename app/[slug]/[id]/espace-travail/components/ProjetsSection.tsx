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
import { YelenLoader } from "@/components/YelenLoader";
import { type Tache } from "./TachesOverlays";
import { type DocumentTravail } from "./DocumentsOverlays";
import {
  type Projet, type Membre, STATUTS_PROJET, PRIORITES_PROJET,
  statutColor, statutLabel, prioriteColor, prioriteLabel, santeInfo,
  nomMembre, initiales, peutGerer, computeProgress,
  ProjectStatusPicker, ProjectPriorityPicker, ProjectQuickDrawer,
} from "./ProjetsOverlays";
import { AgendaPopover, useDialogA11y, MemberPicker, DatePicker } from "./AgendaOverlays";
import { ProjectOverview } from "./ProjectOverview";

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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)} style={{ background: tab === t.value ? C.goldL : C.bgCard, border: `1px solid ${tab === t.value ? C.goldL : C.border}`, borderRadius: "8px", padding: "6px 12px", fontSize: "11.5px", fontWeight: tab === t.value ? 800 : 600, color: tab === t.value ? C.goldD : C.t2, cursor: "pointer" }}>{t.label}</button>
          ))}
        </div>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={openCreateForm}>+ Nouveau projet</Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un projet…" style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 10px 8px 30px", fontSize: "12.5px", color: C.t1, boxSizing: "border-box" }}/>
        </div>
        <button ref={filtersBtnRef} onClick={() => setFiltersOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>
          Filtrer{activeFilterChips.length > 0 && <span style={{ backgroundColor: C.gold, color: "#000", fontSize: "9.5px", fontWeight: "800", borderRadius: "20px", padding: "1px 6px" }}>{activeFilterChips.length}</span>}
        </button>
        <button ref={sortBtnRef} onClick={() => setSortOpen(v => !v)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>Trier</button>
        <div style={{ display: "flex", gap: "4px", backgroundColor: C.bg3, borderRadius: "9px", padding: "3px" }}>
          {(["cartes", "liste", "kanban", "timeline"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? C.bgCard : "transparent", border: "none", borderRadius: "7px", padding: "6px 11px", fontSize: "11px", fontWeight: "700", color: view === v ? C.gold : C.t2, cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
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
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: C.red }}>Impossible de charger les projets.</span>
          <button onClick={load} style={{ background: "none", border: "none", color: C.red, fontSize: "12px", fontWeight: "800", cursor: "pointer", textDecoration: "underline" }}>Réessayer</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : isTrueEmpty ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: C.t1, marginBottom: "4px" }}>Aucun projet</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Les projets permettent de regrouper objectifs, tâches, documents et échéances au même endroit.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={openCreateForm}>+ Créer un projet</Button>
        </div>
      ) : isNoResults ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.t1, marginBottom: "4px" }}>Aucun résultat</div>
          <button onClick={resetFilters} style={{ color: C.gold, background: "none", border: "none", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Réinitialiser les filtres</button>
        </div>
      ) : view === "cartes" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map(p => (
            <ProjectCard key={p.id} C={C} projet={p} membres={membres} progress={computeProgress(tachesByProjet.get(p.id) ?? [])}
              onOpen={() => setQuickDrawerId(p.id)}/>
          ))}
        </div>
      ) : view === "liste" ? (
        <ProjectTable C={C} projets={filtered} membres={membres} tachesByProjet={tachesByProjet} onOpen={id => setQuickDrawerId(id)}/>
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
// Carte projet (item 3) — unité de travail complète en un coup d'œil.
// ─────────────────────────────────────────────────────────────────────────
function ProjectCard({ C, projet, membres, progress, onOpen }: {
  C: ThemeTokens; projet: Projet; membres: Membre[]; progress: { pct: number; total: number; termine: number; enRetard: number }; onOpen: () => void;
}) {
  const color = statutColor(projet.statut, C);
  const responsable = nomMembre(projet.responsable_membre_id, membres);
  const sante = santeInfo(projet.sante, C);
  return (
    <div onClick={onOpen} className="tap" style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, padding: "16px", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontSize: "14px", fontWeight: "800", color: C.t1 }}>{projet.nom}</span>
        {sante && <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: sante.color, flexShrink: 0 }} title={sante.label}/>}
      </div>
      {projet.description && <div style={{ color: C.t2, fontSize: "12px", marginBottom: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projet.description}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div style={{ flex: 1, height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress.pct}%`, backgroundColor: C.gold, borderRadius: "3px" }}/>
        </div>
        <span style={{ fontSize: "11px", fontWeight: 800, color: C.t1, flexShrink: 0 }}>{progress.pct}%</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
        {responsable && <span style={{ color: C.t2, fontSize: "11px", fontWeight: 700 }}>{responsable}</span>}
        {projet.date_fin_prevue && <span style={{ color: C.t3, fontSize: "11px" }}>{new Date(`${projet.date_fin_prevue}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
      </div>

      {progress.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", fontSize: "10.5px", color: C.t3 }}>
          <span>{progress.total} tâche{progress.total > 1 ? "s" : ""}</span>
          <span>{progress.termine} terminée{progress.termine > 1 ? "s" : ""}</span>
          {progress.enRetard > 0 && <span style={{ color: C.red, fontWeight: 700 }}>{progress.enRetard} en retard</span>}
        </div>
      )}

      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${color}15`, color, fontSize: "10px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: color }}/>{statutLabel(projet.statut)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Vue Liste (item 4) — portefeuille en un coup d'œil.
// ─────────────────────────────────────────────────────────────────────────
function ProjectTable({ C, projets, membres, tachesByProjet, onOpen }: {
  C: ThemeTokens; projets: Projet[]; membres: Membre[]; tachesByProjet: Map<string, Tache[]>; onOpen: (id: string) => void;
}) {
  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, overflowX: "auto" }}>
      <div style={{ minWidth: "620px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 100px 110px", gap: "8px", padding: "11px 16px", borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg3, color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          <span>Projet</span><span>Responsable</span><span>Progression</span><span>Échéance</span><span>Statut</span>
        </div>
        {projets.map((p, i) => {
          const progress = computeProgress(tachesByProjet.get(p.id) ?? []);
          const color = statutColor(p.statut, C);
          return (
            <div key={p.id} onClick={() => onOpen(p.id)} className="tap" style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 100px 110px", gap: "8px", alignItems: "center", padding: "11px 16px", borderBottom: i < projets.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 700, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</span>
              <span style={{ fontSize: "11.5px", color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomMembre(p.responsable_membre_id, membres) || "—"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ flex: 1, height: "5px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}><div style={{ height: "100%", width: `${progress.pct}%`, backgroundColor: C.gold }}/></div>
                <span style={{ fontSize: "10px", fontWeight: 700, color: C.t2, flexShrink: 0 }}>{progress.pct}%</span>
              </div>
              <span style={{ fontSize: "11.5px", color: C.t3 }}>{p.date_fin_prevue ? new Date(`${p.date_fin_prevue}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${color}15`, color, fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", width: "fit-content" }}>{statutLabel(p.statut)}</span>
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
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUTS_PROJET.length}, 1fr)`, gap: "12px", alignItems: "start" }}>
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
            style={{ backgroundColor: dragOverCol === col.value ? `${C.gold}0D` : C.bg3, borderRadius: "12px", padding: "10px", minHeight: "80px", border: `1px solid ${dragOverCol === col.value ? C.gold + "60" : "transparent"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px 10px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: statutColor(col.value, C) }}/>
              <span style={{ fontSize: "11.5px", fontWeight: "800", color: C.t1, letterSpacing: "0.3px" }}>{col.label.toUpperCase()}</span>
              <span style={{ color: C.t3, fontSize: "10px", fontWeight: "700" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map(p => {
                const verrouille = !peutGerer(p, moiId, moiRole);
                const progress = computeProgress(tachesByProjet.get(p.id) ?? []);
                return (
                  <div key={p.id} draggable={!verrouille} onDragStart={e => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => onOpen(p.id)} className="tap"
                    style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", cursor: verrouille ? "pointer" : "grab" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: C.t1, marginBottom: "8px" }}>{p.nom}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ flex: 1, height: "4px", borderRadius: "2px", backgroundColor: C.bg3, overflow: "hidden" }}><div style={{ height: "100%", width: `${progress.pct}%`, backgroundColor: C.gold }}/></div>
                      <span style={{ fontSize: "9.5px", fontWeight: 700, color: C.t3 }}>{progress.pct}%</span>
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
    months.push({ label: cur.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase(), left: ((cur.getTime() - rangeStart) / totalSpan) * 100 });
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "16px", overflowX: "auto" }}>
      <div style={{ minWidth: "560px" }}>
        <div style={{ position: "relative", height: "20px", marginBottom: "10px", borderBottom: `1px solid ${C.border}` }}>
          {months.map((m, i) => <span key={i} style={{ position: "absolute", left: `${m.left}%`, fontSize: "9.5px", fontWeight: 800, color: C.t3 }}>{m.label}</span>)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {withDates.map(p => {
            const s = new Date(p.date_debut || p.date_fin_prevue!).getTime();
            const e = new Date(p.date_fin_prevue || p.date_debut!).getTime();
            const left = ((s - rangeStart) / totalSpan) * 100;
            const width = Math.max(((e - s) / totalSpan) * 100, 1.5);
            const color = statutColor(p.statut, C);
            return (
              <div key={p.id} onClick={() => onOpen(p.id)} className="tap" style={{ position: "relative", height: "26px", cursor: "pointer" }}>
                <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", backgroundColor: `${color}25`, border: `1px solid ${color}`, borderRadius: "6px", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
                  <span style={{ fontSize: "10.5px", fontWeight: 700, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</span>
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
    return <div style={{ marginBottom: "12px" }}><div style={{ fontSize: "9.5px", fontWeight: "800", color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{title}</div><div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>{children}</div></div>;
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
  const OPTIONS: { value: SortKey; label: string }[] = [{ value: "echeance", label: "Échéance" }, { value: "progression", label: "Progression" }, { value: "nom", label: "Nom" }, { value: "recent", label: "Dernière modification" }];
  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, minWidth: "180px", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "6px", outline: "none" }}>
      {OPTIONS.map(o => (
        <button key={o.value} onClick={() => { onSelect(o.value); onClose(); }} style={{ display: "block", width: "100%", textAlign: "left", background: o.value === value ? `${C.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: o.value === value ? 800 : 500, color: o.value === value ? C.goldD : C.t1, cursor: "pointer" }}>{o.label}</button>
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

// ─────────────────────────────────────────────────────────────────────────
// B — Création / édition (item 14 : seul le nom est obligatoire). PC-first.
// ─────────────────────────────────────────────────────────────────────────
function ProjectForm({ C, form, onChange, onRequestClose, onSave, saving, membres }: {
  C: ThemeTokens; form: FormState; onChange: (patch: Partial<FormValues>) => void; onRequestClose: () => void;
  onSave: () => void; saving: boolean; membres: Membre[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, onRequestClose);

  const responsableBtnRef = useRef<HTMLButtonElement>(null);
  const debutBtnRef = useRef<HTMLButtonElement>(null);
  const cibleBtnRef = useRef<HTMLButtonElement>(null);
  const statutBtnRef = useRef<HTMLButtonElement>(null);
  const prioriteBtnRef = useRef<HTMLButtonElement>(null);
  const [openPicker, setOpenPicker] = useState<"resp" | "debut" | "cible" | "statut" | "priorite" | null>(null);

  const v = form.values;

  return (
    <>
      <div onClick={() => { if (openPicker) { setOpenPicker(null); return; } onRequestClose(); }} style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "24px", width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", outline: "none" }}>
          <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "14px" }}>{form.mode === "edit" ? "Modifier le projet" : "Nouveau projet"}</div>

          <input value={v.nom} onChange={e => onChange({ nom: e.target.value })} placeholder="Nom du projet" style={inputStyle(C)} autoFocus/>
          <textarea value={v.description} onChange={e => onChange({ description: e.target.value })} placeholder="Objectif du projet (optionnel)" rows={2} style={{ ...inputStyle(C), resize: "none" }}/>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <button ref={debutBtnRef} onClick={() => setOpenPicker(p => p === "debut" ? null : "debut")} style={fieldBtnStyle(C)}>{v.date_debut ? new Date(`${v.date_debut}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "Date de début"}</button>
            <button ref={cibleBtnRef} onClick={() => setOpenPicker(p => p === "cible" ? null : "cible")} style={fieldBtnStyle(C)}>{v.date_fin_prevue ? new Date(`${v.date_fin_prevue}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "Date cible"}</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: form.mode === "edit" ? "1fr 1fr 1fr" : "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
            <button ref={responsableBtnRef} onClick={() => setOpenPicker(p => p === "resp" ? null : "resp")} style={fieldBtnStyle(C)}>{v.responsable_membre_id ? nomMembre(v.responsable_membre_id, membres) : "Responsable"}</button>
            <button ref={prioriteBtnRef} onClick={() => setOpenPicker(p => p === "priorite" ? null : "priorite")} style={fieldBtnStyle(C)}>{prioriteLabel(v.priorite)}</button>
            {form.mode === "edit" && (
              <button ref={statutBtnRef} onClick={() => setOpenPicker(p => p === "statut" ? null : "statut")} style={fieldBtnStyle(C)}>{statutLabel(v.statut)}</button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onRequestClose}>Annuler</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!v.nom.trim()} loading={saving} onClick={onSave}>Enregistrer</Button>
          </div>
        </div>
      </div>

      <MemberPicker open={openPicker === "resp"} onClose={() => setOpenPicker(null)} anchorRef={responsableBtnRef} tokens={C} membres={membres} value={v.responsable_membre_id || null} onSelect={id => onChange({ responsable_membre_id: id || "" })}/>
      <DatePicker open={openPicker === "debut"} onClose={() => setOpenPicker(null)} anchorRef={debutBtnRef} tokens={C} value={v.date_debut || toISODate(new Date())} onSelect={d => onChange({ date_debut: d })}/>
      <DatePicker open={openPicker === "cible"} onClose={() => setOpenPicker(null)} anchorRef={cibleBtnRef} tokens={C} value={v.date_fin_prevue || toISODate(new Date())} onSelect={d => onChange({ date_fin_prevue: d })}/>
      <ProjectPriorityPicker open={openPicker === "priorite"} onClose={() => setOpenPicker(null)} anchorRef={prioriteBtnRef} tokens={C} value={v.priorite} onSelect={p => onChange({ priorite: p })}/>
      {form.mode === "edit" && (
        <ProjectStatusPicker open={openPicker === "statut"} onClose={() => setOpenPicker(null)} anchorRef={statutBtnRef} tokens={C} value={v.statut} onSelect={s => onChange({ statut: s })}/>
      )}
    </>
  );
}
