"use client";

// Documents de l'espace de travail — V3 "bibliothèque documentaire de
// l'institution" (refonte CEO, 20/09/2026, audit complet en amont — voir
// échange avec Bryan). Réutilise le modèle et l'API existants
// (documents_travail, bucket Storage privé "documents-travail",
// catégories réelles de lib/documentsTravail.ts) — seul ajout backend :
// route PATCH (validée avec Bryan, absente jusqu'ici, nécessaire pour que
// "Modifier" existe réellement) et un paramètre `preview` sur l'URL
// signée existante (fenêtre plus longue que le téléchargement, même
// validation).
//
// Pas de versioning/partage/déplacement/corbeille : aucun de ces éléments
// n'existe dans le modèle de données — omis plutôt que simulés (item 13/
// 15/21 du brief). Pas de vue grille : n'existait pas déjà (item 9 du
// brief la rend conditionnelle à son existence), la vue Liste reste la vue
// opérationnelle principale (item 8). Projet lié : `documents_travail.
// projet_id` ajouté lors du chantier Projets (20/09/2026) — visible ici
// (badge + filtre) depuis la revue finale du même jour, même correction
// que côté Tâches.
//
// Même discipline que Agenda/Tâches V3 : détails avant édition, suppression
// avec confirmation dédiée (et honnête — pas de corbeille, donc pas de
// promesse de restauration), garde "envois en cours" avant fermeture de
// la boîte d'import, PC-first sans aucune logique mobile.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DOCUMENT_TRAVAIL_ACCEPTED_MIME, MAX_DOCUMENT_TRAVAIL_SIZE } from "@/lib/documentsTravail";
import {
  type DocumentTravail, type Membre, CATEGORIES_DOCUMENT_TRAVAIL,
  categorieLabel, fileTypeLabel, nomMembre, peutGerer,
  useDialogA11y, CategoryPicker, DocumentDetailsPanel, DocumentPreviewDialog,
} from "./DocumentsOverlays";
import { type Projet, ProjectLinkPicker } from "./ProjetsOverlays";
import { DocsStyles, DocsToolbar, DropArea, FileTypeIcon, tailleFr, titreAffiche, dateDocument, nomPropre, initiales } from "./DocumentsUi";
import { TasksSkeleton, TasksMessage } from "./TachesUi";
import { ClockStyles, ClockModal, ModalField, champStyle, ComboField, StatusPill, RowActionsMenu } from "../../components/ClockInShiftUi";

type SortKey = "nom" | "categorie" | "taille" | "membre" | "date";
type DateBucket = "aujourdhui" | "semaine" | "mois" | "plus_ancien" | null;
type Filters = { types: string[]; creePar: string[]; date: DateBucket; projetId: string | null };
const EMPTY_FILTERS: Filters = { types: [], creePar: [], date: null, projetId: null };

const ACCEPT_ATTR = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png";
// Dérivé des mimes réellement acceptés (lib/documentsTravail.ts) plutôt
// qu'un texte en dur — jamais promettre un format que le serveur refuserait.
const MIME_SHORT: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};
const ACCEPT_LABEL = Array.from(new Set(DOCUMENT_TRAVAIL_ACCEPTED_MIME.map(m => MIME_SHORT[m] ?? m))).join(", ");
const MAX_SIZE_LABEL = `${Math.round(MAX_DOCUMENT_TRAVAIL_SIZE / (1024 * 1024))} Mo max`;

function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }

