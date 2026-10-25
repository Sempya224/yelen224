"use client";

// Briques présentationnelles de l'onglet Notes (refonte UI 20/10/2026).
// Aucune requête ni règle métier : NotesSection.tsx et NoteEditor.tsx gardent
// le chargement, l'autosave, les blocs et les mutations.
import { type ThemeTokens } from "../../theme";
import { nomPropre, RowActionsMenu } from "../../components/ClockInShiftUi";
import { type Note, type Membre, typeColor, typeLabel, nomMembre } from "./NotesOverlays";
import { type Projet } from "./ProjetsOverlays";
import { heureDepuisHorodatage } from "@/lib/heure";

export function NotesStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .nt-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
      @media(min-width:768px){.nt-grid{grid-template-columns:repeat(2,minmax(0,420px))}}
      @media(min-width:1280px){.nt-grid{grid-template-columns:repeat(3,minmax(0,420px))}}
      .nt-card{transition:border-color .15s ease}
      .nt-card:hover{border-color:${C.border2}!important}
      .nt-card:focus-visible,.nt-btn:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .nt-title{border:none;border-bottom:2px solid transparent;border-radius:0;outline:none;background:none}
      .nt-title:focus{border-bottom-color:${C.gold}}
      .nt-title::placeholder{color:${C.t3}}
      .nt-zone:focus-within{border-color:${C.border2}}
      .nt-top{position:sticky;top:0;z-index:5;background-color:${C.bg};padding:10px 0;margin-bottom:12px}
      .nt-crumb{display:flex}
      @media(max-width:767px){.nt-crumb{display:none}.nt-lbl{display:none}}
      @media(prefers-reduced-motion:reduce){.nt-card{transition:none!important}}
    `}</style>
  );
}

export function dateNote(iso: string): string {
  const d = new Date(iso);
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(memeAnnee ? {} : { year: "numeric" }) });
}

// Une famille de teintes douces : fond tinté + texte foncé + bordure fine.
export function TypeBadge({ C, type }: { C: ThemeTokens; type: string }) {
  const c = typeColor(type, C);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${c}1c`, border: `1px solid ${c}40`, color: C.t1, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", gap: "6px" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: c }}/>{typeLabel(type)}
    </span>
  );
}

function Avatar20({ C, texte }: { C: ThemeTokens; texte: string }) {
  return <span aria-hidden="true" style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "9px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{texte}</span>;
}

export function NoteCardView({ C, note, preview, projet, membres, onOpen, actions }: {
  C: ThemeTokens; note: Note; preview: string; projet: Projet | null | undefined; membres: Membre[]; onOpen: () => void;
  actions: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const auteur = nomMembre(note.membre_id, membres);
  const ini = auteur ? auteur.split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join("").toUpperCase() : "";
  return (
    <div role="button" tabIndex={0} className="nt-card tap" onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
      style={{ backgroundColor: C.bgCard, borderRadius: "12px", border: `1px solid ${C.border}`, padding: "20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "12px", boxSizing: "border-box", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <TypeBadge C={C} type={note.type}/>
        <RowActionsMenu C={C} label={`Actions pour ${note.titre}`} items={actions}/>
      </div>
      <h3 title={note.titre} style={{ margin: 0, color: C.t1, fontSize: "16px", fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{note.titre}</h3>
      {preview && <p style={{ margin: 0, color: C.t2, fontSize: "13px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{preview}</p>}
      {(projet || note.tags.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {projet && <span title={projet.nom} style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", height: "22px", lineHeight: "20px", padding: "0 8px", borderRadius: "6px", border: `1px solid ${C.border2}`, color: C.t2, fontSize: "12px", boxSizing: "border-box" }}>{projet.nom}</span>}
          {note.tags.slice(0, 3).map(t => <span key={t} style={{ height: "22px", lineHeight: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: C.bg3, color: C.t2, fontSize: "12px" }}>#{t}</span>)}
          {note.tags.length > 3 && <span style={{ lineHeight: "22px", color: C.t3, fontSize: "12px" }}>+{note.tags.length - 3}</span>}
        </div>
      )}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px", paddingTop: "12px", borderTop: `1px solid ${C.border}`, color: C.t3, fontSize: "12px" }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>Modifiée le {dateNote(note.updated_at)}</span>
        {auteur && <span title={auteur} style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t2, minWidth: 0 }}><Avatar20 C={C} texte={ini}/><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomPropre(auteur)}</span></span>}
      </div>
    </div>
  );
}

export function NotesSkeleton() {
  return (
    <div role="status" aria-label="Chargement des notes" className="nt-grid">
      {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="cix-skel" style={{ height: "200px", borderRadius: "12px" }}/>)}
    </div>
  );
}

// ── Éditeur ──────────────────────────────────────────────────────────────
export type SaveState = "attente" | "enregistrement" | "enregistre" | "erreur";
export function SaveIndicator({ C, status, dirty, savedAt, onRetry }: { C: ThemeTokens; status: SaveState; dirty: boolean; savedAt: Date | null; onRetry: () => void }) {
  let contenu: React.ReactNode = null;
  if (status === "erreur") {
    contenu = <><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.red }}/><span style={{ color: C.red }}>Échec ·</span><button type="button" className="nt-btn tap" onClick={onRetry} style={{ background: "none", border: "none", padding: 0, color: C.red, fontSize: "13px", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>Réessayer</button></>;
  } else if (status === "enregistrement") {
    contenu = <span>Enregistrement…</span>;
  } else if (dirty) {
    contenu = <><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.orange }}/><span>Modifications non enregistrées</span></>;
  } else if (savedAt) {
    contenu = <><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Enregistré à {heureDepuisHorodatage(savedAt)}</span></>;
  }
  return <span aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{contenu}</span>;
}

export function PropLabel({ C, children }: { C: ThemeTokens; children: React.ReactNode }) {
  return <div style={{ color: C.t3, fontSize: "12px", marginBottom: "6px" }}>{children}</div>;
}
export const chipBtn = (C: ThemeTokens, pointille?: boolean): React.CSSProperties => ({
  height: "32px", padding: "0 10px", display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "8px", boxSizing: "border-box",
  background: C.bgCard, border: `1px ${pointille ? "dashed" : "solid"} ${C.border2}`, color: C.t1, fontSize: "13px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
});
