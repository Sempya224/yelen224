"use client";

// Notes de l'espace de travail — V3 "centre de connaissance opérationnelle"
// (refonte CEO, 20/09/2026, audit complet en amont — voir échange avec
// Bryan). Réutilise le modèle existant (5 types réels) + les ajouts
// validés le 20/09/2026 : tags, projet_id, document_ids sur notes.
//
// Pas de niveaux de partage (Privée/Équipe/Institution), pas de Favoris,
// pas de commentaires, pas de collaboration temps réel, pas d'historique
// de versions — aucun de ces éléments n'existe dans le modèle de données
// ni l'infrastructure Yelen actuelle, et le brief demande explicitement de
// ne rien simuler (items 14/15/16/17/22). Le comportement actuel (lecture
// ouverte à toute l'équipe, écriture auteur/admin) reste inchangé.
//
// Même discipline que Agenda/Tâches/Documents/Projets V3 : recherche/
// filtres/tri persistants, PC-first, états loading/empty/no-results/error
// honnêtes. L'éditeur (NoteEditor.tsx) gère l'autosave et la garde
// "modifications non enregistrées".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { type Projet } from "./ProjetsOverlays";
import { type DocumentTravail } from "./DocumentsOverlays";
import {
  type Note, type Membre, TYPES_NOTE, typeColor, typeLabel, nomMembre, peutGerer, parseContenu, blocksPreview,
} from "./NotesOverlays";
import { useDialogA11y } from "./AgendaOverlays";
import { NoteEditor } from "./NoteEditor";
import { NotesStyles, NoteCardView, NotesSkeleton } from "./NotesUi";
import { TasksToolbar, TasksMessage } from "./TachesUi";
import { ClockStyles } from "../../components/ClockInShiftUi";

type TabKey = "toutes" | "recentes" | "mes";
type SortKey = "recent" | "titre" | "cree";
type Filters = { types: string[]; tags: string[]; projetId: string | null; creePar: string[] };
const EMPTY_FILTERS: Filters = { types: [], tags: [], projetId: null, creePar: [] };

const TABS: { value: TabKey; label: string }[] = [
  { value: "toutes", label: "Toutes" },
  { value: "recentes", label: "Récentes" },
  { value: "mes", label: "Mes notes" },
];

const SORTS: { value: SortKey; label: string }[] = [{ value: "recent", label: "Dernière modification" }, { value: "cree", label: "Date de création" }, { value: "titre", label: "Titre" }];

function toggleArr(arr: string[], v: string): string[] { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

function matchesTab(n: Note, tab: TabKey, moiId: string | null): boolean {
  if (tab === "mes") return n.membre_id === moiId;
  if (tab === "recentes") return (Date.now() - new Date(n.updated_at).getTime()) < 7 * 86400000;
  return true;
}
function matchesFilters(n: Note, f: Filters): boolean {
  if (f.types.length > 0 && !f.types.includes(n.type)) return false;
  if (f.tags.length > 0 && !f.tags.some(t => n.tags.includes(t))) return false;
  if (f.projetId && n.projet_id !== f.projetId) return false;
  if (f.creePar.length > 0 && !(n.membre_id && f.creePar.includes(n.membre_id))) return false;
  return true;
}
function matchesSearch(n: Note, q: string, membres: Membre[]): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const auteur = nomMembre(n.membre_id, membres) || "";
  const preview = blocksPreview(parseContenu(n.contenu));
  return n.titre.toLowerCase().includes(needle) || preview.toLowerCase().includes(needle) || n.tags.some(t => t.toLowerCase().includes(needle)) || typeLabel(n.type).toLowerCase().includes(needle) || auteur.toLowerCase().includes(needle);
}

