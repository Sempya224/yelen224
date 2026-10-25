"use client";

// Briques présentationnelles de l'écran "Clock In Shift" (refonte UI
// 20/10/2026, références Stripe / Linear / Deel). Aucune requête, aucun calcul
// de KPI ici : ClockInShiftTab.tsx garde le chargement, le polling Live, la
// date, l'export, le rapport et les modales, et passe des props prêtes à
// afficher. Les vues Employés / Départements / Horaires ne sont pas concernées.
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";
import { heureDepuisHorodatage } from "@/lib/heure";

// ── Formatage d'affichage (12 h AM/PM, convention Yelen) ─────────────────
export function heure12(iso: string | null): string {
  if (!iso) return "—";
  // Formateur unique (lib/heure.ts) : 12 h AM/PM, heure de Conakry.
  return heureDepuisHorodatage(iso) || "—";
}
export function dureeAffichee(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}
export function nomPropre(nom: string): string {
  return nom.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}
function initiales(nom: string): string {
  const p = nom.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase();
}

function abonnerReseau(notifier: () => void): () => void {
  window.addEventListener("online", notifier);
  window.addEventListener("offline", notifier);
  return () => { window.removeEventListener("online", notifier); window.removeEventListener("offline", notifier); };
}
function useEnLigne(): boolean {
  return useSyncExternalStore(abonnerReseau, () => navigator.onLine, () => true);
}

export function ClockStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .cix-page{max-width:1440px;margin:0 auto;padding:24px 24px 100px}
      @media(min-width:1024px){.cix-page{padding:28px 32px 100px}}
      .cix-table{display:block}
      .cix-cards{display:none}
      @media(max-width:767px){.cix-table{display:none}.cix-cards{display:flex}}
      .cix-row:hover{background-color:${C.bgCard2}}
      .cix-dept-grid{display:grid;grid-template-columns:1fr;gap:16px;align-items:stretch}
      @media(min-width:768px){.cix-dept-grid{grid-template-columns:repeat(2,1fr)}}
      @media(min-width:1280px){.cix-dept-grid{grid-template-columns:repeat(3,1fr)}}
      .cix-card:hover{border-color:${C.border2}!important}
      .cix-card:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .cix-kpi-wrap{grid-template-columns:repeat(var(--cix-n-small),1fr)}
      @media(min-width:1280px){.cix-kpi-wrap{grid-template-columns:repeat(var(--cix-n),1fr)}}
      @media(max-width:767px){.cix-kpi-wrap{grid-template-columns:repeat(2,1fr)}}
      .cix-modal-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.4);display:flex;align-items:flex-end;justify-content:center}
      .cix-modal{width:100%;max-width:720px;max-height:94svh;display:flex;flex-direction:column;background:${C.bgCard};border:1px solid ${C.border2};border-radius:16px 16px 0 0}
      @media(min-width:768px){.cix-modal-overlay{align-items:center;padding:24px}.cix-modal{border-radius:16px;max-height:90svh}}
      .cix-week-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}
      .cix-week-times{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      @media(max-width:767px){.cix-week-times{flex-basis:100%;padding-left:56px}}
      .cix-types{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
      @media(min-width:900px){.cix-types{grid-template-columns:repeat(4,1fr)}}
      .cix-row:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .cix-btn:focus-visible,.cix-input:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .cix-skel{background:${C.bg3};border-radius:6px;animation:cixPulse 1.4s ease-in-out infinite}
      @keyframes cixPulse{0%,100%{opacity:1}50%{opacity:.5}}
      .cix-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      @media(prefers-reduced-motion:reduce){.cix-skel{animation:none}.cix-btn{transition:none!important}}
    `}</style>
  );
}

// ── En-tête, menu de configuration, onglets ──────────────────────────────
export function ClockHeader({ C, description, config }: { C: ThemeTokens; description: string; config: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 16px", marginBottom: "20px" }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Clock In Shift</h1>
        <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>{description}</p>
      </div>
      <div style={{ flexShrink: 0 }}>{config}</div>
    </div>
  );
}

export function ClockConfigMenu({ C, portailUrl, onPortail, onZone, onCopy }: {
  C: ThemeTokens; portailUrl: string | null; onPortail: () => void; onZone: () => void; onCopy: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { setOuvert(false); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [ouvert]);
  const entree = (icone: ReactNode, titre: string, sous: ReactNode, onClick: () => void) => (
    <button type="button" role="menuitem" onClick={() => { setOuvert(false); onClick(); }} className="cix-btn tap"
      style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: C.t1 }}>
      <span aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: C.bg3, color: C.t2, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icone}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "14px", fontWeight: 500 }}>{titre}</span>
        <span style={{ display: "block", fontSize: "12.5px", color: C.t2, marginTop: "2px", overflowWrap: "anywhere" }}>{sous}</span>
      </span>
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ height: "36px" }} onClick={() => setOuvert(v => !v)}
        icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}>
        Configuration
      </Button>
      {ouvert && (
        <div role="menu" aria-label="Configuration du pointage" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, width: "min(360px, calc(100vw - 32px))", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", overflow: "hidden" }}>
          {portailUrl && entree(
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M17 20v.01M20 20v.01"/></svg>,
            "Portail employé — QR & lien", portailUrl.replace(/^https?:\/\//, ""), onPortail,
          )}
          {portailUrl && (
            <div style={{ padding: "0 14px 10px 58px" }}>
              <button type="button" onClick={onCopy} className="cix-btn tap" style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.t1, fontSize: "12px", fontWeight: 500, padding: "3px 10px", cursor: "pointer" }}>Copier le lien</button>
            </div>
          )}
          {portailUrl && <div role="separator" style={{ height: "1px", backgroundColor: C.border }}/>}
          {entree(
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
            "Zone de travail géolocalisée", "Signale les pointages hors-zone, sans jamais les bloquer", onZone,
          )}
        </div>
      )}
    </div>
  );
}

export type ClockTabDef = { key: string; label: string; count?: number };
export function ClockTabs({ C, tabs, active, onChange, hostRef, marge = 20, ariaLabel = "Sections de Clock In Shift", idPrefix = "cix-tab" }: { C: ThemeTokens; tabs: ClockTabDef[]; active: string; onChange: (k: string) => void; hostRef?: (el: HTMLDivElement | null) => void; marge?: number; ariaLabel?: string; idPrefix?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(tabs[n].key);
    refs.current[n]?.focus();
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", borderBottom: `1px solid ${C.border}`, marginBottom: `${marge}px` }}>
      <div role="tablist" aria-label={ariaLabel} style={{ display: "flex", gap: "4px", overflowX: "auto" }}>
        {tabs.map((t, i) => {
          const on = t.key === active;
          return (
            <button key={t.key} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={`${idPrefix}-${t.key}`} aria-selected={on} tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.key)} onKeyDown={e => onKey(e, i)} className="cix-btn tap"
              style={{ height: "40px", padding: "0 12px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, marginBottom: "-1px", color: on ? C.t1 : C.t2, fontSize: "14px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {t.label}
              {t.count !== undefined && <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", backgroundColor: C.bg3, color: C.t2, fontSize: "11.5px", fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px", fontVariantNumeric: "tabular-nums" }}>{t.count}</span>}
            </button>
          );
        })}
      </div>
      {hostRef && <div ref={hostRef} style={{ minHeight: "20px" }}/>}
    </div>
  );
}

export function LiveIndicator({ C, sync, calcul, calculPerime }: { C: ThemeTokens; sync: string; calcul: string | null; calculPerime: boolean }) {
  const enLigne = useEnLigne();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
      <span aria-live="polite" title={calcul ?? undefined} style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t3, fontSize: "12px" }}>
        <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: enLigne ? C.green : C.t3 }}/>
        {enLigne ? `Live · ${sync}` : "Hors ligne"}
      </span>
      {calcul && calculPerime && <span style={{ color: C.red, fontSize: "12px", fontWeight: 500 }}>{calcul} — le job semble à l&apos;arrêt, à vérifier</span>}
    </div>
  );
}

// ── Champ de recherche partagé (Présences + Employés) ────────────────────
export function ClockSearchField({ C, value, onChange, placeholder, label, width = 240 }: {
  C: ThemeTokens; value: string; onChange: (v: string) => void; placeholder: string; label: string; width?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // L'écran reste monté en arrière-plan : on n'agit que s'il est visible.
      if (!ref.current || ref.current.offsetParent === null) return;
      e.preventDefault();
      ref.current.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div style={{ position: "relative", width: `${width}px`, maxWidth: "100%" }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input ref={ref} className="cix-input" value={value} onChange={e => onChange(e.target.value)} aria-label={label} placeholder={placeholder}
        style={{ width: "100%", height: "34px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 30px 0 32px", color: C.t1, fontSize: "13px", fontFamily: "inherit" }}/>
      {value ? (
        <button type="button" className="cix-btn tap" aria-label="Effacer la recherche" onClick={() => { onChange(""); ref.current?.focus(); }}
          style={{ position: "absolute", right: "5px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "6px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      ) : (
        <kbd aria-hidden="true" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "inherit" }}>/</kbd>
      )}
    </div>
  );
}

// ── Barre d'outils des présences ─────────────────────────────────────────
export function AttendanceToolbar({ C, date, aujourdhui, hier, onDate, onPrecedent, onSuivant, search, onSearch, onRefresh, onExport, onRapport, rapportOuvert }: {
  C: ThemeTokens; date: string; aujourdhui: string; hier: string; onDate: (d: string) => void; onPrecedent: () => void; onSuivant: () => void;
  search: string; onSearch: (v: string) => void; onRefresh: () => void; onExport: () => void; onRapport: () => void; rapportOuvert: boolean;
}) {
  const ui = toUiTokens(C);
  const carre: React.CSSProperties = { width: "34px", height: "34px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, cursor: "pointer" };
  const seg = (on: boolean, i: number): React.CSSProperties => ({ height: "34px", padding: "0 12px", border: "none", borderLeft: i > 0 ? `1px solid ${C.border2}` : "none", backgroundColor: on ? C.bg3 : "transparent", color: on ? C.t1 : C.t2, fontSize: "12.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", boxShadow: on ? `inset 0 -2px 0 ${C.gold}` : "none" });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px 16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <button type="button" className="cix-btn tap" aria-label="Jour précédent" onClick={onPrecedent} style={carre}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <input type="date" className="cix-input" aria-label="Date des présences" value={date} onChange={e => onDate(e.target.value)}
            style={{ height: "34px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 10px", color: C.t1, fontSize: "13px", fontFamily: "inherit" }}/>
          <button type="button" className="cix-btn tap" aria-label="Jour suivant" onClick={onSuivant} disabled={date >= aujourdhui} style={{ ...carre, opacity: date >= aujourdhui ? 0.4 : 1, cursor: date >= aujourdhui ? "default" : "pointer" }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
        <div role="group" aria-label="Raccourcis de date" style={{ display: "inline-flex", border: `1px solid ${C.border2}`, borderRadius: "8px", overflow: "hidden", backgroundColor: C.bgCard }}>
          <button type="button" aria-pressed={date === aujourdhui} onClick={() => onDate(aujourdhui)} className="cix-btn tap" style={seg(date === aujourdhui, 0)}>Aujourd&apos;hui</button>
          <button type="button" aria-pressed={date === hier} onClick={() => onDate(hier)} className="cix-btn tap" style={seg(date === hier, 1)}>Hier</button>
        </div>
        <ClockSearchField C={C} value={search} onChange={onSearch} label="Rechercher un employé" placeholder="Rechercher un employé…"/>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <button type="button" className="cix-btn tap" aria-label="Actualiser les présences" title="Actualiser" onClick={onRefresh} style={carre}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onExport}
          icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}>
          Exporter
        </Button>
        <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onRapport} style={rapportOuvert ? { backgroundColor: C.bg3 } : undefined}>Rapport de période</Button>
      </div>
    </div>
  );
}

// ── Bande KPI ────────────────────────────────────────────────────────────
export type AttendanceKpi = {
  key: string; label: string; titre?: string; value: string; unit?: string; dot?: string; alerte?: boolean; ambre?: boolean;
  delta?: number | null; unite?: "valeur" | "pts"; onClick?: () => void; active?: boolean;
};
function DeltaBadge({ C, delta, unite }: { C: ThemeTokens; delta: number | null; unite: "valeur" | "pts" }) {
  if (delta === null) return <span style={{ fontSize: "12px", color: C.t3, whiteSpace: "nowrap" }}>Pas de comparaison</span>;
  if (delta === 0) return <span title="Stable par rapport à hier" style={{ display: "inline-flex", alignItems: "center", height: "20px", padding: "0 6px", borderRadius: "5px", backgroundColor: C.bg3, color: C.t2, fontSize: "11.5px", fontWeight: 600 }}>Stable</span>;
  const up = delta > 0;
  const color = up ? C.green : C.red;
  return (
    <span title="Variation par rapport à hier" style={{ display: "inline-flex", alignItems: "center", gap: "3px", height: "20px", padding: "0 6px", borderRadius: "5px", backgroundColor: `${color}1c`, color, fontSize: "11.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" fill="currentColor">{up ? <path d="M5 1l4 7H1z"/> : <path d="M5 9L1 2h8z"/>}</svg>
      {up ? "+" : "−"}{Math.abs(delta)}{unite === "pts" ? " pts" : ""}
    </span>
  );
}
export function AttendanceSummary({ C, items, repli }: { C: ThemeTokens; items: AttendanceKpi[]; repli?: number }) {
  // repli : nombre de colonnes sous 1280 px (lignes d'égale hauteur, jamais une
  // carte orpheline) ; sans repli, la bande défile horizontalement.
  const style: React.CSSProperties & Record<string, string | number> = repli
    ? { display: "grid", gap: "1px", backgroundColor: C.border, "--cix-n": items.length, "--cix-n-small": repli }
    : { display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(140px, 1fr))`, minWidth: "max-content", width: "100%" };
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflowX: repli ? "hidden" : "auto", marginBottom: "16px" }}>
      <div className={repli ? "cix-kpi-wrap" : undefined} style={style}>
        {items.map((it, i) => {
          const couleurValeur = it.alerte ? C.red : it.ambre ? C.orange : C.t1;
          const contenu = (
            <>
              <div title={it.titre ?? it.label} style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {it.dot && <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: it.dot, flexShrink: 0 }}/>}
                {it.label}
              </div>
              <div style={{ color: couleurValeur, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, marginTop: "4px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {it.value}{it.unit && <span style={{ color: C.t3, fontSize: "14px", fontWeight: 500, marginLeft: "3px" }}>{it.unit}</span>}
              </div>
              {it.delta !== undefined && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                  <DeltaBadge C={C} delta={it.delta} unite={it.unite ?? "valeur"}/>
                  {it.delta !== null && it.delta !== 0 && <span style={{ fontSize: "11.5px", color: C.t3 }}>vs hier</span>}
                </div>
              )}
            </>
          );
          const cell: React.CSSProperties = {
            minHeight: "88px", padding: "14px 16px", minWidth: 0, textAlign: "left", font: "inherit", border: "none",
            backgroundColor: C.bgCard, borderLeft: !repli && i > 0 ? `1px solid ${C.border}` : "none",
            boxShadow: it.active ? `inset 0 -2px 0 ${C.gold}` : "none",
          };
          return it.onClick ? (
            <button key={it.key} type="button" aria-pressed={it.active} onClick={it.onClick} className="cix-btn tap" style={{ ...cell, cursor: "pointer" }}>{contenu}</button>
          ) : (
            <div key={it.key} style={cell}>{contenu}</div>
          );
        })}
      </div>
    </div>
  );
}