function dateBucketOf(d: DocumentTravail): Exclude<DateBucket, null> {
  const today = toISODate(new Date());
  const docDate = toISODate(new Date(d.uploaded_at));
  if (docDate === today) return "aujourdhui";
  const diffDays = Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${docDate}T00:00:00`).getTime()) / 86400000);
  if (diffDays < 7) return "semaine";
  if (diffDays < 31) return "mois";
  return "plus_ancien";
}

function matchesFilters(d: DocumentTravail, f: Filters): boolean {
  if (f.types.length > 0 && !f.types.includes(fileTypeLabel(d.type_mime))) return false;
  if (f.creePar.length > 0 && !(d.membre_id && f.creePar.includes(d.membre_id))) return false;
  if (f.date && dateBucketOf(d) !== f.date) return false;
  if (f.projetId && d.projet_id !== f.projetId) return false;
  return true;
}

function matchesSearch(d: DocumentTravail, q: string, membres: Membre[]): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const auteur = nomMembre(d.membre_id, membres) || "";
  return d.nom.toLowerCase().includes(needle) || (d.description || "").toLowerCase().includes(needle) || categorieLabel(d.categorie).toLowerCase().includes(needle) || auteur.toLowerCase().includes(needle);
}

// Upload via XMLHttpRequest (pas fetch) pour disposer d'une vraie
// progression par fichier (item 6 du brief) — fetch() n'expose aucun
// événement de progression d'upload. Réutilise l'unique route POST
// existante, une requête par fichier (le backend n'accepte qu'un fichier
// à la fois — pas de nouvelle route batch inventée).
function uploadFileXhr(file: File, meta: { nom: string; categorie: string; description: string }, onProgress: (pct: number) => void) {
  const xhr = new XMLHttpRequest();
  const fd = new FormData();
  fd.append("file", file);
  fd.append("nom", meta.nom);
  fd.append("categorie", meta.categorie);
  fd.append("description", meta.description);
  const promise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let body: { error?: string } | null = null;
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
      else resolve({ ok: false, error: body?.error || "Erreur d'envoi" });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Erreur réseau" });
    xhr.onabort = () => resolve({ ok: false, error: "Envoi annulé" });
    xhr.open("POST", "/api/institution/documents-travail");
    xhr.send(fd);
  });
  return { promise, xhr };
}

export function DocumentsSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [documents, setDocuments] = useState<DocumentTravail[]>([]);
  const [projets, setProjets] = useState<Projet[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [categorie, setCategorie] = useState<string>("tous");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailsDoc, setDetailsDoc] = useState<DocumentTravail | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentTravail | null>(null);
  const [editDoc, setEditDoc] = useState<DocumentTravail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentTravail | null>(null);

  const storageKey = `yelen224_documents_state_${instId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { search?: string; categorie?: string; filters?: Filters; sortKey?: SortKey; sortDir?: "asc" | "desc" };
      if (typeof saved.search === "string") setSearch(saved.search);
      if (saved.categorie) setCategorie(saved.categorie);
      if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters });
      if (saved.sortKey) setSortKey(saved.sortKey);
      if (saved.sortDir) setSortDir(saved.sortDir);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ search, categorie, filters, sortKey, sortDir })); } catch {}
  }, [search, categorie, filters, sortKey, sortDir, storageKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [res, pRes] = await Promise.all([fetch("/api/institution/documents-travail"), fetch("/api/institution/projets")]);
    if (!res.ok) { setLoadError(true); setDocuments([]); setLoading(false); return; }
    const j = await res.json().catch(() => null);
    const pJ = pRes.ok ? await pRes.json().catch(() => null) : null;
    setDocuments(j?.documents ?? []);
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

  const filtered = useMemo(() => {
    const list = documents
      .filter(d => categorie === "tous" || d.categorie === categorie)
      .filter(d => matchesFilters(d, filters))
      .filter(d => matchesSearch(d, search, membres));
    const dir = sortDir === "asc" ? 1 : -1;
    return list.slice().sort((a, b) => {
      switch (sortKey) {
        case "nom": return dir * a.nom.localeCompare(b.nom);
        case "categorie": return dir * a.categorie.localeCompare(b.categorie);
        case "taille": return dir * ((a.taille ?? 0) - (b.taille ?? 0));
        case "membre": return dir * (nomMembre(a.membre_id, membres) ?? "").localeCompare(nomMembre(b.membre_id, membres) ?? "");
        case "date": return dir * (new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
        default: return 0;
      }
    });
  }, [documents, categorie, filters, search, membres, sortKey, sortDir]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (categorie !== "tous") chips.push({ key: "cat", label: categorieLabel(categorie), onRemove: () => setCategorie("tous") });
    filters.types.forEach(t => chips.push({ key: `t-${t}`, label: t, onRemove: () => setFilters(f => ({ ...f, types: f.types.filter(x => x !== t) })) }));
    filters.creePar.forEach(id => { const n = nomMembre(id, membres); if (n) chips.push({ key: `c-${id}`, label: n, onRemove: () => setFilters(f => ({ ...f, creePar: f.creePar.filter(x => x !== id) })) }); });
    if (filters.date) {
      const labels: Record<string, string> = { aujourdhui: "Aujourd'hui", semaine: "Cette semaine", mois: "Ce mois", plus_ancien: "Plus ancien" };
      chips.push({ key: "date", label: labels[filters.date], onRemove: () => setFilters(f => ({ ...f, date: null })) });
    }
    if (filters.projetId) { const p = projets.find(p => p.id === filters.projetId); if (p) chips.push({ key: "proj", label: p.nom, onRemove: () => setFilters(f => ({ ...f, projetId: null })) }); }
    return chips;
  }, [categorie, filters, membres, projets]);

  function resetFilters() { setFilters(EMPTY_FILTERS); setCategorie("tous"); setSearch(""); }

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return; }
    setSortKey(key);
    setSortDir(key === "date" || key === "taille" ? "desc" : "asc");
  }

  async function telecharger(doc: DocumentTravail) {
    const res = await fetch(`/api/institution/documents-travail?download=${doc.id}`);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.url) { onToast("Erreur de téléchargement", C.red); return; }
    window.open(j.url, "_blank");
  }

  function requestDelete(d: DocumentTravail) {
    setDetailsDoc(null);
    setDeleteTarget(d);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/institution/documents-travail?id=${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    setDeleteTarget(null);
    onToast("Document supprimé", C.orange);
    load();
  }

  async function changerCategorie(id: string, cat: string) {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, categorie: cat } : d));
    const res = await fetch("/api/institution/documents-travail", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, categorie: cat }) });
    if (!res.ok) { onToast("Erreur — catégorie non enregistrée", C.red); load(); }
  }

  const isTrueEmpty = !loading && !loadError && documents.length === 0;
  const isNoResults = !loading && !loadError && documents.length > 0 && filtered.length === 0;

  const compteParCategorie = new Map<string, number>();
  for (const d of documents) compteParCategorie.set(d.categorie, (compteParCategorie.get(d.categorie) ?? 0) + 1);
  const aFiltre = activeFilterChips.length > 0 || search.trim() !== "";
  const SORT_LABELS: Record<SortKey, string> = { date: "Date", nom: "Nom", categorie: "Catégorie", taille: "Taille", membre: "Ajouté par" };

  return (
    <div>
      <ClockStyles C={C}/>
      <DocsStyles C={C}/>
      <DocsToolbar C={C} search={search} onSearch={setSearch}
        categorie={
          <ComboField C={C} id="docs-categorie" compact valeur={categorie === "tous" ? "" : categorie} onChange={v => setCategorie(v || "tous")} aucunLabel={`Toutes les catégories (${documents.length})`}
            options={CATEGORIES_DOCUMENT_TRAVAIL.map(c => ({ value: c.value, label: compteParCategorie.get(c.value) ? `${c.label} (${compteParCategorie.get(c.value)})` : c.label }))}/>
        }
        filtersRef={filtersBtnRef} filtersCount={filters.types.length + filters.creePar.length + (filters.date ? 1 : 0) + (filters.projetId ? 1 : 0)} onFilters={() => setFiltersOpen(v => !v)}
        sortRef={sortBtnRef} sortLabel={SORT_LABELS[sortKey]} onSort={() => setSortOpen(v => !v)}
        chips={activeFilterChips} onReset={resetFilters} aFiltre={aFiltre} total={filtered.length} onAdd={() => setUploadOpen(true)}/>

      {loadError && !loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px" }}>
          <span role="alert" style={{ fontSize: "13px", fontWeight: 500, color: C.red }}>Impossible de charger les documents.</span>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={load}>Réessayer</Button>
        </div>
      )}

      {loading ? (
        <TasksSkeleton label="Chargement des documents"/>
      ) : isTrueEmpty ? (
        <TasksMessage C={C} titre="Aucun document" texte={`Ajoutez vos contrats, factures et rapports. Formats acceptés : ${ACCEPT_LABEL} · ${MAX_SIZE_LABEL}.`} action={{ label: "+ Ajouter", onClick: () => setUploadOpen(true), primaire: true }}/>
      ) : isNoResults ? (
        <TasksMessage C={C} titre="Aucun résultat" texte={search.trim() ? `Aucun document ne correspond à « ${search.trim()} ».` : "Aucun document ne correspond à ces filtres."}
          action={{ label: search.trim() ? "Effacer la recherche" : "Réinitialiser", onClick: resetFilters }}/>
      ) : (
        <DocumentList C={C} docs={filtered} membres={membres} moiId={moiId} moiRole={moiRole}
          sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort}
          onOpenDetails={setDetailsDoc} onChangeCategorie={changerCategorie}
          onPreview={setPreviewDoc} onDownload={telecharger} onEdit={setEditDoc} onDelete={requestDelete}/>
      )}

      {filtersOpen && <DocFiltersPopover C={C} anchorRef={filtersBtnRef} onClose={() => setFiltersOpen(false)} filters={filters} setFilters={setFilters} membres={membres} projets={projets}/>}
      {sortOpen && <DocSortPopover C={C} anchorRef={sortBtnRef} onClose={() => setSortOpen(false)} sortKey={sortKey} sortDir={sortDir} onSelect={toggleSort}/>}

      {detailsDoc && (
        <DocumentDetailsPanel
          open={!!detailsDoc} onClose={() => setDetailsDoc(null)} doc={detailsDoc} membres={membres} projets={projets}
          peutGerer={peutGerer(detailsDoc, moiId, moiRole)}
          onPreview={() => setPreviewDoc(detailsDoc)}
          onDownload={() => telecharger(detailsDoc)}
          onEdit={() => { const d = detailsDoc; setDetailsDoc(null); setEditDoc(d); }}
          onDeleteRequest={() => requestDelete(detailsDoc)}
          C={C}
        />
      )}

      <DocumentPreviewDialog open={!!previewDoc} onClose={() => setPreviewDoc(null)} doc={previewDoc} C={C}/>

      {editDoc && (
        <DocumentEditDialog C={C} doc={editDoc} projets={projets} onClose={() => setEditDoc(null)} onToast={onToast} onSaved={() => { setEditDoc(null); load(); }}/>
      )}

      {uploadOpen && (
        <UploadDialog C={C} onClose={() => setUploadOpen(false)} onToast={onToast} onUploaded={load}/>
      )}

      {deleteTarget && (
        <ConfirmModal open onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} tokens={toUiTokens(C)} level={1} danger
          title="Supprimer ce document ?"
          consequences={[`« ${deleteTarget.nom} »`]}
          description="Cette action supprimera définitivement le document de cet espace."
          reversible={false}
          confirmLabel="Supprimer" cancelLabel="Annuler"/>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Vue Liste — table dense, colonnes réellement disponibles uniquement
// (item 8). Catégorie modifiable en un clic (popover), reste en lecture
// seule pour un document qu'on ne peut pas gérer.
// ─────────────────────────────────────────────────────────────────────────
function DocumentList({ C, docs, membres, moiId, moiRole, sortKey, sortDir, onToggleSort, onOpenDetails, onChangeCategorie, onPreview, onDownload, onEdit, onDelete }: {
  C: ThemeTokens; docs: DocumentTravail[]; membres: Membre[]; moiId: string | null; moiRole: string | null;
  sortKey: SortKey; sortDir: "asc" | "desc"; onToggleSort: (k: SortKey) => void;
  onOpenDetails: (d: DocumentTravail) => void; onChangeCategorie: (id: string, c: string) => void;
  onPreview: (d: DocumentTravail) => void; onDownload: (d: DocumentTravail) => void; onEdit: (d: DocumentTravail) => void; onDelete: (d: DocumentTravail) => void;
}) {
  const [catPickerId, setCatPickerId] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const COLS: { h: string; cle?: SortKey; right?: boolean; w?: string }[] = [
    { h: "Document", cle: "nom" }, { h: "Catégorie", cle: "categorie", w: "150px" }, { h: "Taille", cle: "taille", right: true, w: "96px" },
    { h: "Ajouté par", cle: "membre", w: "180px" }, { h: "Date", cle: "date", w: "140px" }, { h: "Actions", w: "72px", right: true },
  ];
  const actionsDe = (d: DocumentTravail, gerable: boolean) => [
    { label: "Aperçu", onClick: () => onPreview(d) },
    { label: "Télécharger", onClick: () => onDownload(d) },
    ...(gerable ? [{ label: "Modifier", onClick: () => onEdit(d) }, { label: "Supprimer", onClick: () => onDelete(d), danger: true }] : []),
  ];
  const ouvrir = (d: DocumentTravail) => (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenDetails(d); } };

  return (
    <>
      <div className="dcx-table" style={{ backgroundColor: C.bgCard, borderRadius: "12px", border: `1px solid ${C.border}`, overflow: "auto", maxHeight: "68svh" }}>
        <table style={{ width: "100%", minWidth: "860px", tableLayout: "fixed", borderCollapse: "collapse" }}>
          <colgroup>{COLS.map(c => <col key={c.h} style={{ width: c.w }}/>)}</colgroup>
          <thead>
            <tr>
              {COLS.map(c => (
                <th key={c.h} scope="col" aria-sort={c.cle && c.cle === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, textAlign: c.right ? "right" : "left", padding: "10px 14px", color: C.t2, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {c.cle ? (
                    <button type="button" className="dcx-btn tap" onClick={() => onToggleSort(c.cle!)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      {c.h}
                      {c.cle === sortKey && <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" fill="currentColor">{sortDir === "asc" ? <path d="M5 1l4 7H1z"/> : <path d="M5 9L1 2h8z"/>}</svg>}
                    </button>
                  ) : c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.map(d => {
              const type = fileTypeLabel(d.type_mime);
              const auteur = nomMembre(d.membre_id, membres);
              const gerable = peutGerer(d, moiId, moiRole);
              const dt = dateDocument(d.uploaded_at);
              const titre = titreAffiche(d.nom);
              const td = { padding: "0 14px", height: "64px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", overflow: "hidden" } as const;
              return (
                <tr key={d.id} role="row" tabIndex={0} className="dcx-row tap" onClick={() => onOpenDetails(d)} onKeyDown={ouvrir(d)} style={{ cursor: "pointer" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                      <FileTypeIcon C={C} type={type}/>
                      <div style={{ minWidth: 0 }}>
                        <div title={d.nom} style={{ fontSize: "14px", fontWeight: 500, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titre}</div>
                        {d.description && <div title={d.description} style={{ fontSize: "12px", color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    <button ref={el => { refs.current[d.id] = el; }} type="button" className="dcx-btn tap" aria-label={`Catégorie : ${categorieLabel(d.categorie)}${gerable ? ", modifier" : ""}`} disabled={!gerable}
                      onClick={e => { e.stopPropagation(); if (gerable) setCatPickerId(d.id); }} style={{ background: "none", border: "none", padding: 0, cursor: gerable ? "pointer" : "default" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", boxSizing: "border-box", backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t1, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>{categorieLabel(d.categorie)}</span>
                    </button>
                    <CategoryPicker open={catPickerId === d.id} onClose={() => setCatPickerId(null)} anchorRef={{ current: refs.current[d.id] ?? null }} tokens={C} value={d.categorie} onSelect={c => onChangeCategorie(d.id, c)}/>
                  </td>
                  <td style={{ ...td, textAlign: "right", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{tailleFr(d.taille)}</td>
                  <td style={td}>
                    {auteur ? (
                      <span title={auteur} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <span aria-hidden="true" style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initiales(auteur)}</span>
                        <span style={{ color: C.t1, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomPropre(auteur)}</span>
                      </span>
                    ) : <span style={{ color: C.t3, fontSize: "13px" }}>—</span>}
                  </td>
                  <td style={{ ...td, color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}><span title={dt.complet}>{dt.court}</span></td>
                  <td style={{ ...td, textAlign: "right" }}><RowActionsMenu C={C} label={`Actions pour ${titre}`} items={actionsDe(d, gerable)}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="dcx-cards" style={{ flexDirection: "column", gap: "10px" }}>
        {docs.map(d => {
          const type = fileTypeLabel(d.type_mime);
          const gerable = peutGerer(d, moiId, moiRole);
          const dt = dateDocument(d.uploaded_at);
          const titre = titreAffiche(d.nom);
          return (
            <div key={d.id} role="button" tabIndex={0} className="dcx-row tap" onClick={() => onOpenDetails(d)} onKeyDown={ouvrir(d)}
              style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <FileTypeIcon C={C} type={type}/>
                <div style={{ flex: 1, minWidth: 0, fontSize: "14px", fontWeight: 500, color: C.t1, overflowWrap: "anywhere" }}>{titre}</div>
                <RowActionsMenu C={C} label={`Actions pour ${titre}`} items={actionsDe(d, gerable)}/>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", marginTop: "10px", color: C.t2, fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
                <StatusPill label={categorieLabel(d.categorie)} color={C.t2}/>
                <span>{tailleFr(d.taille)}</span><span title={dt.complet}>{dt.court}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div aria-live="polite" style={{ color: C.t2, fontSize: "13px", marginTop: "10px", fontVariantNumeric: "tabular-nums" }}>1–{docs.length} sur {docs.length}</div>
    </>
  );
}

function DocFiltersPopover({ C, anchorRef, onClose, filters, setFilters, membres, projets }: {
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
  function CheckRow({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
    return (
      <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: "5px 4px", cursor: "pointer", textAlign: "left" }}>
        <div style={{ width: "14px", height: "14px", borderRadius: "4px", border: `1.5px solid ${checked ? C.gold : C.border2}`, backgroundColor: checked ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
        <span style={{ fontSize: "12px", color: C.t1 }}>{label}</span>
      </button>
    );
  }
  function toggleArr(arr: string[], v: string) { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, width: "250px", maxHeight: "400px", overflowY: "auto", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "12px", outline: "none" }}>
      <Section title="Type">
        {["PDF", "DOC", "XLS", "IMG"].map(t => <CheckRow key={t} checked={filters.types.includes(t)} label={t} onClick={() => setFilters(f => ({ ...f, types: toggleArr(f.types, t) }))}/>)}
      </Section>
      <Section title="Date d'ajout">
        {[{ v: "aujourdhui", l: "Aujourd'hui" }, { v: "semaine", l: "Cette semaine" }, { v: "mois", l: "Ce mois" }, { v: "plus_ancien", l: "Plus ancien" }].map(o => (
          <CheckRow key={o.v} checked={filters.date === o.v} label={o.l} onClick={() => setFilters(f => ({ ...f, date: f.date === o.v ? null : o.v as DateBucket }))}/>
        ))}
      </Section>
      {projets.length > 0 && (
        <Section title="Projet">
          {projets.map(p => <CheckRow key={p.id} checked={filters.projetId === p.id} label={p.nom} onClick={() => setFilters(f => ({ ...f, projetId: f.projetId === p.id ? null : p.id }))}/>)}
        </Section>
      )}
      <Section title="Créé par">
        {membres.map(m => <CheckRow key={m.id} checked={filters.creePar.includes(m.id)} label={`${m.prenom} ${m.nom}`} onClick={() => setFilters(f => ({ ...f, creePar: toggleArr(f.creePar, m.id) }))}/>)}
      </Section>
    </div>
  );
}

function DocSortPopover({ C, anchorRef, onClose, sortKey, sortDir, onSelect }: {
  C: ThemeTokens; anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void; sortKey: SortKey; sortDir: "asc" | "desc"; onSelect: (k: SortKey) => void;
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
  const OPTIONS: { value: SortKey; label: string }[] = [{ value: "date", label: "Date" }, { value: "nom", label: "Nom" }, { value: "categorie", label: "Catégorie" }, { value: "taille", label: "Taille" }, { value: "membre", label: "Ajouté par" }];
  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" style={{ position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px`, minWidth: "170px", zIndex: 400, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "6px", outline: "none" }}>
      {OPTIONS.map(o => (
        <button key={o.value} onClick={() => { onSelect(o.value); onClose(); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", background: o.value === sortKey ? `${C.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: o.value === sortKey ? 800 : 500, color: o.value === sortKey ? C.goldD : C.t1, cursor: "pointer" }}>
          {o.label}{o.value === sortKey && <span style={{ fontSize: "10px" }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modifier (item 9/12/14) — nom/catégorie/description uniquement, jamais
// le fichier lui-même (aucune route de remplacement de binaire).
// PC-first : dialogue centré, aucune logique mobile.
// ─────────────────────────────────────────────────────────────────────────
function DocumentEditDialog({ C, doc, projets, onClose, onSaved, onToast }: {
  C: ThemeTokens; doc: DocumentTravail; projets: Projet[]; onClose: () => void; onSaved: () => void; onToast: (msg: string, color?: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [nom, setNom] = useState(doc.nom);
  const [cat, setCat] = useState(doc.categorie);
  const [description, setDescription] = useState(doc.description || "");
  const [projetId, setProjetId] = useState<string | null>(doc.projet_id ?? null);
  const [saving, setSaving] = useState(false);
  const initial = useState(() => JSON.stringify({ nom: doc.nom, cat: doc.categorie, description: doc.description || "", projetId: doc.projet_id ?? null }))[0];
  const isDirty = JSON.stringify({ nom, cat, description, projetId }) !== initial;
  const [confirmClose, setConfirmClose] = useState(false);
  const projetBtnRef = useRef<HTMLButtonElement>(null);
  const [projetOpen, setProjetOpen] = useState(false);

  function requestClose() { if (isDirty) { setConfirmClose(true); return; } onClose(); }
  useDialogA11y(panelRef, !confirmClose, requestClose);

  async function enregistrer() {
    if (!nom.trim()) return;
    setSaving(true);
    const res = await fetch("/api/institution/documents-travail", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: doc.id, nom: nom.trim(), categorie: cat, description: description || null, projet_id: projetId }) });
    setSaving(false);
    if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
    onToast("Document modifié", C.green);
    onSaved();
  }

  if (confirmClose) {
    return (
      <ConfirmModal open onClose={() => setConfirmClose(false)} onConfirm={onClose} tokens={toUiTokens(C)} level={1} danger
        title="Modifications non enregistrées ?" description="Vos modifications seront perdues si vous quittez maintenant."
        confirmLabel="Quitter sans enregistrer" cancelLabel="Continuer l'édition"/>
    );
  }

  return (
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "24px", width: "100%", maxWidth: "460px", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", outline: "none" }}>
        <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "16px" }}>Modifier le document</div>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Nom</div>
        <input value={nom} onChange={e => setNom(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "12px", color: C.t1, boxSizing: "border-box" }}/>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Catégorie</div>
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", marginBottom: "12px", color: C.t1 }}>
          {CATEGORIES_DOCUMENT_TRAVAIL.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Description</div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", marginBottom: "12px", color: C.t1, resize: "none", boxSizing: "border-box" }}/>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Projet</div>
        <button ref={projetBtnRef} onClick={() => setProjetOpen(v => !v)} style={{ width: "100%", textAlign: "left", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "18px", color: C.t1, cursor: "pointer" }}>
          {projetId ? (projets.find(p => p.id === projetId)?.nom ?? "Projet") : "Aucun projet"}
        </button>
        <ProjectLinkPicker open={projetOpen} onClose={() => setProjetOpen(false)} anchorRef={projetBtnRef} tokens={C} projets={projets} value={projetId} onSelect={setProjetId}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={requestClose}>Annuler</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!nom.trim()} loading={saving} onClick={enregistrer}>Enregistrer</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ajouter (item 5/6/7) — glisser-déposer + sélection classique, contraintes
// affichées avant le choix des fichiers. Un seul fichier : flux existant
// conservé (nommer/catégoriser avant l'envoi, décision Bryan d'origine).
// Plusieurs fichiers : envoi immédiat de chacun (nom par défaut = nom de
// fichier, catégorie "Autre"), avec sa propre barre de progression — la
// classification fine se fait après coup via "Modifier" (c'est précisément
// pourquoi la route PATCH a été ajoutée).
// ─────────────────────────────────────────────────────────────────────────
type UploadItemState = { id: string; file: File; status: "attente" | "upload" | "termine" | "erreur" | "annule"; progress: number; error?: string; xhr?: XMLHttpRequest };

function UploadDialog({ C, onClose, onToast, onUploaded }: {
  C: ThemeTokens; onClose: () => void; onToast: (msg: string, color?: string) => void; onUploaded: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItemState[]>([]);
  const [single, setSingle] = useState<{ nom: string; categorie: string; description: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const uploading = items.some(i => i.status === "upload" || i.status === "attente");

  function requestClose() { if (uploading) { setConfirmClose(true); return; } onClose(); }

  function pickFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    if (arr.length === 1 && items.length === 0) {
      // Flux existant préservé : nommer/catégoriser avant l'envoi.
      const f = arr[0];
      if (f.size > MAX_DOCUMENT_TRAVAIL_SIZE) { onToast(`Fichier trop volumineux (${MAX_SIZE_LABEL})`, C.red); return; }
      setSingle({ nom: f.name.replace(/\.[^/.]+$/, ""), categorie: "autre", description: "" });
      setItems([{ id: crypto.randomUUID(), file: f, status: "attente", progress: 0 }]);
      return;
    }
    const newItems: UploadItemState[] = arr.map(f => ({ id: crypto.randomUUID(), file: f, status: f.size > MAX_DOCUMENT_TRAVAIL_SIZE ? "erreur" : "attente", progress: 0, error: f.size > MAX_DOCUMENT_TRAVAIL_SIZE ? `Fichier trop volumineux (${MAX_SIZE_LABEL})` : undefined }));
    setSingle(null);
    setItems(prev => [...prev, ...newItems]);
    newItems.filter(i => i.status === "attente").forEach(i => startUpload(i, { nom: i.file.name.replace(/\.[^/.]+$/, ""), categorie: "autre", description: "" }));
  }

  function startUpload(item: UploadItemState, meta: { nom: string; categorie: string; description: string }) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "upload", progress: 0, error: undefined } : i));
    const { promise, xhr } = uploadFileXhr(item.file, meta, pct => setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: pct } : i)));
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, xhr } : i));
    promise.then(res => {
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "termine", progress: 100 } : i));
        onUploaded();
      } else {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: i.status === "annule" ? "annule" : "erreur", error: res.error } : i));
      }
    });
  }

  function retry(item: UploadItemState) {
    startUpload(item, single && items.length === 1 ? single : { nom: item.file.name.replace(/\.[^/.]+$/, ""), categorie: "autre", description: "" });
  }
  function cancelItem(item: UploadItemState) {
    item.xhr?.abort();
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "annule" } : i));
  }
  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    if (items.length <= 1) setSingle(null);
  }

  function envoyerSingle() {
    if (!single || items.length !== 1) return;
    if (!single.nom.trim()) return;
    startUpload(items[0], single);
  }

  const allDone = items.length > 0 && items.every(i => i.status === "termine" || i.status === "erreur" || i.status === "annule");
  const singleEnAttente = !!single && items.length === 1 && items[0].status === "attente";
  const ui = toUiTokens(C);

  if (confirmClose) {
    return (
      <ConfirmModal open onClose={() => setConfirmClose(false)} onConfirm={() => { items.forEach(i => i.xhr?.abort()); onClose(); }} tokens={toUiTokens(C)} level={1} danger
        title="Des envois sont en cours" description="Fermer maintenant annulera les fichiers pas encore terminés."
        confirmLabel="Fermer et annuler" cancelLabel="Continuer l'envoi"/>
    );
  }

  const actions = items.length === 0 ? (
    <>
      <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={requestClose}>Annuler</Button>
      <Button tokens={ui} className="tap" variant="primary" size="md" disabled>Ajouter</Button>
    </>
  ) : singleEnAttente ? (
    <>
      <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => { setItems([]); setSingle(null); }}>Retirer</Button>
      <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!single?.nom.trim()} onClick={envoyerSingle}>Ajouter</Button>
    </>
  ) : allDone ? (
    <Button tokens={ui} className="tap" variant="primary" size="md" onClick={onClose}>Terminer</Button>
  ) : (
    <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={requestClose}>Fermer</Button>
  );
  const aide = items.length === 0 ? "Sélectionnez au moins un fichier." : singleEnAttente ? (!single?.nom.trim() ? "Renseignez le titre du document." : undefined) : allDone ? undefined : "Envoi en cours…";

  return (
    <ClockModal C={C} titre="Ajouter un document" sousTitre="Téléversez un ou plusieurs fichiers." labelId="document-modal-titre" largeur={560}
      onClose={requestClose} modifie={false} aide={aide} actions={actions}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {items.length === 0 && <DropArea C={C} accept={ACCEPT_ATTR} aide={`${ACCEPT_LABEL} · ${MAX_SIZE_LABEL}`} onFichiers={pickFiles}/>}

        {singleEnAttente && single && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: "10px" }}>
              <FileTypeIcon C={C} type={fileTypeLabel(items[0].file.type)}/>
              <div style={{ minWidth: 0 }}>
                <div title={items[0].file.name} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{items[0].file.name}</div>
                <div style={{ color: C.t3, fontSize: "12px" }}>{tailleFr(items[0].file.size)}</div>
              </div>
            </div>
            <ModalField C={C} id="document-titre" label="Titre" requis>
              <input id="document-titre" data-autofocus className="cix-input" value={single.nom} onChange={e => setSingle(s => s ? { ...s, nom: e.target.value } : s)} style={champStyle(C)}/>
            </ModalField>
            <ModalField C={C} id="document-categorie" label="Catégorie">
              <ComboField C={C} id="document-categorie" sansAucun valeur={single.categorie} onChange={v => setSingle(s => s ? { ...s, categorie: v } : s)}
                options={CATEGORIES_DOCUMENT_TRAVAIL.map(c => ({ value: c.value, label: c.label }))}/>
            </ModalField>
            <ModalField C={C} id="document-note" label="Description" optionnel>
              <textarea id="document-note" className="cix-input" rows={3} value={single.description} onChange={e => setSingle(s => s ? { ...s, description: e.target.value } : s)} placeholder="Ajouter une note sur ce document…"
                style={{ ...champStyle(C), height: "auto", minHeight: "88px", padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}/>
            </ModalField>
          </>
        )}

        {items.length > 0 && !singleEnAttente && (
          <>
            <ul aria-live="polite" style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${C.border}`, borderRadius: "10px" }}>
              {items.map((it, i) => (
                <li key={it.id} style={{ padding: "10px 12px", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <FileTypeIcon C={C} type={fileTypeLabel(it.file.type)} taille={32}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={it.file.name} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.file.name}</div>
                      <div style={{ color: it.status === "erreur" ? C.red : it.status === "termine" ? C.green : C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                        {tailleFr(it.file.size)} · {it.status === "attente" ? "En attente" : it.status === "upload" ? `Envoi ${it.progress} %` : it.status === "termine" ? "Terminé" : it.status === "annule" ? "Envoi annulé" : (it.error || "Erreur d'envoi")}
                      </div>
                    </div>
                    {it.status === "erreur" && <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => retry(it)}>Réessayer</Button>}
                    {(it.status === "upload" || it.status === "erreur" || it.status === "annule") && (
                      <button type="button" className="dcx-btn tap" aria-label={it.status === "upload" ? `Annuler l'envoi de ${it.file.name}` : `Retirer ${it.file.name}`} onClick={() => (it.status === "upload" ? cancelItem(it) : removeItem(it.id))}
                        style={{ width: "28px", height: "28px", background: "none", border: "none", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                    {it.status === "termine" && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  {(it.status === "upload" || it.status === "termine") && (
                    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={it.progress} style={{ height: "4px", borderRadius: "2px", backgroundColor: C.bg3, overflow: "hidden", marginTop: "8px" }}>
                      <div style={{ height: "100%", width: `${it.progress}%`, backgroundColor: it.status === "termine" ? C.green : C.gold, borderRadius: "2px", transition: "width 0.15s ease" }}/>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="dcx-btn tap" onClick={() => fileInputRef.current?.click()} style={{ alignSelf: "flex-start", background: "none", border: "none", color: C.t1, fontSize: "13px", fontWeight: 500, textDecoration: "underline", cursor: "pointer", padding: 0 }}>+ Ajouter d&apos;autres fichiers</button>
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT_ATTR} hidden onChange={e => { if (e.target.files) pickFiles(e.target.files); e.target.value = ""; }}/>
          </>
        )}
      </div>
    </ClockModal>
  );
}