export function NotesSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [notes, setNotes] = useState<Note[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [projets, setProjets] = useState<Projet[]>([]);
  const [documents, setDocuments] = useState<DocumentTravail[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("toutes");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);

  const [openNoteId, setOpenNoteId] = useState<string | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  const storageKey = `yelen224_notes_state_${instId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { search?: string; tab?: TabKey; filters?: Filters; sortKey?: SortKey };
      if (typeof saved.search === "string") setSearch(saved.search);
      if (saved.tab) setTab(saved.tab);
      if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters });
      if (saved.sortKey) setSortKey(saved.sortKey);
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ search, tab, filters, sortKey })); } catch {}
  }, [search, tab, filters, sortKey, storageKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [nRes, pRes, dRes] = await Promise.all([
      fetch("/api/institution/notes"),
      fetch("/api/institution/projets"),
      fetch("/api/institution/documents-travail"),
    ]);
    if (!nRes.ok) { setLoadError(true); setNotes([]); setLoading(false); return; }
    const nJ = await nRes.json().catch(() => null);
    const pJ = pRes.ok ? await pRes.json().catch(() => null) : null;
    const dJ = dRes.ok ? await dRes.json().catch(() => null) : null;
    setNotes(nJ?.notes ?? []);
    setProjets(pJ?.projets ?? []);
    setDocuments(dJ?.documents ?? []);
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

  const filtered = useMemo(() => {
    return notes
      .filter(n => matchesTab(n, tab, moiId))
      .filter(n => matchesFilters(n, filters))
      .filter(n => matchesSearch(n, search, membres))
      .slice()
      .sort((a, b) => {
        if (sortKey === "titre") return a.titre.localeCompare(b.titre, "fr");
        if (sortKey === "cree") return b.created_at.localeCompare(a.created_at);
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [notes, tab, filters, search, membres, sortKey]);

  const allTags = useMemo(() => Array.from(new Set(notes.flatMap(n => n.tags))).sort(), [notes]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    filters.types.forEach(t => chips.push({ key: `t-${t}`, label: typeLabel(t), onRemove: () => setFilters(f => ({ ...f, types: f.types.filter(x => x !== t) })) }));
    filters.tags.forEach(t => chips.push({ key: `tag-${t}`, label: `#${t}`, onRemove: () => setFilters(f => ({ ...f, tags: f.tags.filter(x => x !== t) })) }));
    if (filters.projetId) { const p = projets.find(p => p.id === filters.projetId); if (p) chips.push({ key: "proj", label: p.nom, onRemove: () => setFilters(f => ({ ...f, projetId: null })) }); }
    filters.creePar.forEach(id => { const n = nomMembre(id, membres); if (n) chips.push({ key: `c-${id}`, label: n, onRemove: () => setFilters(f => ({ ...f, creePar: f.creePar.filter(x => x !== id) })) }); });
    return chips;
  }, [filters, membres, projets]);

  function resetFilters() { setFilters(EMPTY_FILTERS); setSearch(""); setTab("toutes"); }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/institution/notes?id=${deleteTarget.id}`, { method: "DELETE" });
    onToast("Note supprimée", C.orange);
    setDeleteTarget(null);
    load();
  }

  const isTrueEmpty = !loading && !loadError && notes.length === 0;
  const isNoResults = !loading && !loadError && notes.length > 0 && filtered.length === 0;

  if (openNoteId) {
    return (
      <NoteEditor
        noteId={openNoteId}
        note={openNoteId === "new" ? null : notes.find(n => n.id === openNoteId) ?? null}
        membres={membres} projets={projets} documents={documents} moiId={moiId} moiRole={moiRole}
        onBack={() => setOpenNoteId(null)}
        onCreated={id => setOpenNoteId(id)}
        onToast={onToast}
        onChanged={load}
        C={C}
      />
    );
  }

  const tabsDef = TABS.map(t => ({ key: t.value, label: t.label, count: notes.filter(n => matchesTab(n, t.value, moiId)).length }));
  const aFiltre = activeFilterChips.length > 0 || search.trim() !== "" || tab !== "toutes";

  return (
    <div>
      <ClockStyles C={C}/>
      <NotesStyles C={C}/>
      <TasksToolbar C={C} unite="note" nouveauLabel="Nouvelle note" tabs={tabsDef} tab={tab} onTab={k => { const t = TABS.find(x => x.value === k); if (t) setTab(t.value); }} onNew={() => setOpenNoteId("new")}
        search={search} onSearch={setSearch}
        filtersRef={filtersBtnRef} filtersCount={activeFilterChips.length} onFilters={() => setFiltersOpen(v => !v)}
        sortRef={sortBtnRef} sortLabel={SORTS.find(o => o.value === sortKey)?.label ?? ""} onSort={() => setSortOpen(v => !v)}
        chips={activeFilterChips} onReset={resetFilters} aFiltre={aFiltre} total={filtered.length}/>

      {loadError && !loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px" }}>
          <span role="alert" style={{ fontSize: "13px", fontWeight: 500, color: C.red }}>Impossible de charger les notes.</span>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={load}>Réessayer</Button>
        </div>
      )}

      {loading ? (
        <NotesSkeleton/>
      ) : isTrueEmpty ? (
        <TasksMessage C={C} titre="Aucune note" texte="Conservez ici les idées, décisions, réunions et connaissances importantes de votre institution."
          icone={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>}
          action={{ label: "+ Nouvelle note", onClick: () => setOpenNoteId("new"), primaire: true }}/>
      ) : isNoResults ? (
        <TasksMessage C={C} titre="Aucun résultat" texte={search.trim() ? `Aucune note ne correspond à « ${search.trim()} ».` : "Aucune note ne correspond à ces filtres."} action={{ label: "Réinitialiser", onClick: resetFilters }}/>
      ) : (
        <div className="nt-grid">
          {filtered.map(n => (
            <NoteCardView key={n.id} C={C} note={n} preview={blocksPreview(parseContenu(n.contenu))} projet={n.projet_id ? projets.find(p => p.id === n.projet_id) : null} membres={membres}
              onOpen={() => setOpenNoteId(n.id)}
              actions={[{ label: "Ouvrir", onClick: () => setOpenNoteId(n.id) }, ...(peutGerer(n, moiId, moiRole) ? [{ label: "Supprimer", onClick: () => setDeleteTarget(n), danger: true }] : [])]}/>
          ))}
        </div>
      )}

      {filtersOpen && <FiltersPopover C={C} anchorRef={filtersBtnRef} onClose={() => setFiltersOpen(false)} filters={filters} setFilters={setFilters} membres={membres} projets={projets} allTags={allTags}/>}
      {deleteTarget && (
        <ConfirmModal open onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} tokens={toUiTokens(C)} level={1} danger
          title="Supprimer cette note ?" consequences={[`« ${deleteTarget.titre} »`]}
          description="Cette action supprimera cette note selon les règles de conservation de votre espace."
          reversible={false} confirmLabel="Supprimer" cancelLabel="Annuler"/>
      )}
      {sortOpen && <SortPopover C={C} anchorRef={sortBtnRef} onClose={() => setSortOpen(false)} value={sortKey} onSelect={setSortKey}/>}
    </div>
  );
}

function FiltersPopover({ C, anchorRef, onClose, filters, setFilters, membres, projets, allTags }: {
  C: ThemeTokens; anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void; filters: Filters; setFilters: (f: Filters | ((f: Filters) => Filters)) => void; membres: Membre[]; projets: Projet[]; allTags: string[];
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
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, width: "250px", maxHeight: "420px", overflowY: "auto", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "12px", outline: "none" }}>
      <Section title="Type">{TYPES_NOTE.map(t => <CheckRow key={t.value} checked={filters.types.includes(t.value)} label={t.label} color={typeColor(t.value, C)} onClick={() => setFilters(f => ({ ...f, types: toggleArr(f.types, t.value) }))}/>)}</Section>
      {allTags.length > 0 && <Section title="Tags">{allTags.map(t => <CheckRow key={t} checked={filters.tags.includes(t)} label={`#${t}`} onClick={() => setFilters(f => ({ ...f, tags: toggleArr(f.tags, t) }))}/>)}</Section>}
      {projets.length > 0 && (
        <Section title="Projet">
          {projets.map(p => <CheckRow key={p.id} checked={filters.projetId === p.id} label={p.nom} onClick={() => setFilters(f => ({ ...f, projetId: f.projetId === p.id ? null : p.id }))}/>)}
        </Section>
      )}
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
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, minWidth: "190px", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "6px", outline: "none" }}>
      {OPTIONS.map(o => (
        <button key={o.value} onClick={() => { onSelect(o.value); onClose(); }} style={{ display: "block", width: "100%", textAlign: "left", background: o.value === value ? `${C.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: o.value === value ? 800 : 500, color: o.value === value ? C.goldD : C.t1, cursor: "pointer" }}>{o.label}</button>
      ))}
    </div>
  );
}
