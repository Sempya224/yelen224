"use client";

// Système V3 d'overlays de l'Agenda (refonte CEO, 20/09/2026) — building
// blocks partagés par AgendaSection.tsx. Sens de dépendance volontairement
// unique (AgendaSection importe d'ici, jamais l'inverse) pour éviter tout
// cycle de modules entre les deux fichiers.
//
// Principes retenus après audit (voir échange avec Bryan, 20/09/2026) :
// - Confirmation de suppression / conflit / modifications non enregistrées
//   → components/ui/ConfirmModal.tsx existant (focus trap, ESC, bottom
//   sheet/dialogue déjà corrects) — rien de nouveau à écrire pour ça, géré
//   directement dans AgendaSection.tsx.
// - Détails d'un événement → components/ui/Drawer.tsx existant, complété
//   ici par useDialogA11y (Drawer n'a pas d'ESC ni de piège de focus
//   nativement — ajouté au niveau Agenda plutôt que dans la primitive
//   partagée, utilisée aussi par Admin, hors périmètre de ce chantier).
// - Type/membre/date/heure → popovers légers ancrés (AgendaPopover), pas de
//   nouveaux gros modals — évite d'empiler des boîtes de dialogue.
// - Convention commune à TOUS les overlays custom de ce fichier : Echap
//   ferme, click en dehors ferme, focus revient au déclencheur à la
//   fermeture — un popover qui se ferme via Echap appelle
//   `e.preventDefault()` pour que l'overlay parent (ex. EventForm) sache
//   qu'il ne doit pas se refermer lui-même sur le même appui de touche.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import type { ThemeTokens } from "../../theme";
import { toUiTokens } from "../../theme";

export type Evenement = { id: string; titre: string; description: string | null; type: string; date: string; date_originale: string; heure_debut: string | null; heure_fin: string | null; membre_id: string | null; cree_par_membre_id: string | null; recurrence: string; recurrence_fin: string | null };
export type Membre = { id: string; prenom: string; nom: string };

export const TYPES = [
  { value: "rappel", label: "Rappel" },
  { value: "reunion", label: "Réunion" },
  { value: "bloque", label: "Bloqué" },
  { value: "autre", label: "Autre" },
] as const;

export function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }

export function typeColor(type: string, C: ThemeTokens): string {
  if (type === "reunion") return C.purple;
  if (type === "bloque") return C.red;
  if (type === "autre") return C.teal;
  return C.gold;
}

export function typeLabel(type: string): string {
  return TYPES.find(t => t.value === type)?.label ?? "Autre";
}

export function IconUser({ color, size = 9 }: { color: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}

function IconMore({ color }: { color: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
}

// ─────────────────────────────────────────────────────────────────────────
// Accessibilité commune à tous les overlays "modaux" custom de l'Agenda
// (EventForm dans AgendaSection.tsx, RdvDetailModal, EventDetailsPanel
// ci-dessous) — même logique que components/ui/ConfirmModal.tsx (focus au
// panneau à l'ouverture, restauration à la fermeture, piège de tabulation,
// Echap), factorisée ici pour ne pas la réécrire dans chaque overlay.
// ─────────────────────────────────────────────────────────────────────────
export function useDialogA11y(panelRef: RefObject<HTMLElement | null>, open: boolean, onEscape: () => void) {
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastFocused.current = document.activeElement as HTMLElement;
      const t = setTimeout(() => panelRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    lastFocused.current?.focus?.();
  }, [open, panelRef]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) { onEscape(); return; }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (focusables.length === 0) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onEscape, panelRef]);
}

