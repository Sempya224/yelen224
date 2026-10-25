"use client";

// Briques présentationnelles de l'onglet Documents (refonte UI 20/10/2026).
// Aucune requête, aucun téléversement ici : DocumentsSection.tsx garde le
// chargement, le tri, les filtres, l'envoi XHR et toutes les mutations.
import { useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../../theme";
import { ClockSearchField, FilterChips } from "../../components/ClockInShiftUi";
import { heureDepuisHorodatage } from "@/lib/heure";

// ── Formatage d'affichage ────────────────────────────────────────────────
export function tailleFr(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`;
}
// Titre tout en majuscules → « Phrase » (affichage seulement, la donnée reste intacte).
export function titreAffiche(nom: string): string {
  const lettres = nom.replace(/[^\p{L}]/gu, "");
  if (lettres.length < 3 || nom !== nom.toUpperCase()) return nom;
  const minuscule = nom.toLowerCase();
  return minuscule.charAt(0).toUpperCase() + minuscule.slice(1);
}
export function dateDocument(iso: string): { court: string; complet: string } {
  const d = new Date(iso);
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return {
    court: d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", ...(memeAnnee ? {} : { year: "numeric" }) }),
    complet: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " à " + heureDepuisHorodatage(d),
  };
}
export function nomPropre(nom: string): string {
  return nom.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}
export function initiales(nom: string): string {
  const p = nom.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase();
}

export function DocsStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .dcx-table{display:block}
      .dcx-cards{display:none}
      @media(max-width:767px){.dcx-table{display:none}.dcx-cards{display:flex}}
      .dcx-row:hover{background-color:${C.bgCard2}}
      .dcx-row:focus-visible,.dcx-btn:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .dcx-drop:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      @media(prefers-reduced-motion:reduce){.dcx-row,.dcx-btn{transition:none!important}}
    `}</style>
  );
}

// ── Icône de type de fichier (une famille de teintes douces) ─────────────
export function FileTypeIcon({ C, type, taille = 36 }: { C: ThemeTokens; type: string; taille?: number }) {
  const couleur = type === "PDF" ? C.red : type === "XLS" ? C.green : type === "IMG" ? C.blue : type === "DOC" ? "#64748B" : C.t3;
  return (
    <span aria-hidden="true" style={{ width: `${taille}px`, height: `${taille}px`, borderRadius: "8px", flexShrink: 0, backgroundColor: `${couleur}1a`, border: `1px solid ${couleur}33`, color: couleur, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, boxSizing: "border-box" }}>
      {type}
    </span>
  );
}

// ── Barre d'outils ───────────────────────────────────────────────────────
const bouton = (C: ThemeTokens): React.CSSProperties => ({ height: "34px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "12.5px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" });

export function DocsToolbar({ C, search, onSearch, categorie, filtersRef, filtersCount, onFilters, sortRef, sortLabel, onSort, chips, onReset, aFiltre, total, onAdd }: {
  C: ThemeTokens; search: string; onSearch: (v: string) => void; categorie: React.ReactNode;
  filtersRef: RefObject<HTMLButtonElement | null>; filtersCount: number; onFilters: () => void;
  sortRef: RefObject<HTMLButtonElement | null>; sortLabel: string; onSort: () => void;
  chips: { key: string; label: string; onRemove: () => void }[]; onReset: () => void; aFiltre: boolean; total: number; onAdd: () => void;
}) {
  const ui = toUiTokens(C);
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px 16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <ClockSearchField C={C} value={search} onChange={onSearch} width={320} label="Rechercher un document" placeholder="Rechercher un document…"/>
          <div style={{ width: "210px", maxWidth: "100%" }}>{categorie}</div>
          <button ref={filtersRef} type="button" className="dcx-btn tap" aria-label="Filtrer" onClick={onFilters} style={bouton(C)}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filtrer
            {filtersCount > 0 && <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", backgroundColor: C.gold, color: "#000", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{filtersCount}</span>}
          </button>
          <button ref={sortRef} type="button" className="dcx-btn tap" aria-label={`Trier : ${sortLabel}`} onClick={onSort} style={bouton(C)}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/></svg>
            Trier : {sortLabel}
          </button>
          {aFiltre && <button type="button" className="dcx-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span aria-live="polite" style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{total} document{total > 1 ? "s" : ""}</span>
          <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onAdd}
            icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}>
            Ajouter
          </Button>
        </div>
      </div>
      <FilterChips C={C} chips={chips}/>
    </div>
  );
}

// ── Zone de dépôt (plusieurs fichiers) ───────────────────────────────────
export function DropArea({ C, accept, aide, onFichiers }: { C: ThemeTokens; accept: string; aide: string; onFichiers: (f: FileList | File[]) => void }) {
  const [survol, setSurvol] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const ouvrir = () => ref.current?.click();
  return (
    <div className="dcx-drop" role="button" tabIndex={0} aria-label="Zone de dépôt de fichiers : glissez-déposez ou appuyez sur Entrée pour sélectionner"
      onClick={e => { if ((e.target as HTMLElement).closest("button")) return; ouvrir(); }}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ouvrir(); } }}
      onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
      onDrop={e => { e.preventDefault(); setSurvol(false); if (e.dataTransfer.files) onFichiers(e.dataTransfer.files); }}
      style={{ minHeight: "160px", border: `1.5px dashed ${survol ? C.gold : C.border2}`, borderRadius: "12px", backgroundColor: survol ? `${C.gold}0d` : C.bgCard, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "20px", textAlign: "center", cursor: "pointer", boxSizing: "border-box" }}>
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>Glissez-déposez vos fichiers ici</div>
      <div style={{ color: C.t3, fontSize: "13px" }}>ou</div>
      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={ouvrir}>Sélectionner des fichiers</Button>
      <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{aide}</div>
      <input ref={ref} type="file" multiple accept={accept} hidden onChange={e => { if (e.target.files) onFichiers(e.target.files); e.target.value = ""; }}/>
    </div>
  );
}
