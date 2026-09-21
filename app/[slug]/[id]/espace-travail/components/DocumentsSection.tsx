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
import { YelenLoader } from "@/components/YelenLoader";
import { DOCUMENT_TRAVAIL_ACCEPTED_MIME, MAX_DOCUMENT_TRAVAIL_SIZE } from "@/lib/documentsTravail";
import {
  type DocumentTravail, type Membre, CATEGORIES_DOCUMENT_TRAVAIL,
  categorieLabel, formatTaille, fileTypeInfo, fileTypeLabel, nomMembre, peutGerer,
  useDialogA11y, CategoryPicker, DocumentDetailsPanel, DocumentPreviewDialog,
} from "./DocumentsOverlays";
import { type Projet, ProjectLinkPicker } from "./ProjetsOverlays";

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

  return (
    <div>
      <div style={{ marginBottom: "10px" }}>
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un document…" style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px 10px 34px", fontSize: "13px", color: C.t1, boxSizing: "border-box" }}/>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", flex: "1 1 auto" }}>
          <button onClick={() => setCategorie("tous")} style={{ flexShrink: 0, backgroundColor: categorie === "tous" ? `${C.gold}20` : C.bgCard, border: `1px solid ${categorie === "tous" ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "6px 12px", color: categorie === "tous" ? C.gold : C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>Tous</button>
          {CATEGORIES_DOCUMENT_TRAVAIL.map(c => (
            <button key={c.value} onClick={() => setCategorie(c.value)} style={{ flexShrink: 0, backgroundColor: categorie === c.value ? `${C.gold}20` : C.bgCard, border: `1px solid ${categorie === c.value ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "6px 12px", color: categorie === c.value ? C.gold : C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>{c.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button ref={filtersBtnRef} onClick={() => setFiltersOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>
            Filtrer{(filters.types.length + filters.creePar.length + (filters.date ? 1 : 0)) > 0 && <span style={{ backgroundColor: C.gold, color: "#000", fontSize: "9.5px", fontWeight: "800", borderRadius: "20px", padding: "1px 6px" }}>{filters.types.length + filters.creePar.length + (filters.date ? 1 : 0)}</span>}
          </button>
          <button ref={sortBtnRef} onClick={() => setSortOpen(v => !v)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>Trier</button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setUploadOpen(true)}>+ Ajouter</Button>
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
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: C.red }}>Impossible de charger les documents.</span>
          <button onClick={load} style={{ background: "none", border: "none", color: C.red, fontSize: "12px", fontWeight: "800", cursor: "pointer", textDecoration: "underline" }}>Réessayer</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : isTrueEmpty ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: C.t1, marginBottom: "4px" }}>Aucun document</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Centralisez ici les contrats, rapports, factures et autres documents de l&apos;institution.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setUploadOpen(true)}>+ Ajouter un document</Button>
        </div>
      ) : isNoResults ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.t1, marginBottom: "4px" }}>Aucun résultat</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "12px" }}>{search.trim() ? <>Aucun document ne correspond à « {search.trim()} ».</> : "Aucun document ne correspond à ces filtres."}</p>
          <button onClick={resetFilters} style={{ color: C.gold, background: "none", border: "none", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>{search.trim() ? "Effacer la recherche" : "Réinitialiser les filtres"}</button>
        </div>
      ) : (
        <DocumentList C={C} docs={filtered} membres={membres} projets={projets} moiId={moiId} moiRole={moiRole}
          sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort}
          onOpenDetails={setDetailsDoc} onChangeCategorie={changerCategorie}/>
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
function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
      {label}
      {active && <span style={{ fontSize: "9px" }}>{dir === "asc" ? "▲" : "▼"}</span>}
    </div>
  );
}