// ─────────────────────────────────────────────────────────────────────────
// Popover ancré générique (quick actions — item 3A du brief) : type, date,
// heure, membre, actions. `position:fixed` calculé depuis le bouton
// déclencheur pour ne jamais être rogné par l'`overflow:auto` de la grille
// semaine (le calendrier a un scroll horizontal propre).
// ─────────────────────────────────────────────────────────────────────────
export function AgendaPopover({ open, onClose, anchorRef, tokens, children, minWidth = 200 }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; children: ReactNode; minWidth?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  // PC-first (retour Bryan 20/09/2026) : le déclencheur (ex. "Assigné à")
  // est souvent proche du bas de la boîte de dialogue — un simple
  // "sous le bouton" pouvait pousser le popover hors de l'écran, ce qui
  // donnait l'impression qu'il "s'affichait en bas". On calcule l'espace
  // réellement disponible au-dessus/en dessous et on bascule au-dessus si
  // besoin, avec une hauteur maximale toujours contenue dans l'écran.
  useEffect(() => {
    if (!open || !anchorRef.current) { setPos(null); return; }
    const desiredMaxHeight = 300;
    const margin = 10;
    const r = anchorRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUpward = spaceBelow < Math.min(desiredMaxHeight, 160) && spaceAbove > spaceBelow;
    const top = openUpward ? Math.max(margin, r.top - Math.min(desiredMaxHeight, spaceAbove) - 6) : r.bottom + 6;
    const maxHeight = Math.max(120, Math.min(desiredMaxHeight, openUpward ? spaceAbove : spaceBelow));
    const width = Math.max(minWidth, r.width);
    let left = r.left;
    if (left + width > vw - margin) left = Math.max(margin, vw - width - margin);
    setPos({ top, left, width, maxHeight });
  }, [open, anchorRef, minWidth]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { e.preventDefault(); onClose(); } }
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClickOutside);
      anchorRef.current?.focus?.();
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  // Portail vers document.body (pas un simple position:fixed local) — un
  // popover ouvert depuis l'intérieur du Drawer (ex. menu "…" de
  // EventDetailsPanel) hériterait sinon d'un nouveau "containing block" à
  // cause du `transform` CSS permanent du panneau du Drawer (Drawer.tsx,
  // `.yelen-drawer-panel.open{transform:translateX(0)}`) — tout `position:
  // fixed` nichoverrait alors ses coordonnées par rapport au Drawer et non
  // à l'écran, rendant le popover hors-champ et donc impossible à cliquer
  // (bug réel trouvé le 20/09/2026 : le menu "…" du drawer de détails ne
  // répondait à aucun clic).
  return createPortal(
    <div ref={panelRef} role="dialog" aria-modal="false" style={{ position: "fixed", top: `${pos.top}px`, left: `${pos.left}px`, minWidth: `${Math.max(minWidth, pos.width)}px`, maxWidth: "280px", maxHeight: `${pos.maxHeight}px`, overflowY: "auto", zIndex: 400, backgroundColor: tokens.bgCard, border: `1px solid ${tokens.border2}`, borderRadius: "12px", boxShadow: "0 10px 28px rgba(0,0,0,0.22)", padding: "6px" }}>
      {children}
    </div>,
    document.body
  );
}

