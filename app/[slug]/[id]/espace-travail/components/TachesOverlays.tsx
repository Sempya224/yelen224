"use client";

// Système V3 d'overlays des Tâches (refonte CEO, 20/09/2026) — building
// blocks partagés par TachesSection.tsx. Même architecture que
// AgendaOverlays.tsx (audit + validation Bryan sur Agenda, 20/09/2026),
// appliquée ici : détails avant édition, confirmation dédiée pour la
// suppression, popovers ancrés pour les actions rapides, tout PC-first
// (aucune logique mobile, sur demande explicite de Bryan).
//
// Réutilise `useDialogA11y`, `AgendaPopover`, `MemberPicker` et `DatePicker`
// depuis AgendaOverlays.tsx — import en lecture seule, AUCUNE modification
// de ce fichier (consigne explicite : ne pas toucher Agenda). Ces 4
// primitives sont déjà génériques (aucune dépendance au domaine
// "événement"), les dupliquer aurait recréé ~150 lignes de logique
// d'accessibilité/positionnement identique, exactement ce que le principe
// "pas une excuse pour dupliquer" (item 18 du brief) déconseille.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import type { ThemeTokens } from "../../theme";
import { toUiTokens } from "../../theme";
import { AgendaPopover, useDialogA11y, MemberPicker, IconUser } from "./AgendaOverlays";

export type ChecklistItem = { label: string; fait: boolean };
export type Tache = {
  id: string; titre: string; description: string | null; priorite: string; statut: string;
  echeance: string | null; checklist: ChecklistItem[]; citoyen_id: string | null; rdv_id: string | null;
  membre_id: string | null; cree_par_membre_id: string | null;
  // V3 Projets (20/09/2026, validé avec Bryan) — liaison optionnelle,
  // "même donnée, deux contextes". Purement additif : aucun consommateur
  // existant de ce type (TachesSection.tsx) n'a besoin d'y toucher.
  projet_id?: string | null; created_at?: string;
};
export type Membre = { id: string; prenom: string; nom: string };

// Statuts/priorités réels de la table `taches` (voir app/api/institution/
// taches/route.ts::STATUTS/PRIORITES) — la maquette du brief en proposait
// 5/4, mais Yelen n'en a que 3/3 en base aujourd'hui. Consigne explicite du
// brief : "reprendre les statuts réellement utilisés, ne pas inventer un
// nouveau workflow incompatible avec les données actuelles."
export const STATUTS = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminée" },
] as const;

export const PRIORITES = [
  { value: "basse", label: "Basse" },
  { value: "normale", label: "Normale" },
  { value: "haute", label: "Haute" },
] as const;

export function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }

export function prioriteColor(p: string, C: ThemeTokens): string {
  if (p === "haute") return C.red;
  if (p === "basse") return C.t3;
  return C.blue;
}
export function prioriteLabel(p: string): string { return PRIORITES.find(x => x.value === p)?.label ?? p; }

export function statutColor(s: string, C: ThemeTokens): string {
  if (s === "termine") return C.green;
  if (s === "en_cours") return C.blue;
  return C.t3;
}
export function statutLabel(s: string): string { return STATUTS.find(x => x.value === s)?.label ?? s; }

export function estEnRetard(t: Tache): boolean {
  if (!t.echeance || t.statut === "termine") return false;
  return t.echeance < toISODate(new Date());
}
export function estAujourdhui(t: Tache): boolean {
  return !!t.echeance && t.echeance === toISODate(new Date()) && t.statut !== "termine";
}

// Étiquette d'échéance "humaine" (item 7 du brief) — la date exacte reste
// toujours consultable (tooltip/formulaire), ceci n'est qu'un raccourci de
// lecture rapide dans la liste/le drawer.
export function echeanceLabel(t: Tache): string {
  if (!t.echeance) return "Sans échéance";
  const today = toISODate(new Date());
  if (t.echeance === today) return "Aujourd'hui";
  const tmrDate = new Date(); tmrDate.setDate(tmrDate.getDate() + 1);
  if (t.echeance === toISODate(tmrDate)) return "Demain";
  const d = new Date(`${t.echeance}T00:00:00`);
  if (estEnRetard(t)) return `En retard · ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  const diffDays = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function nomMembre(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom} ${m.nom}` : null;
}
export function initiales(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom.slice(0, 1)}${m.nom.slice(0, 1)}`.toUpperCase() : null;
}

// Permissions par rôle ("chacun ne gère que le sien", même règle que
// taches/route.ts) : admin gère tout, un non-admin ne gère que ce qu'il a
// créé ou ce qui lui est assigné.
export function peutGerer(t: Tache, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return t.cree_par_membre_id === moiId || t.membre_id === moiId;
}

function IconMore({ color }: { color: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
}

function rowStyle(tokens: ThemeTokens, active: boolean): React.CSSProperties {
  return { display: "block", width: "100%", textAlign: "left", background: active ? `${tokens.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: active ? 800 : 500, color: active ? tokens.goldD : tokens.t1, cursor: "pointer" };
}

// ─────────────────────────────────────────────────────────────────────────
// Changement rapide de statut/priorité (item 4/5) — popover court, jamais
// un formulaire complet pour ça.
// ─────────────────────────────────────────────────────────────────────────
export function StatusPicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (s: string) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={140}>
      {STATUTS.map(s => (
        <button key={s.value} onClick={() => { onSelect(s.value); onClose(); }} style={rowStyle(tokens, s.value === value)}>
          <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: statutColor(s.value, tokens), marginRight: "8px" }}/>{s.label}
        </button>
      ))}
    </AgendaPopover>
  );
}