function DocumentList({ C, docs, membres, projets, moiId, moiRole, sortKey, sortDir, onToggleSort, onOpenDetails, onChangeCategorie }: {
  C: ThemeTokens; docs: DocumentTravail[]; membres: Membre[]; projets: Projet[]; moiId: string | null; moiRole: string | null;
  sortKey: SortKey; sortDir: "asc" | "desc"; onToggleSort: (k: SortKey) => void;
  onOpenDetails: (d: DocumentTravail) => void; onChangeCategorie: (id: string, c: string) => void;
}) {
  const [catPickerId, setCatPickerId] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, overflowX: "auto" }}>
      <div style={{ minWidth: "700px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px 150px 100px", gap: "8px", padding: "11px 16px", borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg3, color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          <SortHeader label="Document" active={sortKey === "nom"} dir={sortDir} onClick={() => onToggleSort("nom")}/>
          <SortHeader label="Catégorie" active={sortKey === "categorie"} dir={sortDir} onClick={() => onToggleSort("categorie")}/>
          <SortHeader label="Taille" active={sortKey === "taille"} dir={sortDir} onClick={() => onToggleSort("taille")}/>
          <SortHeader label="Ajouté par" active={sortKey === "membre"} dir={sortDir} onClick={() => onToggleSort("membre")}/>
          <SortHeader label="Date" active={sortKey === "date"} dir={sortDir} onClick={() => onToggleSort("date")}/>
        </div>
        {docs.map((d, i) => {
          const type = fileTypeInfo(d.type_mime, C);
          const auteur = nomMembre(d.membre_id, membres);
          const gerable = peutGerer(d, moiId, moiRole);
          const projet = d.projet_id ? projets.find(p => p.id === d.projet_id) : null;
          return (
            <div key={d.id} onClick={() => onOpenDetails(d)} className="tap" style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px 150px 100px", gap: "8px", alignItems: "center", padding: "11px 16px", borderBottom: i < docs.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "6px", backgroundColor: `${type.color}18`, color: type.color, fontSize: "7.5px", fontWeight: 800, flexShrink: 0 }}>{type.label}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: "700", color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</div>
                  {/* Projet en 2e ligne discrète, pas un badge de plus
                      (même principe que Tâches, revue finale item 3). */}
                  {projet ? <div style={{ color: C.goldD, fontSize: "10.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projet.nom}</div>
                    : d.description && <div style={{ color: C.t3, fontSize: "10.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</div>}
                </div>
              </div>
              <div>
                <button ref={el => { refs.current[d.id] = el; }} onClick={e => { e.stopPropagation(); if (gerable) setCatPickerId(d.id); }} disabled={!gerable} style={{ background: "none", border: "none", color: C.t2, fontSize: "11.5px", cursor: gerable ? "pointer" : "default", padding: 0, textAlign: "left" }}>{categorieLabel(d.categorie)}</button>
                <CategoryPicker open={catPickerId === d.id} onClose={() => setCatPickerId(null)} anchorRef={{ current: refs.current[d.id] ?? null }} tokens={C} value={d.categorie} onSelect={c => onChangeCategorie(d.id, c)}/>
              </div>
              <span style={{ color: C.t3, fontSize: "11.5px" }}>{formatTaille(d.taille)}</span>
              <span style={{ color: C.t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auteur || "—"}</span>
              <span style={{ color: C.t3, fontSize: "11.5px" }}>{new Date(d.uploaded_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
            </div>
          );
        })}
      </div>
    </div>
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
        <div style={{ fontSize: "9.5px", fontWeight: "800", color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{title}</div>
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
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItemState[]>([]);
  const [single, setSingle] = useState<{ nom: string; categorie: string; description: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const uploading = items.some(i => i.status === "upload" || i.status === "attente");

  function requestClose() { if (uploading) { setConfirmClose(true); return; } onClose(); }
  useDialogA11y(panelRef, !confirmClose, requestClose);

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

  if (confirmClose) {
    return (
      <ConfirmModal open onClose={() => setConfirmClose(false)} onConfirm={() => { items.forEach(i => i.xhr?.abort()); onClose(); }} tokens={toUiTokens(C)} level={1} danger
        title="Des envois sont en cours" description="Fermer maintenant annulera les fichiers pas encore terminés."
        confirmLabel="Fermer et annuler" cancelLabel="Continuer l'envoi"/>
    );
  }

  return (
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "24px", width: "100%", maxWidth: "500px", maxHeight: "86vh", overflowY: "auto", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", outline: "none" }}>
        <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "16px" }}>Ajouter un document</div>

        {items.length === 0 && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) pickFiles(e.dataTransfer.files); }}
            style={{ border: `1.5px dashed ${dragOver ? C.gold : C.border2}`, borderRadius: "14px", padding: "32px 20px", textAlign: "center", backgroundColor: dragOver ? `${C.gold}0D` : C.bg3, marginBottom: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: C.t1, marginBottom: "4px" }}>Glissez-déposez vos fichiers ici</div>
            <div style={{ fontSize: "11px", color: C.t3, marginBottom: "16px" }}>{ACCEPT_LABEL} · {MAX_SIZE_LABEL}</div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>Sélectionner des fichiers</Button>
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT_ATTR} style={{ display: "none" }} onChange={e => { if (e.target.files) pickFiles(e.target.files); e.target.value = ""; }}/>
          </div>
        )}

        {single && items.length === 1 && items[0].status === "attente" && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ color: C.t3, fontSize: "11px", marginBottom: "14px" }}>{items[0].file.name} · {formatTaille(items[0].file.size)}</div>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Nom du document</div>
            <input value={single.nom} onChange={e => setSingle(s => s ? { ...s, nom: e.target.value } : s)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "10px", color: C.t1, boxSizing: "border-box" }}/>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Catégorie</div>
            <select value={single.categorie} onChange={e => setSingle(s => s ? { ...s, categorie: e.target.value } : s)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", marginBottom: "10px", color: C.t1 }}>
              {CATEGORIES_DOCUMENT_TRAVAIL.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Note (optionnel)</div>
            <textarea value={single.description} onChange={e => setSingle(s => s ? { ...s, description: e.target.value } : s)} placeholder="Ajouter une note sur ce document…" rows={2} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", marginBottom: "16px", color: C.t1, resize: "none", boxSizing: "border-box" }}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => { setItems([]); setSingle(null); }}>Retirer</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!single.nom.trim()} onClick={envoyerSingle}>Envoyer</Button>
            </div>
          </div>
        )}

        {items.length > 0 && !(single && items.length === 1 && items[0].status === "attente") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
            {items.map(it => (
              <div key={it.id} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.file.name}</span>
                  {it.status === "termine" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                  {it.status === "upload" && <button onClick={() => cancelItem(it)} style={{ background: "none", border: "none", color: C.t3, fontSize: "10.5px", cursor: "pointer", flexShrink: 0 }}>Annuler</button>}
                </div>
                {(it.status === "upload" || it.status === "termine") && (
                  <div style={{ height: "5px", borderRadius: "3px", backgroundColor: C.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${it.progress}%`, backgroundColor: it.status === "termine" ? C.green : C.gold, borderRadius: "3px", transition: "width 0.15s ease" }}/>
                  </div>
                )}
                {it.status === "erreur" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: C.red, fontWeight: 600 }}>{it.error || "Erreur d'envoi"}</span>
                    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                      <button onClick={() => retry(it)} style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>Réessayer</button>
                      <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", color: C.t3, fontSize: "11px", cursor: "pointer" }}>Retirer</button>
                    </div>
                  </div>
                )}
                {it.status === "annule" && <span style={{ fontSize: "11px", color: C.t3 }}>Envoi annulé</span>}
              </div>
            ))}
            <button onClick={() => fileInputRef.current?.click()} style={{ alignSelf: "flex-start", background: "none", border: "none", color: C.gold, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>+ Ajouter d&apos;autres fichiers</button>
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT_ATTR} style={{ display: "none" }} onChange={e => { if (e.target.files) pickFiles(e.target.files); e.target.value = ""; }}/>
          </div>
        )}

        {(items.length === 0 || allDone) && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={onClose}>{allDone ? "Terminé" : "Fermer"}</Button>
        )}
      </div>
    </div>
  );
}