function rowStyle(tokens: ThemeTokens, active: boolean): React.CSSProperties {
  return { display: "block", width: "100%", textAlign: "left", background: active ? `${tokens.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: active ? 800 : 500, color: active ? tokens.goldD : tokens.t1, cursor: "pointer" };
}

// ─────────────────────────────────────────────────────────────────────────
// B — Assignation d'un membre (item 6) : popover + recherche, "Non assigné"
// épinglé en premier, jamais filtré par la recherche.
// ─────────────────────────────────────────────────────────────────────────
export function MemberPicker({ open, onClose, anchorRef, tokens, membres, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens;
  membres: Membre[]; value: string | null; onSelect: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(""); const t = setTimeout(() => inputRef.current?.focus(), 40); return () => clearTimeout(t); } }, [open]);

  const filtered = useMemo(() => membres.filter(m => `${m.prenom} ${m.nom}`.toLowerCase().includes(q.toLowerCase())), [membres, q]);

  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={240}>
      <div style={{ padding: "2px 2px 6px" }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un membre…" style={{ width: "100%", backgroundColor: tokens.bg3, border: `1px solid ${tokens.border2}`, borderRadius: "8px", padding: "7px 10px", fontSize: "12.5px", color: tokens.t1, boxSizing: "border-box", outline: "none" }}/>
      </div>
      <button onClick={() => { onSelect(null); onClose(); }} style={rowStyle(tokens, value === null)}>Non assigné</button>
      {filtered.map(m => (
        <button key={m.id} onClick={() => { onSelect(m.id); onClose(); }} style={rowStyle(tokens, value === m.id)}>{m.prenom} {m.nom}</button>
      ))}
      {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: "11.5px", color: tokens.t3 }}>Aucun membre trouvé.</div>}
    </AgendaPopover>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Date / heure (item 7) : popovers ancrés, jamais empilés (un seul niveau,
// contenu dans le formulaire) — remplace les <input type=date/time> natifs
// sur demande explicite de Bryan (identité visuelle Yelen plutôt que le
// picker du navigateur/OS).
// ─────────────────────────────────────────────────────────────────────────
function monthGridDays(viewDate: Date): Date[] {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const day = first.getDay() === 0 ? 7 : first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - (day - 1));
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}

function navBtn(tokens: ThemeTokens): React.CSSProperties {
  return { background: "none", border: `1px solid ${tokens.border2}`, borderRadius: "6px", width: "22px", height: "22px", color: tokens.t2, cursor: "pointer", fontSize: "12px" };
}

export function DatePicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (iso: string) => void;
}) {
  const [viewDate, setViewDate] = useState(() => new Date(value));
  useEffect(() => { if (open) setViewDate(new Date(value)); }, [open, value]);
  const days = useMemo(() => monthGridDays(viewDate), [viewDate]);
  const todayIso = toISODate(new Date());

  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={252}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px 8px" }}>
        <button onClick={() => setViewDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })} style={navBtn(tokens)}>‹</button>
        <span style={{ fontSize: "12px", fontWeight: 800, color: tokens.t1, textTransform: "capitalize" }}>{viewDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setViewDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })} style={navBtn(tokens)}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", padding: "0 4px 4px" }}>
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: "9px", fontWeight: 800, color: tokens.t3 }}>{d}</div>)}
        {days.map(d => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === viewDate.getMonth();
          const isSelected = iso === value;
          const isToday = iso === todayIso;
          return (
            <button key={iso} onClick={() => { onSelect(iso); onClose(); }} style={{ width: "100%", aspectRatio: "1", background: isSelected ? tokens.gold : "none", border: isToday && !isSelected ? `1px solid ${tokens.gold}` : "1px solid transparent", borderRadius: "6px", fontSize: "10.5px", fontWeight: isSelected ? 800 : 500, color: isSelected ? "#000" : inMonth ? tokens.t1 : tokens.t3, cursor: "pointer", opacity: inMonth ? 1 : 0.4 }}>{d.getDate()}</button>
          );
        })}
      </div>
    </AgendaPopover>
  );
}

const TIME_OPTIONS = Array.from({ length: (21 - 6) * 2 + 1 }, (_, i) => {
  const total = 6 * 60 + i * 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});

export function TimePicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (t: string) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={100}>
      {TIME_OPTIONS.map(t => (
        <button key={t} onClick={() => { onSelect(t); onClose(); }} style={rowStyle(tokens, t === value)}>{t}</button>
      ))}
    </AgendaPopover>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// A — Menu d'actions d'un événement (item 3A / architecture "…").
// ─────────────────────────────────────────────────────────────────────────
export function EventActionsMenu({ open, onClose, anchorRef, tokens, onDelete }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; onDelete: () => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={150}>
      <button onClick={() => { onClose(); onDelete(); }} style={{ ...rowStyle(tokens, false), color: tokens.red, fontWeight: 700 }}>Supprimer</button>
    </AgendaPopover>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// C — Consultation d'un événement (item 3C / item 8) : Drawer (panneau
// latéral ≥1024px, bottom sheet en dessous) plutôt qu'un modal plein écran
// — le calendrier reste visible derrière. Clic sur un événement → ceci
// d'abord, jamais directement le formulaire d'édition.
// ─────────────────────────────────────────────────────────────────────────
export function EventDetailsPanel({ open, onClose, evenement, membres, peutGerer, onEdit, onDeleteRequest, C }: {
  open: boolean; onClose: () => void; evenement: Evenement | null; membres: Membre[]; peutGerer: boolean;
  onEdit: () => void; onDeleteRequest: () => void; C: ThemeTokens;
}) {
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Drawer.tsx (primitive partagée Admin+Institution) ne gère pas Echap
  // nativement — ajouté ici, jamais dans le fichier partagé.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !e.defaultPrevented) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!evenement) return null;
  const assigne = evenement.membre_id ? membres.find(m => m.id === evenement.membre_id) : null;
  const color = typeColor(evenement.type, C);

  return (
    <Drawer open={open} onClose={onClose} title={typeLabel(evenement.type)} width="400px" tokens={{ surface: C.bgCard, border: C.border, text: C.t1, textMuted: C.t3, shadow: C.shadow }}>
      <div style={{ fontSize: "17px", fontWeight: 800, color: C.t1, marginBottom: "6px" }}>{evenement.titre}</div>
      <div style={{ fontSize: "12.5px", color, fontWeight: 700, marginBottom: "16px" }}>
        {new Date(`${evenement.date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {evenement.heure_debut || "—"}{evenement.heure_fin ? ` – ${evenement.heure_fin}` : ""}
      </div>
      {evenement.description && <div style={{ fontSize: "13px", color: C.t2, lineHeight: 1.5, marginBottom: "16px" }}>{evenement.description}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: C.t2, marginBottom: "20px" }}>
        <IconUser color={C.t3} size={11}/>{assigne ? `${assigne.prenom} ${assigne.nom}` : "Non assigné"}
      </div>
      {peutGerer && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "16px", display: "flex", gap: "8px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={onEdit} style={{ flex: 1 }}>Modifier</Button>
          <button ref={menuBtnRef} onClick={() => setMenuOpen(v => !v)} aria-label="Autres actions" style={{ width: "40px", height: "40px", borderRadius: "10px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconMore color={C.t2}/>
          </button>
          <EventActionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuBtnRef} tokens={C} onDelete={onDeleteRequest}/>
        </div>
      )}
    </Drawer>
  );
}