export function PriorityPicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (p: string) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={130}>
      {PRIORITES.map(p => (
        <button key={p.value} onClick={() => { onSelect(p.value); onClose(); }} style={rowStyle(tokens, p.value === value)}>
          <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: prioriteColor(p.value, tokens), marginRight: "8px" }}/>{p.label}
        </button>
      ))}
    </AgendaPopover>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Échéance — "Sans échéance" épinglé + mini-calendrier. DatePicker.tsx
// d'AgendaOverlays ne prévoit pas d'option "aucune date" ; plutôt que
// l'étendre (fichier Agenda, hors périmètre), petit calendrier dédié ici —
// même logique de grille que son homologue Agenda (dupliquée, convention
// déjà établie dans ce projet pour ce genre de petit helper).
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

export function EcheancePicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (iso: string | null) => void;
}) {
  const [viewDate, setViewDate] = useState(() => new Date(value || Date.now()));
  useEffect(() => { if (open) setViewDate(new Date(value || Date.now())); }, [open, value]);
  const days = useMemo(() => monthGridDays(viewDate), [viewDate]);
  const todayIso = toISODate(new Date());

  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={252}>
      <button onClick={() => { onSelect(null); onClose(); }} style={rowStyle(tokens, !value)}>Sans échéance</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 4px 8px" }}>
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

export function TaskActionsMenu({ open, onClose, anchorRef, tokens, onDelete }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; onDelete: () => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={150}>
      <button onClick={() => { onClose(); onDelete(); }} style={{ ...rowStyle(tokens, false), color: tokens.red, fontWeight: 700 }}>Supprimer</button>
    </AgendaPopover>
  );
}

export { MemberPicker as AssigneePicker, useDialogA11y, IconUser };

// ─────────────────────────────────────────────────────────────────────────
// Détails d'une tâche (item 9/10) : Drawer, jamais directement le
// formulaire d'édition — la liste/le calendrier restent visibles derrière.
// ─────────────────────────────────────────────────────────────────────────
export function TaskDetailsPanel({ open, onClose, tache, membres, peutGerer: gerable, onEdit, onDeleteRequest, C }: {
  open: boolean; onClose: () => void; tache: Tache | null; membres: Membre[]; peutGerer: boolean;
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

  if (!tache) return null;
  const assigne = nomMembre(tache.membre_id, membres);
  const fait = tache.checklist.filter(c => c.fait).length;

  return (
    <Drawer open={open} onClose={onClose} title="Détails de la tâche" width="400px" tokens={{ surface: C.bgCard, border: C.border, text: C.t1, textMuted: C.t3, shadow: C.shadow }}>
      <div style={{ fontSize: "17px", fontWeight: 800, color: C.t1, marginBottom: "12px", textDecoration: tache.statut === "termine" ? "line-through" : "none" }}>{tache.titre}</div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${statutColor(tache.statut, C)}15`, color: statutColor(tache.statut, C), fontSize: "10.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: statutColor(tache.statut, C) }}/>{statutLabel(tache.statut)}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${prioriteColor(tache.priorite, C)}15`, color: prioriteColor(tache.priorite, C), fontSize: "10.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: prioriteColor(tache.priorite, C) }}/>{prioriteLabel(tache.priorite)}
        </span>
      </div>

      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Responsable</div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: C.t1, marginBottom: "16px" }}>
        <IconUser color={C.t3} size={11}/>{assigne || "Non assigné"}
      </div>

      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Échéance</div>
      <div style={{ fontSize: "12.5px", color: estEnRetard(tache) ? C.red : C.t1, fontWeight: estEnRetard(tache) ? 700 : 500, marginBottom: "16px" }}>{echeanceLabel(tache)}</div>

      {tache.description && (
        <>
          <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Description</div>
          <div style={{ fontSize: "13px", color: C.t2, lineHeight: 1.5, marginBottom: "16px" }}>{tache.description}</div>
        </>
      )}

      {tache.checklist.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px" }}>Checklist</span>
            <span style={{ fontSize: "10.5px", color: C.t3, fontWeight: 700 }}>{fait}/{tache.checklist.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "16px" }}>
            {tache.checklist.map((it, i) => (
              <div key={i} style={{ fontSize: "12px", color: it.fait ? C.t3 : C.t2, textDecoration: it.fait ? "line-through" : "none" }}>{it.label}</div>
            ))}
          </div>
        </>
      )}

      {(tache.citoyen_id || tache.rdv_id) && (
        <div style={{ display: "inline-block", color: C.blue, fontSize: "10.5px", fontWeight: 700, backgroundColor: `${C.blue}15`, padding: "3px 9px", borderRadius: "20px", marginBottom: "16px" }}>Client lié</div>
      )}

      {gerable && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "16px", display: "flex", gap: "8px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={onEdit} style={{ flex: 1 }}>Modifier</Button>
          <button ref={menuBtnRef} onClick={() => setMenuOpen(v => !v)} aria-label="Autres actions" style={{ width: "40px", height: "40px", borderRadius: "10px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconMore color={C.t2}/>
          </button>
          <TaskActionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuBtnRef} tokens={C} onDelete={onDeleteRequest}/>
        </div>
      )}
    </Drawer>
  );
}
