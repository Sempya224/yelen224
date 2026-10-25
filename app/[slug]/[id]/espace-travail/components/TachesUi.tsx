"use client";

// Briques présentationnelles de l'onglet Tâches (refonte UI 20/10/2026).
// Aucune requête ni règle métier ici : TachesSection.tsx garde le chargement,
// les filtres, le tri, les mutations et les popovers ; on dessine seulement
// ce qu'on nous passe.
import type { RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../../theme";
import { ClockSearchField, FilterChips, StatusPill } from "../../components/ClockInShiftUi";

export type TaskTab = { key: string; label: string; count: number; alerte?: boolean };

export function TachesStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .tsk-row{display:flex;align-items:center;gap:12px;padding:12px 16px;min-height:64px}
      .tsk-row:hover{background-color:${C.bgCard2}}
      .tsk-row:focus-visible,.tsk-btn:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .tsk-main{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
      .tsk-meta{display:flex;align-items:center;gap:14px;flex-shrink:0}
      .tsk-prio{width:104px}
      .tsk-due{width:148px;text-align:left}
      .tsk-check{width:76px}
      @media(max-width:1023px){.tsk-prio{width:auto}.tsk-due{width:auto}.tsk-check{width:auto}}
      @media(max-width:767px){
        .tsk-row{flex-direction:column;align-items:stretch;gap:8px}
        .tsk-meta{flex-wrap:wrap;padding-left:32px;gap:8px 14px}
      }
      .tsk-qf{display:flex;gap:2px;overflow-x:auto;max-width:100%}
      @media(prefers-reduced-motion:reduce){.tsk-row,.tsk-btn{transition:none!important}}
    `}</style>
  );
}

const carre = (C: ThemeTokens): React.CSSProperties => ({ height: "34px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "12.5px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" });

export type ToolbarView<V extends string> = { key: V; label: string; icone?: React.ReactNode };

export function TasksToolbar<V extends string>({ C, tabs, tab, onTab, onNew, search, onSearch, filtersRef, filtersCount, onFilters, sortRef, sortLabel, onSort, view, onView, vues, chips, onReset, aFiltre, total, unite = "tâche", nouveauLabel = "Nouvelle tâche" }: {
  C: ThemeTokens; tabs: TaskTab[]; tab: string; onTab: (k: string) => void; onNew: () => void;
  search: string; onSearch: (v: string) => void;
  filtersRef: RefObject<HTMLButtonElement | null>; filtersCount: number; onFilters: () => void;
  sortRef: RefObject<HTMLButtonElement | null>; sortLabel: string; onSort: () => void;
  view?: V; onView?: (v: V) => void; vues?: ToolbarView<V>[]; unite?: string; nouveauLabel?: string;
  chips: { key: string; label: string; onRemove: () => void }[]; onReset: () => void; aFiltre: boolean; total: number;
}) {
  const ui = toUiTokens(C);
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
        <div role="group" aria-label="Filtres rapides" className="tsk-qf">
          {tabs.map(t => {
            const on = t.key === tab;
            return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => onTab(t.key)} className="tsk-btn tap"
                style={{ height: "36px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, color: on ? C.t1 : C.t2, fontSize: "13.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                {t.label}
                {t.alerte && t.count > 0 && <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.red }}/>}
                <span style={{ color: t.alerte && t.count > 0 ? C.red : C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
              </button>
            );
          })}
        </div>
        <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onNew}
          icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>{nouveauLabel}</Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px 16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <ClockSearchField C={C} value={search} onChange={onSearch} width={320} label={`Rechercher ${unite === "projet" ? "un" : "une"} ${unite}`} placeholder={`Rechercher ${unite === "projet" ? "un" : "une"} ${unite}…`}/>
          <button ref={filtersRef} type="button" className="tsk-btn tap" aria-label="Filtres" onClick={onFilters} style={carre(C)}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span className="tsk-lbl">Filtres</span>
            {filtersCount > 0 && <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", backgroundColor: C.gold, color: "#000", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{filtersCount}</span>}
          </button>
          <button ref={sortRef} type="button" className="tsk-btn tap" aria-label={`Trier : ${sortLabel}`} onClick={onSort} style={carre(C)}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/></svg>
            <span className="tsk-lbl">Trier : {sortLabel}</span>
          </button>
          {aFiltre && <button type="button" className="tsk-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <span aria-live="polite" style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{total} {unite}{total > 1 ? "s" : ""}</span>
          <div role="group" aria-label="Vue" style={{ display: vues ? "inline-flex" : "none", border: `1px solid ${C.border2}`, borderRadius: "8px", overflow: "hidden", backgroundColor: C.bgCard }}>
            {(vues ?? []).map((vu, i) => {
              const v = vu.key; const on = view === v;
              return (
                <button key={v} type="button" aria-pressed={on} onClick={() => onView?.(v)} className="tsk-btn tap"
                  style={{ height: "34px", padding: "0 14px", border: "none", borderLeft: i > 0 ? `1px solid ${C.border2}` : "none", backgroundColor: on ? C.bg3 : "transparent", color: on ? C.t1 : C.t2, fontSize: "13px", fontWeight: on ? 600 : 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", boxShadow: on ? `inset 0 -2px 0 ${C.gold}` : "none" }}>{vu.icone}<span className={vu.icone ? "tsk-lbl" : undefined}>{vu.label}</span></button>
              );
            })}
          </div>
        </div>
      </div>
      <FilterChips C={C} chips={chips}/>
      <style>{`@media(max-width:767px){.tsk-lbl{display:none}}`}</style>
    </div>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────
export function PriorityBadge({ C, priorite, label }: { C: ThemeTokens; priorite: string; label: string }) {
  const couleur = priorite === "haute" ? C.orange : priorite === "basse" ? C.t3 : C.t2;
  return <StatusPill label={label} color={couleur}/>;
}

export function ChecklistProgress({ C, fait, total }: { C: ThemeTokens; fait: number; total: number }) {
  if (total === 0) return <span aria-hidden="true" style={{ display: "block", width: "1px" }}/>;
  const titre = `${fait} élément${fait > 1 ? "s" : ""} sur ${total} terminé${fait > 1 ? "s" : ""}`;
  return (
    <span title={titre} aria-label={titre} style={{ display: "inline-flex", flexDirection: "column", gap: "3px", color: C.t2, fontSize: "12.5px", fontVariantNumeric: "tabular-nums", minWidth: "44px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        {fait}/{total}
      </span>
      <span aria-hidden="true" style={{ height: "4px", borderRadius: "2px", backgroundColor: C.bg3, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${(fait / total) * 100}%`, backgroundColor: C.green }}/>
      </span>
    </span>
  );
}

