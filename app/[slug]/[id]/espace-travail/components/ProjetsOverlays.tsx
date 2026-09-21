"use client";

// Système V3 d'overlays des Projets (refonte CEO, 20/09/2026) — building
// blocks partagés par ProjetsSection.tsx / ProjectOverview.tsx. Même
// architecture que Agenda/Tâches/Documents Overlays (audit + validations
// Bryan, 20/09/2026) : popovers ancrés pour les actions rapides, drawer de
// consultation rapide, PC-first sans logique mobile.
//
// Réutilise en lecture seule AgendaPopover/useDialogA11y/MemberPicker/
// DatePicker/IconUser (AgendaOverlays.tsx), et les types/helpers Tâches/
// Documents (TachesOverlays.tsx/DocumentsOverlays.tsx) pour que "Tâches du
// projet"/"Documents liés" restent la même donnée que dans leurs onglets
// respectifs (item 11/12 du brief) — aucune modification de ces 3
// fichiers, ni de la moindre UI Agenda/Tâches/Documents.
import { useRef, useState, type RefObject } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import type { ThemeTokens } from "../../theme";
import { toUiTokens } from "../../theme";
import { AgendaPopover, useDialogA11y, IconUser } from "./AgendaOverlays";
import { type Tache, estEnRetard as tacheEnRetard } from "./TachesOverlays";
import { STATUTS_PROJET, PRIORITES_PROJET, SANTES_PROJET } from "@/lib/projetsNotes";

export type Projet = {
  id: string; nom: string; description: string | null; responsable_membre_id: string | null;
  date_debut: string | null; date_fin_prevue: string | null; statut: string; priorite: string; sante: string | null;
  cree_par_membre_id: string | null; created_at?: string; updated_at?: string;
};
export type Milestone = { id: string; projet_id: string; titre: string; statut: string; echeance: string | null; ordre: number; cree_par_membre_id: string | null; created_at?: string };
export type Membre = { id: string; prenom: string; nom: string };

export { STATUTS_PROJET, PRIORITES_PROJET, SANTES_PROJET };

export function statutColor(s: string, C: ThemeTokens): string {
  if (s === "en_cours") return C.blue;
  if (s === "termine") return C.green;
  if (s === "bloque") return C.red;
  return C.t3;
}
export function statutLabel(s: string): string { return STATUTS_PROJET.find(x => x.value === s)?.label ?? s; }

export function prioriteColor(p: string, C: ThemeTokens): string {
  if (p === "haute") return C.red;
  if (p === "basse") return C.t3;
  return C.blue;
}
export function prioriteLabel(p: string): string { return PRIORITES_PROJET.find(x => x.value === p)?.label ?? p; }

