"use client";

// Système V3 d'overlays des Notes (refonte CEO, 20/09/2026) — building
// blocks partagés par NotesSection.tsx / NoteEditor.tsx. Même architecture
// que Agenda/Tâches/Documents/Projets Overlays : popovers ancrés, PC-first.
//
// Réutilise en lecture seule AgendaPopover/useDialogA11y/IconUser
// (AgendaOverlays.tsx) et les types Projet/Membre (ProjetsOverlays.tsx),
// DocumentTravail (DocumentsOverlays.tsx) — "Projet associé"/"Documents
// liés" (item 10/23 du brief) pointent vers les mêmes lignes que dans
// leurs onglets respectifs, jamais une copie.
import { useRef, useState, type RefObject } from "react";
import type { ThemeTokens } from "../../theme";
import { AgendaPopover } from "./AgendaOverlays";
import { TYPES_NOTE } from "@/lib/projetsNotes";
import { ProjectLinkPicker } from "./ProjetsOverlays";
import { type DocumentTravail } from "./DocumentsOverlays";

// ProjectLinkPicker vit dans ProjetsOverlays.tsx (sa place logique — c'est
// un sélecteur de projet, pas un composant Notes) et est réutilisé ici en
// lecture seule, comme pour AgendaPopover/useDialogA11y. Ré-exporté pour
// ne rien changer aux imports déjà en place dans NoteEditor.tsx.
export { ProjectLinkPicker };

export type Note = {
  id: string; titre: string; contenu: string; type: string; tags: string[];
  projet_id: string | null; document_ids: string[]; membre_id: string | null;
  created_at: string; updated_at: string;
};
export type Membre = { id: string; prenom: string; nom: string };

export { TYPES_NOTE };

export function typeColor(t: string, C: ThemeTokens): string {
  if (t === "rappel_admin") return C.red;
  if (t === "consigne_equipe") return C.purple;
  if (t === "idee_interne") return C.teal;
  if (t === "info_client") return C.blue;
  return C.gold;
}
export function typeLabel(t: string): string { return TYPES_NOTE.find(x => x.value === t)?.label ?? t; }

export function nomMembre(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom} ${m.nom}` : null;
}

// Lecture ouverte à toute l'équipe, écriture réservée à l'auteur/admin —
// même règle que notes/route.ts (aucun niveau de partage réel n'existe,
// décision actée le 20/09/2026 : ne pas simuler Privée/Équipe/Institution).
export function peutGerer(n: Note, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return n.membre_id === moiId;
}

// ─────────────────────────────────────────────────────────────────────────
// Éditeur par blocs (item 6) — contenu sérialisé en JSON dans la colonne
// texte `contenu` existante (migration 20260920000002, aucun changement de
// type de colonne). Une note créée avant l'éditeur par blocs contient du
// texte brut, pas du JSON valide : repli automatique en un seul bloc
// "Texte", jamais une perte de contenu.
// ─────────────────────────────────────────────────────────────────────────
export type BlockType = "texte" | "titre" | "sous_titre" | "liste" | "checklist" | "citation" | "separateur" | "lien";
export type Block = { id: string; type: BlockType; text?: string; url?: string; items?: { text: string; fait?: boolean }[] };

export const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: "texte", label: "Texte" },
  { value: "titre", label: "Titre" },
  { value: "sous_titre", label: "Sous-titre" },
  { value: "liste", label: "Liste" },
  { value: "checklist", label: "Checklist" },
  { value: "citation", label: "Citation" },
  { value: "separateur", label: "Séparateur" },
  { value: "lien", label: "Lien" },
];

function newId(): string { return Math.random().toString(36).slice(2); }

export function nouveauBloc(type: BlockType): Block {
  if (type === "liste" || type === "checklist") return { id: newId(), type, items: [{ text: "" }] };
  if (type === "lien") return { id: newId(), type, text: "", url: "" };
  return { id: newId(), type, text: "" };
}

export function parseContenu(raw: string): Block[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(b => b && typeof b === "object" && typeof b.type === "string")) return parsed as Block[];
  } catch {}
  return [{ id: "legacy", type: "texte", text: raw }];
}
export function serializeBlocks(blocks: Block[]): string { return JSON.stringify(blocks); }

export function blocksPreview(blocks: Block[]): string {
  const text = blocks.map(b => {
    if (b.type === "separateur") return "";
    if (b.type === "liste" || b.type === "checklist") return (b.items || []).map(i => i.text).filter(Boolean).join(" · ");
    return b.text || "";
  }).filter(Boolean).join(" — ").trim();
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function rowStyle(tokens: ThemeTokens, active: boolean): React.CSSProperties {
  return { display: "block", width: "100%", textAlign: "left", background: active ? `${tokens.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: active ? 800 : 500, color: active ? tokens.goldD : tokens.t1, cursor: "pointer" };
}