export function DueLabel({ C, texte, etat, complet }: { C: ThemeTokens; texte: string; etat: "retard" | "aujourdhui" | "normal" | "sans"; complet: string }) {
  const couleur = etat === "retard" ? C.red : etat === "aujourdhui" ? C.orange : etat === "sans" ? C.t3 : C.t2;
  return (
    <span title={complet} style={{ display: "inline-flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap", fontSize: "13px", fontWeight: etat === "retard" || etat === "aujourdhui" ? 600 : 400, color: couleur, fontVariantNumeric: "tabular-nums" }}>
      {etat === "retard" && <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
      {texte}
    </span>
  );
}

export function TasksSkeleton({ label = "Chargement des tâches" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {[0, 1, 2, 3, 4].map(i => <div key={i} className="cix-skel" style={{ height: "64px", borderRadius: "10px" }}/>)}
    </div>
  );
}

export function TasksMessage({ C, titre, texte, icone, action }: { C: ThemeTokens; titre: string; texte?: string; icone?: React.ReactNode; action?: { label: string; onClick: () => void; primaire?: boolean } }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "40px 20px", textAlign: "center" }}>
      {icone && <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginBottom: "10px", color: C.t3 }}>{icone}</div>}
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{titre}</div>
      {texte && <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, maxWidth: "420px", margin: "0 auto" }}>{texte}</div>}
      {action && <div style={{ marginTop: "14px" }}><Button tokens={toUiTokens(C)} className="tap" variant={action.primaire ? "primary" : "secondary"} size="sm" onClick={action.onClick}>{action.label}</Button></div>}
    </div>
  );
}