// ── Alertes groupées ─────────────────────────────────────────────────────
export type AttendanceAlert = { key: string; texte: string; noms: string[]; detail?: string; action?: { label: string; onClick: () => void } };
export function AttendanceAlerts({ C, lignes, titre, suggestions }: { C: ThemeTokens; lignes: AttendanceAlert[]; titre?: string; suggestions?: string[] }) {
  const [ouvert, setOuvert] = useState(true);
  const nbSuggestions = suggestions?.length ?? 0;
  if (lignes.length === 0 && nbSuggestions === 0) return null;
  const titreAffiche = titre ?? (lignes.length > 0 ? `${lignes.length} point${lignes.length > 1 ? "s" : ""} d'attention` : "Analyse automatique");
  return (
    <div style={{ backgroundColor: `${C.orange}0f`, border: `1px solid ${C.orange}33`, borderRadius: "12px", marginBottom: "16px" }}>
      <button type="button" aria-expanded={ouvert} onClick={() => setOuvert(v => !v)} className="cix-btn tap"
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span style={{ flex: 1, color: C.t1, fontSize: "14px", fontWeight: 600 }}>{titreAffiche}</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" style={{ transform: ouvert ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {ouvert && (
        <div style={{ padding: "0 16px 14px 40px" }}>
          {lignes.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              {lignes.map(l => (
                <li key={l.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>{l.texte}{l.detail && <span style={{ color: C.t2, fontWeight: 400 }}> — {l.detail}</span>}</div>
                    {l.noms.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                        {l.noms.map((n, i) => <span key={`${n}-${i}`} style={{ height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.t1, fontSize: "12.5px", display: "inline-flex", alignItems: "center" }}>{nomPropre(n)}</span>)}
                      </div>
                    )}
                  </div>
                  {l.action && <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ flexShrink: 0 }} onClick={l.action.onClick}>{l.action.label}</Button>}
                </li>
              ))}
            </ul>
          )}
          {nbSuggestions > 0 && (
            <div style={{ marginTop: lignes.length > 0 ? "14px" : 0, paddingTop: lignes.length > 0 ? "12px" : 0, borderTop: lignes.length > 0 ? `1px solid ${C.orange}26` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
                Analyse automatique
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                {suggestions?.map((t, i) => <li key={i} style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.5 }}>{t}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tableau des présences ────────────────────────────────────────────────
export type AttendanceRow = {
  id: string; nom: string; departement: string | null; statut: string; statutColor: string;
  corrige: boolean; horsZone: boolean; entree: string; sortie: string; heures: string; pointages: number;
};
export function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${color}1c`, color, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "currentColor" }}/>{label}
    </span>
  );
}
export function AttendanceStatusBadge({ C, label, color, corrige, horsZone }: { C: ThemeTokens; label: string; color: string; corrige: boolean; horsZone: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${color}1c`, color, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
        <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "currentColor" }}/>{label}
      </span>
      {corrige && <span style={{ color: C.t3, fontSize: "12px" }}>corrigé</span>}
      {horsZone && <span title="Un pointage de ce jour a eu lieu en dehors de la zone de travail définie" style={{ height: "20px", padding: "0 6px", borderRadius: "5px", backgroundColor: `${C.red}1c`, color: C.red, fontSize: "11.5px", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>Hors zone</span>}
    </span>
  );
}
function Avatar({ C, nom }: { C: ThemeTokens; nom: string }) {
  return <span aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initiales(nom)}</span>;
}
export function AttendanceTable({ C, rows }: { C: ThemeTokens; rows: AttendanceRow[] }) {
  const COLS: { h: string; right?: boolean; w?: string }[] = [
    { h: "Employé" }, { h: "Statut", w: "220px" }, { h: "Entrée", w: "110px" }, { h: "Sortie", w: "110px" },
    { h: "Heures travaillées", right: true, w: "160px" }, { h: "Pointages", right: true, w: "110px" },
  ];
  return (
    <>
      <div className="cix-table" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "auto", maxHeight: "68svh" }}>
        <table style={{ width: "100%", minWidth: "860px", tableLayout: "fixed", borderCollapse: "collapse" }}>
          <colgroup>{COLS.map(c => <col key={c.h} style={{ width: c.w }}/>)}</colgroup>
          <thead>
            <tr>
              {COLS.map(c => <th key={c.h} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, textAlign: c.right ? "right" : "left", padding: "10px 14px", color: C.t2, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>{c.h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const td = { padding: "0 14px", height: "60px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" } as const;
              const num = { ...td, fontSize: "14px", color: C.t1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;
              const vide = (v: string) => v === "—" ? C.t3 : C.t1;
              return (
                <tr key={r.id} className="cix-row">
                  <td style={{ ...td, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <Avatar C={C} nom={r.nom}/>
                      <div style={{ minWidth: 0 }}>
                        <div title={r.nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nom}</div>
                        {r.departement && <div title={r.departement} style={{ color: C.t3, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.departement}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={td}><AttendanceStatusBadge C={C} label={r.statut} color={r.statutColor} corrige={r.corrige} horsZone={r.horsZone}/></td>
                  <td style={{ ...num, color: vide(r.entree) }}>{r.entree}</td>
                  <td style={{ ...num, color: vide(r.sortie) }}>{r.sortie}</td>
                  <td style={{ ...num, textAlign: "right" }}>{r.heures}</td>
                  <td style={{ ...num, textAlign: "right", color: C.t2 }}>{r.pointages}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cix-cards" style={{ flexDirection: "column", gap: "10px" }}>
        {rows.map(r => (
          <div key={r.id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <Avatar C={C} nom={r.nom}/>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflowWrap: "anywhere" }}>{r.nom}</div>
                  {r.departement && <div style={{ color: C.t3, fontSize: "12px" }}>{r.departement}</div>}
                </div>
              </div>
              <AttendanceStatusBadge C={C} label={r.statut} color={r.statutColor} corrige={r.corrige} horsZone={r.horsZone}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
              <span>Entrée {r.entree}</span><span>Sortie {r.sortie}</span><span>{r.heures}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function AttendanceSkeleton() {
  return (
    <div role="status" aria-label="Chargement des présences">
      <div className="cix-skel" style={{ height: "88px", borderRadius: "12px", marginBottom: "16px" }}/>
      <div style={{ borderRadius: "12px", overflow: "hidden", border: "1px solid transparent" }}>
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="cix-skel" style={{ height: "52px", marginBottom: "8px" }}/>)}
      </div>
    </div>
  );
}

export function AttendanceError({ C, onRetry }: { C: ThemeTokens; onRetry: () => void }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "32px", textAlign: "center" }}>
      <div role="alert" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Impossible de charger les présences</div>
      <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Vérifiez votre connexion puis réessayez.</div>
      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button>
    </div>
  );
}

// ── Briques partagées par les barres d'outils (Employés, Départements) ───
export function FilterChips({ C, chips }: { C: ThemeTokens; chips: { key: string; label: string; onRemove: () => void }[] }) {
  if (chips.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
      {chips.map(c => (
        <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "24px", padding: "0 4px 0 9px", borderRadius: "6px", backgroundColor: C.bg3, color: C.t1, fontSize: "12px", maxWidth: "100%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
          <button type="button" className="cix-btn tap" aria-label={`Retirer le filtre ${c.label}`} onClick={c.onRemove}
            style={{ width: "18px", height: "18px", borderRadius: "4px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </span>
      ))}
    </div>
  );
}
export function RefreshIconButton({ C, label, onClick }: { C: ThemeTokens; label: string; onClick: () => void }) {
  return (
    <button type="button" className="cix-btn tap" aria-label={label} title="Actualiser" onClick={onClick}
      style={{ width: "34px", height: "34px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, cursor: "pointer" }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    </button>
  );
}

// ── Employés ─────────────────────────────────────────────────────────────
export function EmployeesToolbar({ C, avecDonnees, search, onSearch, statutOptions, statut, onStatut, roleOptions, role, onRole, avancesOuvert, onToggleAvances, avancesCount, chips, onReset, filtreActif, total, canCreate, onCreate, onRefresh, onPrint, onExport }: {
  C: ThemeTokens; avecDonnees: boolean; search: string; onSearch: (v: string) => void;
  statutOptions: { value: string; label: string }[]; statut: string; onStatut: (v: string) => void;
  roleOptions: { value: string; label: string }[]; role: string; onRole: (v: string) => void;
  avancesOuvert: boolean; onToggleAvances: () => void; avancesCount: number;
  chips: { key: string; label: string; onRemove: () => void }[]; onReset: () => void; filtreActif: boolean; total: number;
  canCreate: boolean; onCreate: () => void; onRefresh: () => void; onPrint: () => void; onExport: () => void;
}) {
  const ui = toUiTokens(C);
  const select: React.CSSProperties = { height: "34px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 10px", color: C.t1, fontSize: "13px", fontFamily: "inherit" };
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          {avecDonnees && (
            <>
              <ClockSearchField C={C} value={search} onChange={onSearch} width={320} label="Rechercher un employé" placeholder="Rechercher un employé, matricule, téléphone, département, poste…"/>
              <select aria-label="Filtrer par statut" value={statut} onChange={e => onStatut(e.target.value)} className="cix-input" style={select}>
                {statutOptions.map(o => <option key={o.value} value={o.value}>{o.value === "tous" ? "Tous les statuts" : o.label}</option>)}
              </select>
              <select aria-label="Filtrer par rôle" value={role} onChange={e => onRole(e.target.value)} className="cix-input" style={select}>
                {roleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" aria-expanded={avancesOuvert} onClick={onToggleAvances} className="cix-btn tap"
                style={{ height: "34px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: avancesOuvert ? C.bg3 : C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "12.5px", fontWeight: 500, cursor: "pointer" }}>
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                Filtres avancés
                {avancesCount > 0 && <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", backgroundColor: C.gold, color: "#000", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{avancesCount}</span>}
              </button>
              {filtreActif && <button type="button" className="cix-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>}
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          {avecDonnees && <span aria-live="polite" style={{ color: C.t2, fontSize: "13px", marginRight: "4px", fontVariantNumeric: "tabular-nums" }}>{total} employé{total > 1 ? "s" : ""}</span>}
          {avecDonnees && (
            <>
              <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onPrint}
                icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>}>Imprimer</Button>
              <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onExport}
                icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}>Exporter</Button>
            </>
          )}
          <RefreshIconButton C={C} label="Actualiser la liste des employés" onClick={onRefresh}/>
          {canCreate && (
            <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onCreate}
              icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>Nouvel employé</Button>
          )}
        </div>
      </div>
      <FilterChips C={C} chips={chips}/>
    </div>
  );
}

export type EmployeeTableRow = {
  id: string; nom: string; matricule: string; departement: string | null; poste: string | null; horaire: string | null;
  role: string; roleColor: string; statut: string; statutColor: string; inactif: boolean; peutAssigner: boolean;
  onOpen: () => void; onAssigner: () => void;
};
export function RoleBadge({ label, color }: { label: string; color: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", boxSizing: "border-box", backgroundColor: `${color}14`, border: `1px solid ${color}40`, color, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>;
}
function Vide({ C, ancre }: { C: ThemeTokens; ancre?: ReactNode }) {
  return ancre ? <>{ancre}</> : <span style={{ color: C.t3, fontSize: "13px" }}>Non assigné</span>;
}
export function EmployeesTable({ C, rows }: { C: ThemeTokens; rows: EmployeeTableRow[] }) {
  const COLS: { h: string; w?: string }[] = [
    { h: "Employé" }, { h: "Matricule", w: "120px" }, { h: "Département", w: "160px" }, { h: "Poste", w: "160px" },
    { h: "Horaire", w: "170px" }, { h: "Rôle", w: "110px" }, { h: "Statut", w: "130px" }, { h: "", w: "44px" },
  ];
  const ouvrir = (r: EmployeeTableRow) => (e: KeyboardEvent) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); r.onOpen(); } };
  const assigner = (C2: ThemeTokens, r: EmployeeTableRow) => r.peutAssigner ? (
    <button type="button" className="cix-btn tap" onClick={e => { e.stopPropagation(); r.onAssigner(); }} aria-label={`Assigner un horaire à ${r.nom}`}
      style={{ height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${C2.orange}1c`, border: "none", color: C2.orange, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Assigner</button>
  ) : undefined;
  return (
    <>
      <div className="cix-table" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "auto", maxHeight: "68svh" }}>
        <table style={{ width: "100%", minWidth: "1080px", tableLayout: "fixed", borderCollapse: "collapse" }}>
          <colgroup>{COLS.map((c, i) => <col key={i} style={{ width: c.w }}/>)}</colgroup>
          <thead>
            <tr>
              {COLS.map((c, i) => <th key={i} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, textAlign: "left", padding: "10px 14px", color: C.t2, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>{c.h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const td = { padding: "0 14px", height: "60px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", overflow: "hidden", color: r.inactif ? C.t3 : C.t1 } as const;
              const texte = (v: string | null) => v ? <span title={v} style={{ display: "block", fontSize: "14px", color: r.inactif ? C.t3 : C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span> : <Vide C={C}/>;
              return (
                <tr key={r.id} className="cix-row tap" tabIndex={0} onClick={r.onOpen} onKeyDown={ouvrir(r)} style={{ cursor: "pointer" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <Avatar C={C} nom={r.nom}/>
                      <span title={r.nom} style={{ fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nom}</span>
                    </div>
                  </td>
                  <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: "12px", color: C.t2 }}>{r.matricule}</td>
                  <td style={td}>{texte(r.departement)}</td>
                  <td style={td}>{texte(r.poste)}</td>
                  <td style={td}>{r.horaire ? texte(r.horaire) : <Vide C={C} ancre={assigner(C, r)}/>}</td>
                  <td style={td}><RoleBadge label={r.role} color={r.roleColor}/></td>
                  <td style={td}><StatusPill label={r.statut} color={r.statutColor}/></td>
                  <td style={{ ...td, textAlign: "right" }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cix-cards" style={{ flexDirection: "column", gap: "10px" }}>
        {rows.map(r => (
          <div key={r.id} role="button" tabIndex={0} className="cix-row tap" onClick={r.onOpen} onKeyDown={ouvrir(r)}
            style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <Avatar C={C} nom={r.nom}/>
                <span style={{ color: r.inactif ? C.t3 : C.t1, fontSize: "14px", fontWeight: 500, overflowWrap: "anywhere" }}>{r.nom}</span>
              </div>
              <StatusPill label={r.statut} color={r.statutColor}/>
            </div>
            <div style={{ color: C.t2, fontSize: "13px", display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>{r.matricule}</span>
              <span>{r.departement ?? "Non assigné"}</span>
              <span>{r.poste ?? "Non assigné"}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export type RepartitionDept = { id: string; nom: string; n: number };
export type RepartitionStatut = { key: string; label: string; color: string; n: number };
export function DistributionCard({ C, departements, sansDepartement, statuts, total, titreDroite = "Répartition par statut", totalDroite }: {
  C: ThemeTokens; departements: RepartitionDept[]; sansDepartement: number; statuts: RepartitionStatut[]; total: number;
  titreDroite?: string; totalDroite?: number;
}) {
  const totalD = totalDroite ?? total;
  // Repliée par défaut sous 1280 px (l'écran est monté après chargement, jamais rendu côté serveur).
  const [ouvert, setOuvert] = useState(() => typeof window === "undefined" ? true : window.innerWidth >= 1280);
  const max = Math.max(...departements.map(d => d.n), 1);
  const aucunRattache = total > 0 && departements.every(d => d.n === 0);
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", marginTop: "20px" }}>
      <button type="button" aria-expanded={ouvert} onClick={() => setOuvert(v => !v)} className="cix-btn tap"
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "none", border: "none", cursor: "pointer" }}>
        <span style={{ color: C.t1, fontSize: "16px", fontWeight: 600 }}>Répartition</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" style={{ transform: ouvert ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {ouvert && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", padding: "0 20px 20px" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Employés par département</div>
            {departements.length === 0 ? (
              <div style={{ color: C.t2, fontSize: "13px" }}>Aucun département créé.</div>
            ) : aucunRattache ? (
              <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>Aucun employé rattaché à un département.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {departements.map(d => (
                  <div key={d.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px", fontVariantNumeric: "tabular-nums" }}>
                      <span title={d.nom} style={{ color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</span>
                      <span style={{ color: C.t1, fontWeight: 600, flexShrink: 0, marginLeft: "8px" }}>{d.n} · {total > 0 ? Math.round((d.n / total) * 100) : 0} %</span>
                    </div>
                    <div role="img" aria-label={`${d.nom} : ${d.n} employé${d.n > 1 ? "s" : ""}`} style={{ height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(d.n / max) * 100}%`, backgroundColor: C.gold, borderRadius: "3px" }}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {sansDepartement > 0 && <div style={{ color: C.t3, fontSize: "12px", marginTop: "12px" }}>{sansDepartement} employé{sansDepartement > 1 ? "s" : ""} sans département</div>}
          </div>
          <div>
            <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{titreDroite}</div>
            <div role="img" aria-label={statuts.map(s => `${s.label} ${s.n}`).join(", ")} style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", backgroundColor: C.bg3 }}>
              {statuts.map(s => <div key={s.key} style={{ width: `${totalD > 0 ? (s.n / totalD) * 100 : 0}%`, backgroundColor: s.color }}/>)}
            </div>
            <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
              {statuts.map(s => (
                <li key={s.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                  <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: s.color, flexShrink: 0 }}/>
                  <span style={{ color: C.t2, flex: 1 }}>{s.label}</span>
                  <span style={{ color: C.t1, fontWeight: 600 }}>{s.n} · {totalD > 0 ? Math.round((s.n / totalD) * 100) : 0} %</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Départements ─────────────────────────────────────────────────────────
export function DepartmentsToolbar({ C, avecDonnees, search, onSearch, filtres, filtreActif, onFiltre, chips, onReset, aFiltre, total, canCreate, onCreate, onRefresh, onExport, unite = "département", placeholder = "Rechercher un département…", createLabel = "Nouveau département" }: {
  C: ThemeTokens; avecDonnees: boolean; search: string; onSearch: (v: string) => void;
  filtres: { key: string; label: string; count: number }[]; filtreActif: string; onFiltre: (k: string) => void;
  chips: { key: string; label: string; onRemove: () => void }[]; onReset: () => void; aFiltre: boolean; total: number;
  canCreate: boolean; onCreate: () => void; onRefresh?: () => void; onExport?: () => void;
  unite?: string; placeholder?: string; createLabel?: string;
}) {
  const ui = toUiTokens(C);
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          {avecDonnees && (
            <>
              <ClockSearchField C={C} value={search} onChange={onSearch} width={320} label={placeholder.replace("…", "")} placeholder={placeholder}/>
              <div role="group" aria-label="Filtrer les départements" style={{ display: "flex", gap: "2px", overflowX: "auto", maxWidth: "100%" }}>
                {filtres.map(f => {
                  const on = f.key === filtreActif;
                  return (
                    <button key={f.key} type="button" aria-pressed={on} onClick={() => onFiltre(f.key)} className="cix-btn tap"
                      style={{ height: "34px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, color: on ? C.t1 : C.t2, fontSize: "13px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {f.label}
                      <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
                    </button>
                  );
                })}
              </div>
              {aFiltre && <button type="button" className="cix-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>}
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          {avecDonnees && <span aria-live="polite" style={{ color: C.t2, fontSize: "13px", marginRight: "4px", fontVariantNumeric: "tabular-nums" }}>{total} {unite}{total > 1 ? "s" : ""}</span>}
          {onExport && (
            <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onExport}
              icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}>Exporter</Button>
          )}
          {onRefresh && <RefreshIconButton C={C} label={`Actualiser la liste (${unite}s)`} onClick={onRefresh}/>}
          {canCreate && (
            <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onCreate}
              icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>{createLabel}</Button>
          )}
        </div>
      </div>
      <FilterChips C={C} chips={chips}/>
    </div>
  );
}

export type DepartmentCardData = {
  id: string; nom: string; nbEmployes: number; manager: string | null; badges: string[];
  retards: number; absences: number; taux: number | null; horaire: string | null; enAlerte: boolean;
  peutAssigner: boolean; onOpen: () => void; onCorriger: () => void;
};
export function DepartmentGrid({ C, cartes }: { C: ThemeTokens; cartes: DepartmentCardData[] }) {
  const stat = (label: string, valeur: number, couleur: string) => (
    <div>
      <div style={{ color: valeur > 0 ? couleur : C.t1, fontSize: "18px", fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{valeur}</div>
      <div style={{ color: C.t3, fontSize: "12px" }}>{label}</div>
    </div>
  );
  return (
    <div className="cix-dept-grid">
      {cartes.map(d => {
        const nom = nomPropre(d.nom);
        return (
          <div key={d.id} role="button" tabIndex={0} className="cix-card tap" onClick={d.onOpen}
            onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); d.onOpen(); } }}
            style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
              <div title={nom} style={{ color: C.t1, fontSize: "16px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{nom}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "flex-end", flexShrink: 0, maxWidth: "60%" }}>
                {d.badges.map(b => <StatusPill key={b} label={b} color={C.orange}/>)}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", color: C.t2, fontSize: "13px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                {d.nbEmployes} employé{d.nbEmployes > 1 ? "s" : ""}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                <span>Manager :</span>
                {d.manager ? <span title={d.manager} style={{ color: C.t1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.manager}</span> : <span style={{ color: C.t3 }}>Non assigné</span>}
                {!d.manager && d.peutAssigner && (
                  <button type="button" className="cix-btn tap" onClick={e => { e.stopPropagation(); d.onCorriger(); }} aria-label={`Assigner un manager à ${nom}`}
                    style={{ height: "20px", padding: "0 7px", borderRadius: "5px", backgroundColor: `${C.orange}1c`, border: "none", color: C.orange, fontSize: "11.5px", fontWeight: 600, cursor: "pointer" }}>Assigner</button>
                )}
              </span>
              {d.horaire && <span style={{ color: C.t3, fontSize: "12px" }}>Horaire principal : {d.horaire}</span>}
            </div>

            <div style={{ display: "flex", gap: "28px" }}>
              {stat("Retards", d.retards, C.orange)}
              {stat("Absences", d.absences, C.red)}
            </div>

            <div style={{ marginTop: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "12px", marginBottom: "6px" }}>
                <span style={{ color: C.t3 }}>Présence aujourd&apos;hui</span>
                {d.taux === null ? <span style={{ color: C.t3 }}>Aucune donnée</span> : <span style={{ color: C.t1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{d.taux} %</span>}
              </div>
              <div role="img" aria-label={d.taux === null ? "Aucune donnée de présence" : `Présence ${d.taux} %`}
                style={{ height: "6px", borderRadius: "3px", overflow: "hidden", backgroundColor: d.taux === null ? "transparent" : C.bg3, border: d.taux === null ? `1px dashed ${C.border2}` : "none", boxSizing: "border-box" }}>
                {d.taux !== null && <div style={{ height: "100%", width: `${d.taux}%`, backgroundColor: d.taux < 80 ? C.orange : C.green, borderRadius: "3px" }}/>}
              </div>
            </div>

            {d.enAlerte && (
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "4px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => d.onCorriger()}>Corriger</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Horaires ─────────────────────────────────────────────────────────────
export type PlageHoraire = { debut: string; fin: string };
export type JourPlanning = { key: string; label: string; repos: boolean; segments: PlageHoraire[] };

function fmt12(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}
function minutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// Résumé hebdomadaire calculé à l'affichage uniquement, à partir du pattern existant.
export function resumeSemaine(jours: JourPlanning[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < jours.length) {
    const cle = (j: JourPlanning) => (j.repos ? "repos" : JSON.stringify(j.segments));
    let k = i;
    while (k + 1 < jours.length && cle(jours[k + 1]) === cle(jours[i])) k++;
    const jours_ = i === k ? jours[i].label : `${jours[i].label}–${jours[k].label}`;
    parts.push(`${jours_} ${jours[i].repos ? "repos" : jours[i].segments.map(g => `${fmt12(g.debut)}–${fmt12(g.fin)}`).join(" + ")}`);
    i = k + 1;
  }
  return parts.join(" · ");
}
export function heuresSemaine(jours: JourPlanning[], nuit: boolean): number {
  let total = 0;
  for (const j of jours) {
    if (j.repos) continue;
    for (const g of j.segments) {
      const a = minutes(g.debut); const b = minutes(g.fin);
      if (a === null || b === null) continue;
      let d = b - a;
      if (d <= 0 && nuit) d += 1440;
      if (d > 0) total += d;
    }
  }
  return total;
}
// Avertissements d'affichage uniquement (le serveur reste seul juge de la validité).
export function avertissementsJour(j: JourPlanning, nuit: boolean): string[] {
  if (j.repos) return [];
  const out: string[] = [];
  for (const g of j.segments) {
    const a = minutes(g.debut); const b = minutes(g.fin);
    if (a !== null && b !== null && b <= a && !nuit) { out.push("L'heure de fin doit être après l'heure de début."); break; }
  }
  if (!nuit) {
    const tri = j.segments.map(g => ({ a: minutes(g.debut), b: minutes(g.fin) })).filter((x): x is { a: number; b: number } => x.a !== null && x.b !== null).sort((x, y) => x.a - y.a);
    for (let i = 1; i < tri.length; i++) if (tri[i].a < tri[i - 1].b) { out.push("Les plages de ce jour se chevauchent."); break; }
  }
  return out;
}

// ── Gabarit de modale (aligné sur « Ajouter un membre ») ─────────────────
export function ClockModal({ C, titre, sousTitre, labelId, onClose, modifie, aide, children, actions, onSubmit, largeur, entete, sousEntete }: {
  C: ThemeTokens; titre: string; sousTitre?: string; labelId: string; onClose: () => void; modifie: boolean; aide?: ReactNode; children: ReactNode; actions?: ReactNode;
  onSubmit?: () => void; largeur?: number; entete?: ReactNode; sousEntete?: ReactNode;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const modifieRef = useRef(modifie);
  const fermerRef = useRef(onClose);
  useEffect(() => { modifieRef.current = modifie; fermerRef.current = onClose; });

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const precedent = document.activeElement as HTMLElement | null;
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el).focus();
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (modifieRef.current) setConfirmer(true); else fermerRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const focusables = Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(x => x.offsetParent !== null);
      if (focusables.length === 0) return;
      const premier = focusables[0]; const dernier = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); precedent?.focus(); };
  }, []);

  const demander = () => { if (modifie) setConfirmer(true); else onClose(); };
  const ui = toUiTokens(C);
  return (
    <div className="cix-modal-overlay" onClick={demander}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} className="cix-modal" onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          // Entrée dans un champ simple soumet (l'appelant décide si le formulaire est valide).
          const t = e.target as HTMLElement;
          if (onSubmit && e.key === "Enter" && !e.shiftKey && !e.defaultPrevented && t.tagName === "INPUT" && t.getAttribute("role") !== "combobox") { e.preventDefault(); onSubmit(); }
        }}
        style={{ outline: "none", maxWidth: largeur ?? 720 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {entete ?? (
            <div style={{ minWidth: 0 }}>
              <h2 id={labelId} style={{ color: C.t1, fontSize: "20px", fontWeight: 600, margin: 0 }}>{titre}</h2>
              {sousTitre && <p style={{ color: C.t2, fontSize: "13px", margin: "2px 0 0" }}>{sousTitre}</p>}
            </div>
          )}
          <button type="button" className="cix-btn tap" aria-label="Fermer" onClick={demander}
            style={{ width: "32px", height: "32px", borderRadius: "8px", background: "none", border: "none", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {sousEntete}
        <div style={{
          flex: 1, overflowY: "auto", padding: "20px 24px",
          // ombres internes haut/bas : n'apparaissent que si le contenu défile
          backgroundImage: `linear-gradient(${C.bgCard}, ${C.bgCard}), linear-gradient(${C.bgCard}, ${C.bgCard}), linear-gradient(to bottom, rgba(0,0,0,.10), transparent), linear-gradient(to top, rgba(0,0,0,.10), transparent)`,
          backgroundPosition: "top, bottom, top, bottom", backgroundSize: "100% 24px, 100% 24px, 100% 10px, 100% 10px",
          backgroundRepeat: "no-repeat", backgroundAttachment: "local, local, scroll, scroll",
        }}>{children}</div>
        {actions !== undefined && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "14px 24px", borderTop: `1px solid ${C.border}`, flexShrink: 0, position: "sticky", bottom: 0, backgroundColor: C.bgCard, borderRadius: "0 0 16px 16px" }}>
          {confirmer ? (
            <>
              <span role="alert" style={{ color: C.t1, fontSize: "13px" }}>Abandonner les modifications ?</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => setConfirmer(false)}>Continuer l&apos;édition</Button>
                <Button tokens={ui} className="tap" variant="danger" size="md" onClick={onClose}>Abandonner</Button>
              </div>
            </>
          ) : (
            <>
              <span aria-live="polite" style={{ color: C.t2, fontSize: "12.5px", minWidth: 0, flex: 1 }}>{aide}</span>
              <div style={{ display: "flex", gap: "8px" }}>{actions}</div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

export function ModalField({ C, id, label, requis, optionnel, aide, erreur, children }: {
  C: ThemeTokens; id: string; label: string; requis?: boolean; optionnel?: boolean; aide?: string; erreur?: string | null; children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", color: C.t1, fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
        {label}
        {requis && <span aria-hidden="true" style={{ color: C.red, marginLeft: "3px" }}>*</span>}
        {optionnel && <span style={{ color: C.t3, fontWeight: 400, marginLeft: "6px" }}>(optionnel)</span>}
      </label>
      {children}
      <div aria-live="polite">
        {erreur ? <div id={`${id}-erreur`} style={{ color: C.red, fontSize: "12px", marginTop: "4px" }}>{erreur}</div>
          : aide ? <div id={`${id}-aide`} style={{ color: C.t3, fontSize: "12px", marginTop: "4px" }}>{aide}</div> : null}
      </div>
    </div>
  );
}
export function ModalSection({ C, titre, aide, children }: { C: ThemeTokens; titre: string; aide?: string; children: ReactNode }) {
  return (
    <section>
      <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: 0 }}>{titre}</h3>
      {aide && <p style={{ color: C.t2, fontSize: "12.5px", margin: "2px 0 0" }}>{aide}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>{children}</div>
    </section>
  );
}
export const champStyle = (C: ThemeTokens): React.CSSProperties => ({
  width: "100%", height: "40px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`,
  borderRadius: "8px", padding: "0 12px", color: C.t1, fontSize: "14px", fontFamily: "inherit",
});

export function ScheduleTypeCards({ C, options, value, onChange, ariaLabel = "Type d'horaire", minCarte, readOnly }: { C: ThemeTokens; options: { value: string; label: string; desc: string; badge?: string; couleur?: string }[]; value: string; onChange: (v: string) => void; ariaLabel?: string; minCarte?: number; readOnly?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + options.length) % options.length;
    if (n < 0) return;
    e.preventDefault();
    onChange(options[n].value);
    refs.current[n]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="cix-types" style={minCarte ? { gridTemplateColumns: `repeat(auto-fit, minmax(${minCarte}px, 1fr))` } : undefined}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            onClick={() => { if (!readOnly) onChange(o.value); }} onKeyDown={e => { if (!readOnly) onKey(e, i); }} className="cix-btn tap"
            style={{ position: "relative", textAlign: "left", padding: "12px 14px", borderRadius: "10px", cursor: "pointer", backgroundColor: on ? `${C.gold}12` : C.bgCard, border: `${on ? "1.5px" : "1px"} solid ${on ? C.gold : C.border2}`, boxSizing: "border-box" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t1, fontSize: "14px", fontWeight: 600 }}>{o.couleur && <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: o.couleur, flexShrink: 0 }}/>}{o.label}{o.badge && <span style={{ height: "18px", padding: "0 6px", borderRadius: "5px", backgroundColor: `${C.orange}1c`, color: C.orange, fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>{o.badge}</span>}</span>
            {o.desc && <span style={{ display: "block", color: C.t2, fontSize: "12px", marginTop: "2px", lineHeight: 1.4 }}>{o.desc}</span>}
            {on && (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: "10px", right: "10px" }}><polyline points="20 6 9 17 4 12"/></svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function WeekPlanEditor({ C, jours, nuit, onToggle, onUpdate, onAdd, onRemove, onApplyAll }: {
  C: ThemeTokens; jours: JourPlanning[]; nuit: boolean;
  onToggle: (key: string) => void; onUpdate: (key: string, idx: number, champ: "debut" | "fin", valeur: string) => void;
  onAdd: (key: string) => void; onRemove: (key: string, idx: number) => void; onApplyAll: (sourceKey: string) => void;
}) {
  const source = jours.find(j => !j.repos);
  const total = heuresSemaine(jours, nuit);
  const h = Math.floor(total / 60); const m = total % 60;
  const heure = (id: string, label: string, valeur: string, invalide: boolean, onChange: (v: string) => void) => (
    <input id={id} type="time" aria-label={label} aria-invalid={invalide || undefined} value={valeur} onChange={e => onChange(e.target.value)} className="cix-input"
      style={{ width: "124px", height: "36px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${invalide ? C.red : C.border2}`, borderRadius: "8px", padding: "0 8px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}/>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
        <span style={{ color: C.t1, fontSize: "13px", fontWeight: 500 }}>Planning hebdomadaire</span>
        <button type="button" disabled={!source} onClick={() => source && onApplyAll(source.key)} className="cix-btn tap"
          style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", height: "30px", padding: "0 10px", color: source ? C.t1 : C.t3, fontSize: "12.5px", fontWeight: 500, cursor: source ? "pointer" : "default" }}>
          Appliquer {source ? `le ${source.label.toLowerCase()}` : "un jour"} à tous les jours travaillés
        </button>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden" }}>
        {jours.map((j, ji) => {
          const warn = avertissementsJour(j, nuit);
          const errId = `cix-err-${j.key}`;
          return (
            <div key={j.key} role="group" aria-label={j.label} style={{ padding: "10px 12px", borderTop: ji > 0 ? `1px solid ${C.border}` : "none", backgroundColor: j.repos ? C.bgCard2 : C.bgCard }}>
              <div className="cix-week-row" style={{ minHeight: "32px" }}>
                <button type="button" role="switch" aria-checked={!j.repos} aria-label={`${j.label} travaillé`} onClick={() => onToggle(j.key)} className="cix-btn tap"
                  style={{ width: "40px", height: "22px", borderRadius: "11px", border: "none", backgroundColor: j.repos ? C.border2 : C.green, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: "3px", left: j.repos ? "3px" : "21px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#fff", transition: "left .15s" }}/>
                </button>
                <span style={{ color: j.repos ? C.t3 : C.t1, fontSize: "14px", fontWeight: 500, width: "40px" }}>{j.label}</span>
                {j.repos ? (
                  <span style={{ color: C.t3, fontSize: "13px" }}>Repos</span>
                ) : (
                  <div className="cix-week-times">
                    {heure(`${j.key}-0-d`, `${j.label}, début`, j.segments[0]?.debut ?? "", warn.length > 0, v => onUpdate(j.key, 0, "debut", v))}
                    <span aria-hidden="true" style={{ color: C.t3 }}>→</span>
                    {heure(`${j.key}-0-f`, `${j.label}, fin`, j.segments[0]?.fin ?? "", warn.length > 0, v => onUpdate(j.key, 0, "fin", v))}
                    {j.segments.length > 1 && (
                      <button type="button" aria-label={`Retirer la plage 1 du ${j.label.toLowerCase()}`} onClick={() => onRemove(j.key, 0)} className="cix-btn tap" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "4px", display: "flex" }}>
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                    <button type="button" onClick={() => onAdd(j.key)} className="cix-btn tap" style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", fontWeight: 500, cursor: "pointer", padding: "4px 2px", textDecoration: "underline" }}>+ Segment</button>
                  </div>
                )}
              </div>
              {!j.repos && j.segments.slice(1).map((g, idx) => (
                <div key={idx} className="cix-week-times" style={{ marginTop: "8px", paddingLeft: "92px" }}>
                  {heure(`${j.key}-${idx + 1}-d`, `${j.label}, début (plage ${idx + 2})`, g.debut, warn.length > 0, v => onUpdate(j.key, idx + 1, "debut", v))}
                  <span aria-hidden="true" style={{ color: C.t3 }}>→</span>
                  {heure(`${j.key}-${idx + 1}-f`, `${j.label}, fin (plage ${idx + 2})`, g.fin, warn.length > 0, v => onUpdate(j.key, idx + 1, "fin", v))}
                  <button type="button" aria-label={`Retirer la plage ${idx + 2} du ${j.label.toLowerCase()}`} onClick={() => onRemove(j.key, idx + 1)} className="cix-btn tap" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: "4px", display: "flex" }}>
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
              {warn.length > 0 && (
                <div id={errId} aria-live="polite" style={{ marginTop: "8px", padding: "6px 10px", borderRadius: "6px", backgroundColor: `${C.red}14`, color: C.red, fontSize: "12.5px" }}>{warn.join(" ")}</div>
              )}
            </div>
          );
        })}
      </div>
      <div aria-live="polite" style={{ color: C.t2, fontSize: "13px", marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>
        <strong style={{ color: C.t1, fontWeight: 600 }}>{h} h{m > 0 ? ` ${String(m).padStart(2, "0")}` : ""} / semaine</strong>{" · "}{resumeSemaine(jours)}
      </div>
    </div>
  );
}

export function InfoLine({ C, textes }: { C: ThemeTokens; textes: string[] }) {
  if (textes.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", marginBottom: "16px", backgroundColor: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "10px" }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
      <div style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.5 }}>{textes.map((t, i) => <div key={i}>{t}</div>)}</div>
    </div>
  );
}

export type ScheduleCardData = {
  id: string; nom: string; typeKey: string; typeLabel: string; actif: boolean; nbEmployes: number; tolerance: number;
  jours: JourPlanning[]; onOpen: () => void;
};
const COULEUR_TYPE = (C: ThemeTokens, t: string): string => t === "fixe" ? C.blue : t === "fractionne" ? C.purple : t === "nuit" ? "#6366F1" : C.orange;
export function ScheduleGrid({ C, cartes }: { C: ThemeTokens; cartes: ScheduleCardData[] }) {
  return (
    <div className="cix-dept-grid">
      {cartes.map(h => {
        const couleur = COULEUR_TYPE(C, h.typeKey);
        const resume = resumeSemaine(h.jours);
        return (
          <div key={h.id} role="button" tabIndex={0} className="cix-card tap" onClick={h.onOpen}
            onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); h.onOpen(); } }}
            style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "14px", color: h.actif ? undefined : C.t3 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
              <div title={h.nom} style={{ color: h.actif ? C.t1 : C.t3, fontSize: "16px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{h.nom}</div>
              <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", boxSizing: "border-box", backgroundColor: `${couleur}14`, border: `1px solid ${couleur}40`, color: couleur, fontSize: "12px", fontWeight: 500 }}>{h.typeLabel}</span>
                {!h.actif && <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 500 }}>Archivé</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", color: C.t2, fontSize: "13px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                {h.nbEmployes} employé{h.nbEmployes > 1 ? "s" : ""}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Tolérance {h.tolerance} min
              </span>
            </div>
            <div style={{ marginTop: "auto" }}>
              <div role="img" aria-label={resume} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
                {h.jours.map(j => (
                  <div key={j.key} style={{ textAlign: "center" }}>
                    <div style={{ height: "6px", borderRadius: "3px", backgroundColor: j.repos ? C.bg3 : couleur, opacity: j.repos ? 1 : 0.85 }}/>
                    <div style={{ color: C.t3, fontSize: "11px", marginTop: "4px" }}>{j.label.slice(0, 1)}</div>
                  </div>
                ))}
              </div>
              <div title={resume} style={{ color: C.t3, fontSize: "12px", marginTop: "8px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{resume}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Champs de formulaire de modale (Employés) ────────────────────────────
export function DateField({ C, id, value, onChange, readOnly, vide = "Choisir une date" }: { C: ThemeTokens; id: string; value: string; onChange: (v: string) => void; readOnly?: boolean; vide?: string }) {
  // Valeur stockée inchangée (AAAA-MM-JJ) : seul l'affichage est formaté. Le champ
  // natif, transparent, couvre tout le contrôle et reste atteignable au clavier.
  const affichage = value ? new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : vide;
  // Le champ natif est invisible (opacity 0) : son contour de focus l'est aussi, la
  // bordure du contrôle visible porte donc l'indicateur de focus.
  const [focus, setFocus] = useState(false);
  // Un clic sur le texte d'un <input type="date"> ne fait que sélectionner un segment
  // (jour/mois/année) : seul le petit indicateur natif, ici invisible, ouvre le
  // sélecteur. On l'ouvre donc explicitement depuis le geste de l'utilisateur ;
  // si le navigateur refuse (showPicker absent ou bloqué), repli sur le focus.
  function ouvrirSelecteur(el: HTMLInputElement) {
    if (readOnly) return;
    try { el.showPicker(); } catch { el.focus(); }
  }
  return (
    <div className="cix-datefield" style={{ position: "relative", height: "40px" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${focus ? C.gold : C.border2}`, boxShadow: focus ? `0 0 0 2px ${C.gold}55` : "none", borderRadius: "8px", color: value ? C.t1 : C.t3, fontSize: "14px" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        {affichage}
      </div>
      <input id={id} type="date" value={value} readOnly={readOnly} onChange={e => onChange(e.target.value)} className="cix-input"
        onClick={e => ouvrirSelecteur(e.currentTarget)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirSelecteur(e.currentTarget); } }}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: readOnly ? "default" : "pointer" }}/>
    </div>
  );
}

export function IconInput({ C, id, icone, invalide, describedBy, ...rest }: {
  C: ThemeTokens; id: string; icone: ReactNode; invalide?: boolean; describedBy?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "style">) {
  return (
    <div style={{ position: "relative" }}>
      <span aria-hidden="true" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: C.t3, display: "flex" }}>{icone}</span>
      <input id={id} aria-invalid={invalide || undefined} aria-describedby={describedBy} className="cix-input" {...rest}
        style={{ ...champStyle(C), paddingLeft: "34px", borderColor: invalide ? C.red : C.border2 }}/>
    </div>
  );
}

export type ComboOption = { value: string; label: string; sub?: string; avatar?: string };
export function ComboField({ C, id, valeur, onChange, options, aucunLabel = "Aucun", vide, readOnly, compact, sansAucun }: {
  C: ThemeTokens; id: string; valeur: string; onChange: (v: string) => void; options: ComboOption[]; aucunLabel?: string; vide?: { titre: string; aide: string }; readOnly?: boolean; compact?: boolean; sansAucun?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const toutes: ComboOption[] = sansAucun ? options : [{ value: "", label: aucunLabel }, ...options];
  const courant = toutes.find(o => o.value === valeur) ?? toutes[0];
  useEffect(() => {
    if (!ouvert) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [ouvert]);
  function ouvrir() {
    if (readOnly) return;
    setActif(Math.max(0, toutes.findIndex(o => o.value === valeur)));
    setOuvert(true);
  }
  function choisir(o: ComboOption) { onChange(o.value); setOuvert(false); }
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!ouvert) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); ouvrir(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActif(i => Math.min(toutes.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif(i => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActif(0); }
    else if (e.key === "End") { e.preventDefault(); setActif(toutes.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); choisir(toutes[actif]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOuvert(false); }
    else if (e.key === "Tab") setOuvert(false);
  }
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button id={id} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={`${id}-liste`} onClick={() => (ouvert ? setOuvert(false) : ouvrir())} onKeyDown={onKey} className="cix-input"
        style={{ ...champStyle(C), ...(compact ? { height: "34px", fontSize: "13px" } : {}), display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", textAlign: "left", cursor: readOnly ? "default" : "pointer", color: courant.value ? C.t1 : C.t3 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {courant.avatar && <span aria-hidden="true" style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{courant.avatar}</span>}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{courant.label}</span>
        </span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {ouvert && (
        <ul id={`${id}-liste`} role="listbox" aria-label="Options" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, maxHeight: "240px", overflowY: "auto", margin: 0, padding: "4px", listStyle: "none", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}>
          {options.length === 0 && vide && (
            <li role="presentation" style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, marginBottom: "4px" }}>
              <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500 }}>{vide.titre}</div>
              <div style={{ color: C.t3, fontSize: "12px", marginTop: "2px" }}>{vide.aide}</div>
            </li>
          )}
          {toutes.map((o, i) => (
            <li key={o.value || "aucun"} role="option" aria-selected={o.value === valeur} onMouseEnter={() => setActif(i)} onClick={() => choisir(o)}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "6px", cursor: "pointer", backgroundColor: i === actif ? C.bg3 : "transparent", color: o.value ? C.t1 : C.t3, fontSize: "14px" }}>
              {o.avatar && <span aria-hidden="true" style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{o.avatar}</span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                {o.sub && <span style={{ display: "block", color: C.t3, fontSize: "12px" }}>{o.sub}</span>}
              </span>
              {o.value === valeur && <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PinInput({ C, id, valeur, onChange, longueur = 4, readOnly, invalide }: {
  C: ThemeTokens; id: string; valeur: string; onChange: (v: string) => void; longueur?: number; readOnly?: boolean; invalide?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const nettoyer = (v: string) => v.replace(/\D/g, "").slice(0, longueur);
  function saisir(i: number, brut: string) {
    const chiffre = brut.replace(/\D/g, "").slice(-1);
    if (!chiffre) return;
    const pos = Math.min(i, valeur.length);
    onChange(nettoyer(valeur.slice(0, pos) + chiffre + valeur.slice(pos + 1)));
    refs.current[Math.min(pos + 1, longueur - 1)]?.focus();
  }
  function touche(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (i < valeur.length) onChange(valeur.slice(0, i) + valeur.slice(i + 1));
      else onChange(valeur.slice(0, -1));
      refs.current[Math.max(0, i - (i >= valeur.length ? 1 : 0))]?.focus();
    } else if (e.key === "ArrowLeft") { e.preventDefault(); refs.current[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); refs.current[Math.min(longueur - 1, i + 1)]?.focus(); }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <div role="group" aria-label="PIN initial" style={{ display: "flex", gap: "8px" }}>
        {Array.from({ length: longueur }, (_, i) => (
          <input key={i} id={i === 0 ? id : undefined} ref={el => { refs.current[i] = el; }} type={visible ? "text" : "password"} inputMode="numeric" autoComplete="off" maxLength={2}
            aria-label={`Chiffre ${i + 1} sur ${longueur}`} aria-invalid={invalide || undefined} readOnly={readOnly} value={valeur[i] ?? ""} className="cix-input"
            onChange={e => saisir(i, e.target.value)} onKeyDown={e => touche(i, e)} onFocus={e => e.target.select()}
            onPaste={e => { e.preventDefault(); const v = nettoyer(e.clipboardData.getData("text")); if (v) { onChange(v); refs.current[Math.min(v.length, longueur - 1)]?.focus(); } }}
            style={{ width: "44px", height: "52px", boxSizing: "border-box", textAlign: "center", backgroundColor: C.bgCard, border: `1px solid ${invalide ? C.red : valeur[i] ? C.t1 : C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "20px", fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}/>
        ))}
      </div>
      <button type="button" onClick={() => setVisible(v => !v)} aria-pressed={visible} className="cix-btn tap"
        style={{ height: "34px", padding: "0 10px", display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, fontSize: "12.5px", cursor: "pointer" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {visible ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
        </svg>
        {visible ? "Masquer" : "Afficher"}
      </button>
    </div>
  );
}

// ── Fiche employé ────────────────────────────────────────────────────────
export function ProfileHeader({ C, labelId, nom, poste, departement, manager, role, statut }: {
  C: ThemeTokens; labelId: string; nom: string; poste: string | null; departement: string | null; manager: string | null;
  role: { label: string; color: string }; statut: { label: string; color: string };
}) {
  const vide = (v: string | null, defaut: string) => v ? <span style={{ color: C.t2 }}>{v}</span> : <span style={{ color: C.t3 }}>{defaut}</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0, flex: 1 }}>
      <span aria-hidden="true" style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "19px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initiales(nom)}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h2 id={labelId} style={{ color: C.t1, fontSize: "20px", fontWeight: 600, margin: 0 }}>{nom}</h2>
          <RoleBadge label={role.label} color={role.color}/>
          <StatusPill label={statut.label} color={statut.color}/>
        </div>
        <div style={{ fontSize: "13px", marginTop: "2px" }}>{vide(poste, "Poste non renseigné")}<span style={{ color: C.t3 }}> · Département : </span>{vide(departement, "Non assigné")}</div>
        <div style={{ fontSize: "13px" }}><span style={{ color: C.t3 }}>Manager : </span>{vide(manager, "Non assigné")}</div>
      </div>
    </div>
  );
}

export function ProfileCard({ C, titre, sousTitre, action, children }: { C: ThemeTokens; titre: string; sousTitre?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px 18px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>{titre}</h3>
          {sousTitre && <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px" }}>{sousTitre}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function InfoGrid({ C, items }: { C: ThemeTokens; items: { label: string; valeur: string | null; href?: string }[] }) {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px 24px", margin: 0 }}>
      {items.map(it => (
        <div key={it.label} style={{ minWidth: 0 }}>
          <dt style={{ color: C.t3, fontSize: "13px" }}>{it.label}</dt>
          <dd style={{ margin: "2px 0 0", fontSize: "14px", overflowWrap: "anywhere" }}>
            {it.valeur ? (it.href ? <a href={it.href} style={{ color: C.t1, textDecoration: "underline", textDecorationColor: C.border2 }}>{it.valeur}</a> : <span style={{ color: C.t1 }}>{it.valeur}</span>) : <span style={{ color: C.t3 }}>Non renseigné</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function WeekRows({ C, jours, nuit }: { C: ThemeTokens; jours: JourPlanning[]; nuit: boolean }) {
  const total = heuresSemaine(jours, nuit);
  const h = Math.floor(total / 60); const m = total % 60;
  return (
    <div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {jours.map((j, i) => (
          <li key={j.key} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "36px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", fontSize: "14px" }}>
            <span style={{ width: "56px", color: j.repos ? C.t3 : C.t2, fontSize: "13px" }}>{j.label}</span>
            {j.repos ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t3, fontSize: "13px" }}><span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.t3 }}/>Repos</span>
            ) : (
              <span style={{ color: C.t1, fontVariantNumeric: "tabular-nums" }}>{j.segments.map(g => `${fmt12(g.debut)} – ${fmt12(g.fin)}`).join(" · ") || "—"}</span>
            )}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: "10px", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}><strong style={{ color: C.t1, fontWeight: 600 }}>{h} h{m > 0 ? ` ${String(m).padStart(2, "0")}` : ""} / semaine</strong></div>
    </div>
  );
}

export type HistoryRow = { id: string; date: string; entree: string; sortie: string; statut: string; statutColor: string; supp: string | null; horsZone: boolean; extra?: ReactNode; onCorriger?: () => void };
export function HistoryTable({ C, rows }: { C: ThemeTokens; rows: HistoryRow[] }) {
  const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", color: C.t2, fontSize: "12px", fontWeight: 500, backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "auto" }}>
      <table style={{ width: "100%", minWidth: "520px", borderCollapse: "collapse" }}>
        <thead><tr><th scope="col" style={th}>Date</th><th scope="col" style={th}>Entrée</th><th scope="col" style={th}>Sortie</th><th scope="col" style={th}>Statut</th><th scope="col" style={{ ...th, textAlign: "right" }}>Actions</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const td = { padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontSize: "14px", verticalAlign: "middle" } as const;
            const heure = (v: string) => <span style={{ color: v === "—" ? C.t3 : C.t1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{v}</span>;
            return (
              <Fragment key={r.id}>
                <tr>
                  <td style={{ ...td, color: C.t1, whiteSpace: "nowrap" }}>{r.date}</td>
                  <td style={td}>{heure(r.entree)}</td>
                  <td style={td}>{heure(r.sortie)}</td>
                  <td style={td}>
                    <StatusPill label={r.statut} color={r.statutColor}/>
                    {r.supp && <div style={{ color: C.blue, fontSize: "12px", marginTop: "3px" }}>+{r.supp} heures sup.</div>}
                    {r.horsZone && <div style={{ color: C.red, fontSize: "12px", marginTop: "3px" }} title="Au moins un pointage de ce jour a eu lieu en dehors de la zone de travail définie">Pointage hors zone</div>}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {r.onCorriger && <button type="button" className="cix-btn tap" onClick={r.onCorriger} style={{ background: "none", border: "none", color: C.t2, fontSize: "13px", textDecoration: "underline", cursor: "pointer" }}>Corriger</button>}
                  </td>
                </tr>
                {r.extra && <tr><td colSpan={5} style={{ padding: "12px", borderBottom: `1px solid ${C.border}`, backgroundColor: C.bgCard2 }}>{r.extra}</td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FileDropzone({ C, id, fichier, onFichier, accept }: { C: ThemeTokens; id: string; fichier: File | null; onFichier: (f: File | null) => void; accept: string }) {
  const [survol, setSurvol] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const taille = fichier ? (fichier.size > 1048576 ? `${(fichier.size / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(fichier.size / 1024))} Ko`) : "";
  return (
    <div onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
      onDrop={e => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files?.[0]; if (f) onFichier(f); }}
      style={{ border: `1.5px dashed ${survol ? C.gold : C.border2}`, borderRadius: "10px", padding: "16px", textAlign: "center", backgroundColor: survol ? `${C.gold}0d` : "transparent" }}>
      <input ref={ref} id={id} type="file" accept={accept} hidden onChange={e => onFichier(e.target.files?.[0] ?? null)}/>
      {fichier ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
          <span style={{ color: C.t1, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fichier.name}</span>
          <span style={{ color: C.t3, fontSize: "12px" }}>{taille}</span>
          <button type="button" className="cix-btn tap" aria-label="Retirer le fichier" onClick={() => { onFichier(null); if (ref.current) ref.current.value = ""; }}
            style={{ width: "24px", height: "24px", background: "none", border: "none", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ) : (
        <div style={{ color: C.t2, fontSize: "13.5px" }}>
          Glissez un fichier ou{" "}
          <button type="button" className="cix-btn tap" onClick={() => ref.current?.click()} style={{ background: "none", border: "none", color: C.t1, fontSize: "13.5px", fontWeight: 500, textDecoration: "underline", cursor: "pointer", padding: 0 }}>parcourez</button>
          <div style={{ color: C.t3, fontSize: "12px", marginTop: "4px" }}>PDF, JPEG ou PNG</div>
        </div>
      )}
    </div>
  );
}

// ── Menu d'actions d'une ligne (« ⋯ ») ───────────────────────────────────
export function RowActionsMenu({ C, label, items }: { C: ThemeTokens; label: string; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermer = () => setOuvert(false);
    const down = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) fermer(); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { fermer(); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    window.addEventListener("scroll", fermer, true); window.addEventListener("resize", fermer);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("scroll", fermer, true); window.removeEventListener("resize", fermer); };
  }, [ouvert]);
  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={ouvert} aria-label={label} title="Plus d'actions" className="cix-btn tap"
        onClick={() => { const r = btnRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }); setOuvert(v => !v); }}
        style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: ouvert ? C.bg3 : "transparent", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={C.t2} stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
      {ouvert && pos && (
        <div role="menu" style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 1200, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: "180px", padding: "4px 0" }}>
          {items.map(it => (
            <button key={it.label} role="menuitem" type="button" className="cix-item cix-btn tap" onClick={() => { setOuvert(false); it.onClick(); }}
              style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", color: it.danger ? C.red : C.t1, fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