export function NoteTypePicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (t: string) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={170}>
      {TYPES_NOTE.map(t => (
        <button key={t.value} onClick={() => { onSelect(t.value); onClose(); }} style={rowStyle(tokens, t.value === value)}>
          <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: typeColor(t.value, tokens), marginRight: "8px" }}/>{t.label}
        </button>
      ))}
    </AgendaPopover>
  );
}

export function BlockTypeMenu({ open, onClose, anchorRef, tokens, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; onSelect: (t: BlockType) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={160}>
      {BLOCK_TYPES.map(b => (
        <button key={b.value} onClick={() => { onSelect(b.value); onClose(); }} style={rowStyle(tokens, false)}>{b.label}</button>
      ))}
    </AgendaPopover>
  );
}

export function DocumentLinkPicker({ open, onClose, anchorRef, tokens, documents, value, onToggle }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; documents: DocumentTravail[]; value: string[]; onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = documents.filter(d => d.nom.toLowerCase().includes(q.toLowerCase()));
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={240}>
      <div style={{ padding: "2px 2px 6px" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un document…" style={{ width: "100%", backgroundColor: tokens.bg3, border: `1px solid ${tokens.border2}`, borderRadius: "8px", padding: "7px 10px", fontSize: "12.5px", color: tokens.t1, boxSizing: "border-box", outline: "none" }}/>
      </div>
      {filtered.map(d => {
        const checked = value.includes(d.id);
        return (
          <button key={d.id} onClick={() => onToggle(d.id)} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", color: tokens.t1, cursor: "pointer" }}>
            <div style={{ width: "14px", height: "14px", borderRadius: "4px", border: `1.5px solid ${checked ? tokens.gold : tokens.border2}`, backgroundColor: checked ? tokens.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            {d.nom}
          </button>
        );
      })}
      {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: "11.5px", color: tokens.t3 }}>Aucun document trouvé.</div>}
    </AgendaPopover>
  );
}

export function NoteActionsMenu({ open, onClose, anchorRef, tokens, onDuplicate, onDelete }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; onDuplicate: () => void; onDelete: () => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={160}>
      <button onClick={() => { onClose(); onDuplicate(); }} style={rowStyle(tokens, false)}>Dupliquer</button>
      <button onClick={() => { onClose(); onDelete(); }} style={{ ...rowStyle(tokens, false), color: tokens.red, fontWeight: 700 }}>Supprimer</button>
    </AgendaPopover>
  );
}

// Éditeur de tags inline (item 13) — pas un popover séparé, la saisie
// libre + suppression au clic est plus rapide qu'un menu pour ce cas.
export function TagsEditor({ C, tags, onChange, readOnly }: { C: ThemeTokens; tags: string[]; onChange: (tags: string[]) => void; readOnly?: boolean }) {
  const [input, setInput] = useState("");
  function ajouter() {
    const v = input.trim().replace(/^#/, "");
    if (!v || tags.includes(v)) { setInput(""); return; }
    onChange([...tags, v]);
    setInput("");
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {tags.map(t => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: C.bg3, color: C.t2, fontSize: "11px", fontWeight: 700, padding: "3px 6px 3px 10px", borderRadius: "20px" }}>
          #{t}
          {!readOnly && (
            <button onClick={() => onChange(tags.filter(x => x !== t))} aria-label="Retirer" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", padding: 0 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }} onBlur={ajouter} placeholder="+ tag" style={{ width: "70px", background: "none", border: "none", color: C.t2, fontSize: "11px", outline: "none" }}/>
      )}
    </div>
  );
}