// "Santé" — jamais calculée (item 10 du brief) : null = non renseignée,
// dans ce cas on n'affiche rien plutôt que d'inventer un état.
export function santeInfo(s: string | null, C: ThemeTokens): { label: string; color: string } | null {
  if (!s) return null;
  const item = SANTES_PROJET.find(x => x.value === s);
  if (!item) return null;
  const color = s === "vert" ? C.green : s === "orange" ? C.orange : C.red;
  return { label: item.label, color };
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

// Permissions par rôle ("chacun gère le sien", même règle que
// projets/route.ts) : admin gère tout, un non-admin ne gère que ce qu'il a
// créé ou le projet dont il est responsable.
export function peutGerer(p: Projet, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return p.cree_par_membre_id === moiId || p.responsable_membre_id === moiId;
}

// Progression dérivée des vraies tâches liées (item 3/11 du brief) —
// jamais un pourcentage saisi à la main. `taches` doit déjà être filtré
// sur ce seul projet par l'appelant (GET /api/institution/taches?projet_id=).
export function computeProgress(taches: Tache[]): { pct: number; total: number; termine: number; enRetard: number } {
  const total = taches.length;
  const termine = taches.filter(t => t.statut === "termine").length;
  const enRetard = taches.filter(t => tacheEnRetard(t)).length;
  const pct = total === 0 ? 0 : Math.round((termine / total) * 100);
  return { pct, total, termine, enRetard };
}

function IconMore({ color }: { color: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
}

function rowStyle(tokens: ThemeTokens, active: boolean): React.CSSProperties {
  return { display: "block", width: "100%", textAlign: "left", background: active ? `${tokens.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: active ? 800 : 500, color: active ? tokens.goldD : tokens.t1, cursor: "pointer" };
}

export function ProjectStatusPicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (s: string) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={150}>
      {STATUTS_PROJET.map(s => (
        <button key={s.value} onClick={() => { onSelect(s.value); onClose(); }} style={rowStyle(tokens, s.value === value)}>
          <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: statutColor(s.value, tokens), marginRight: "8px" }}/>{s.label}
        </button>
      ))}
    </AgendaPopover>
  );
}

export function ProjectPriorityPicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (p: string) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={130}>
      {PRIORITES_PROJET.map(p => (
        <button key={p.value} onClick={() => { onSelect(p.value); onClose(); }} style={rowStyle(tokens, p.value === value)}>
          <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: prioriteColor(p.value, tokens), marginRight: "8px" }}/>{p.label}
        </button>
      ))}
    </AgendaPopover>
  );
}

export function ProjectSantePicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string | null; onSelect: (s: string | null) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={170}>
      <button onClick={() => { onSelect(null); onClose(); }} style={rowStyle(tokens, !value)}>Non renseignée</button>
      {SANTES_PROJET.map(s => {
        const info = santeInfo(s.value, tokens)!;
        return (
          <button key={s.value} onClick={() => { onSelect(s.value); onClose(); }} style={rowStyle(tokens, s.value === value)}>
            <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: info.color, marginRight: "8px" }}/>{info.label}
          </button>
        );
      })}
    </AgendaPopover>
  );
}

// Sélecteur de projet générique (revue finale du 20/09/2026) — utilisé par
// Notes (Projet associé) et par Tâches (champ Projet du formulaire), pour
// que les deux passent par le même composant plutôt que d'en dupliquer un
// chacun.
export function ProjectLinkPicker({ open, onClose, anchorRef, tokens, projets, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; projets: Projet[]; value: string | null; onSelect: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = projets.filter(p => p.nom.toLowerCase().includes(q.toLowerCase()));
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={220}>
      <div style={{ padding: "2px 2px 6px" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un projet…" style={{ width: "100%", backgroundColor: tokens.bg3, border: `1px solid ${tokens.border2}`, borderRadius: "8px", padding: "7px 10px", fontSize: "12.5px", color: tokens.t1, boxSizing: "border-box", outline: "none" }}/>
      </div>
      <button onClick={() => { onSelect(null); onClose(); }} style={rowStyle(tokens, value === null)}>Aucun projet</button>
      {filtered.map(p => <button key={p.id} onClick={() => { onSelect(p.id); onClose(); }} style={rowStyle(tokens, value === p.id)}>{p.nom}</button>)}
      {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: "11.5px", color: tokens.t3 }}>Aucun projet trouvé.</div>}
    </AgendaPopover>
  );
}

export function ProjectActionsMenu({ open, onClose, anchorRef, tokens, onDelete }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; onDelete: () => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={150}>
      <button onClick={() => { onClose(); onDelete(); }} style={{ ...rowStyle(tokens, false), color: tokens.red, fontWeight: 700 }}>Supprimer</button>
    </AgendaPopover>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Consultation rapide (item 17) — drawer, jamais un aller-retour complet
// vers le Project Overview pour juste regarder l'essentiel.
// ─────────────────────────────────────────────────────────────────────────
export function ProjectQuickDrawer({ open, onClose, projet, membres, progress, docCount, milestoneCount, onOpenFull, C }: {
  open: boolean; onClose: () => void; projet: Projet | null; membres: Membre[];
  progress: { pct: number; total: number; termine: number; enRetard: number }; docCount: number; milestoneCount: number | null;
  onOpenFull: () => void; C: ThemeTokens;
}) {
  if (!projet) return null;
  const responsable = nomMembre(projet.responsable_membre_id, membres);
  const color = statutColor(projet.statut, C);
  const sante = santeInfo(projet.sante, C);

  return (
    <Drawer open={open} onClose={onClose} title="Projet" width="380px" tokens={{ surface: C.bgCard, border: C.border, text: C.t1, textMuted: C.t3, shadow: C.shadow }}>
      <div style={{ fontSize: "17px", fontWeight: 800, color: C.t1, marginBottom: "10px" }}>{projet.nom}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${color}15`, color, fontSize: "10.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: color }}/>{statutLabel(projet.statut)}
        </span>
        {sante && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${sante.color}15`, color: sante.color, fontSize: "10.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: sante.color }}/>{sante.label}
          </span>
        )}
      </div>

      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Progression</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <div style={{ flex: 1, height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress.pct}%`, backgroundColor: C.gold, borderRadius: "3px" }}/>
        </div>
        <span style={{ fontSize: "11.5px", fontWeight: 800, color: C.t1 }}>{progress.pct}%</span>
      </div>

      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Responsable</div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: C.t1, marginBottom: "16px" }}>
        <IconUser color={C.t3} size={11}/>{responsable || "Non assigné"}
      </div>

      {projet.date_fin_prevue && (
        <>
          <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Échéance</div>
          <div style={{ fontSize: "12.5px", color: C.t1, marginBottom: "16px" }}>{new Date(`${projet.date_fin_prevue}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "20px", fontSize: "12px", color: C.t2 }}>
        <div>{progress.total} tâche{progress.total > 1 ? "s" : ""}</div>
        <div>{docCount} document{docCount > 1 ? "s" : ""}</div>
        <div>{milestoneCount === null ? "…" : `${milestoneCount} milestone${milestoneCount > 1 ? "s" : ""}`}</div>
      </div>

      <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={onOpenFull}>Ouvrir le projet →</Button>
    </Drawer>
  );
}
