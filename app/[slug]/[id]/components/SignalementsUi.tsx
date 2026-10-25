"use client";

// Composants purement présentationnels de l'écran Signalements (refonte UI
// 20/10/2026, références Stripe Disputes / Linear / Cloudflare). Aucune
// donnée, aucun fetch, aucun filtre ici : SignalementsTab.tsx garde toute
// la logique (états, handlers, KPI, filtrage) et passe des props prêtes à
// afficher. Styles inline + tokens `C` du thème, comme le reste du dashboard.
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";
import { heureDepuisHorodatage } from "@/lib/heure";

// ── Présentation (aucune donnée modifiée) ───────────────────────────────
export function nomPropre(nom: string): string {
  return nom.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}
export function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}
export function dateRelative(iso: string, maintenant: number): string {
  const sec = Math.round((new Date(iso).getTime() - maintenant) / 1000);
  const a = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (a < 60) return "à l'instant";
  if (a < 3600) return rtf.format(Math.trunc(sec / 60), "minute");
  if (a < 86400) return rtf.format(Math.trunc(sec / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.trunc(sec / 86400), "day");
  if (a < 86400 * 365) return rtf.format(Math.trunc(sec / (86400 * 30)), "month");
  return rtf.format(Math.trunc(sec / (86400 * 365)), "year");
}
export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function dateComplete(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) + " à " + heureDepuisHorodatage(d);
}

// ── Badges ───────────────────────────────────────────────────────────────
type Tone = { fg: string; bg: string };
function statutTone(statut: string, C: ThemeTokens): Tone {
  switch (statut) {
    case "nouveau": return { fg: C.blue, bg: `${C.blue}1c` };
    case "a_traiter": case "en_cours": case "en_attente": return { fg: C.orange, bg: `${C.orange}1c` };
    case "resolu": return { fg: C.green, bg: `${C.green}1c` };
    case "rejete": return { fg: C.red, bg: `${C.red}1c` };
    default: return { fg: C.t2, bg: C.bg3 }; // cloture, doublon
  }
}
function Pill({ tone, label, dot = "solid", bold }: { tone: Tone; label: string; dot?: "solid" | "hollow"; bold?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: tone.bg, color: tone.fg, fontSize: "12px", fontWeight: bold ? 700 : 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, backgroundColor: dot === "solid" ? tone.fg : "transparent", border: `1.5px solid ${tone.fg}`, boxSizing: "border-box" }}/>
      {label}
    </span>
  );
}
export function SigStatusBadge({ C, statut, label }: { C: ThemeTokens; statut: string; label: string }) {
  return <Pill tone={statutTone(statut, C)} label={label}/>;
}
export function SigPriorityBadge({ C, priorite, label }: { C: ThemeTokens; priorite: string; label: string }) {
  if (priorite === "critique") return <Pill tone={{ fg: C.red, bg: `${C.red}1c` }} label={label} bold/>;
  if (priorite === "haute") return <Pill tone={{ fg: C.red, bg: `${C.red}1c` }} label={label} dot="hollow"/>;
  if (priorite === "faible") return <Pill tone={{ fg: C.t3, bg: "transparent" }} label={label} dot="hollow"/>;
  return <Pill tone={{ fg: C.t2, bg: C.bg3 }} label={label}/>;
}
export function SigSens({ C, contreVous }: { C: ThemeTokens; contreVous: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {contreVous ? <><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></> : <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>}
      </svg>
      {contreVous ? "Contre vous" : "Déposé par vous"}
    </span>
  );
}
function Avatar({ C, nom }: { C: ThemeTokens; nom: string }) {
  return <span aria-hidden="true" style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initiales(nom)}</span>;
}

// ── Styles partagés (hover, focus, responsive, skeleton) ────────────────
export function SigStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .sigx-page{max-width:1280px;margin:0 auto;padding:24px 24px 40px}
      @media(min-width:1024px){.sigx-page{padding:28px 32px 40px}}
      .sigx-kpi{display:grid;grid-template-columns:repeat(4,1fr)}
      .sigx-kpi-item{border-left:1px solid ${C.border}}
      .sigx-kpi-item:first-child{border-left:0}
      @media(max-width:767px){
        .sigx-kpi{grid-template-columns:repeat(2,1fr)}
        .sigx-kpi-item:nth-child(odd){border-left:0}
        .sigx-kpi-item:nth-child(n+3){border-top:1px solid ${C.border}}
        .sigx-table{display:none!important}
      }
      @media(min-width:768px){.sigx-cards{display:none!important}}
      .sigx-row:hover{background-color:${C.bgCard2}}
      .sigx-row:focus-visible,.sigx-btn:focus-visible,.sigx-tab:focus-visible,.sigx-input:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .sigx-skel{background:${C.bg3};border-radius:6px;animation:sigxPulse 1.4s ease-in-out infinite}
      @keyframes sigxPulse{0%,100%{opacity:1}50%{opacity:.5}}
      @media(prefers-reduced-motion:reduce){.sigx-skel{animation:none}}
      .sigx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
    `}</style>
  );
}

// ── En-tête + indicateur Live ───────────────────────────────────────────
export function SigHeader({ C, helpSlot, canWrite, onCanaux, onExport, onNew, lastSync, maintenantTexte, maintenantSr, onRefresh }: {
  C: ThemeTokens; helpSlot: ReactNode; canWrite: boolean;
  onCanaux: () => void; onExport: () => void; onNew: () => void;
  lastSync: boolean; maintenantTexte: string; maintenantSr: string; onRefresh: () => void;
}) {
  const ui = toUiTokens(C);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 16px", marginBottom: "20px" }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Signalements</h1>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 12px" }}>
          <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Gestion des cas de signalement : création, traitement, résolution.</p>
          <button type="button" onClick={onCanaux} className="sigx-btn tap" style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "none", border: "none", padding: "2px 0", color: C.t3, fontSize: "12.5px", cursor: "pointer" }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Quel canal utiliser ?
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
          {helpSlot}
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onExport}
            icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}>
            Exporter CSV
          </Button>
          {canWrite && (
            <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onNew}
              icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>
              Nouveau signalement
            </Button>
          )}
        </div>
        <button type="button" onClick={onRefresh} className="sigx-btn tap" aria-label="Actualiser la liste des signalements" title="Actualiser"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "2px 0", color: C.t3, fontSize: "12px", cursor: "pointer" }}>
          <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green }}/>
          Live{lastSync ? ` · ${maintenantTexte}` : ""}
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        <span className="sigx-sr" aria-live="polite">{lastSync ? `Synchronisé ${maintenantSr}` : ""}</span>
      </div>
    </div>
  );
}

// ── Bande KPI ────────────────────────────────────────────────────────────
export type SigKpiItem = {
  key: string; label: string; icon: ReactNode; value: number; delta: number | null;
  active: boolean; alerte?: boolean; onClick?: () => void;
};
function DeltaBadge({ C, delta }: { C: ThemeTokens; delta: number | null }) {
  const base = { display: "inline-flex", alignItems: "center", gap: "3px", height: "20px", padding: "0 6px", borderRadius: "5px", fontSize: "11.5px", fontWeight: 600 } as const;
  if (delta === null) return <span style={{ fontSize: "11.5px", color: C.t3 }}>Pas de comparaison</span>;
  if (delta === 0) return <span style={{ ...base, backgroundColor: C.bg3, color: C.t2 }}>Stable vs hier</span>;
  const up = delta > 0;
  const color = up ? C.green : C.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span style={{ ...base, backgroundColor: `${color}1c`, color }}>
        <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" fill="currentColor">{up ? <path d="M5 1l4 7H1z"/> : <path d="M5 9L1 2h8z"/>}</svg>
        {up ? "+" : "−"}{Math.abs(delta)}
      </span>
      <span style={{ fontSize: "11.5px", color: C.t3 }}>vs hier</span>
    </span>
  );
}
export function SigKpiStrip({ C, items }: { C: ThemeTokens; items: SigKpiItem[] }) {
  return (
    <div className="sigx-kpi" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden", marginBottom: "20px" }}>
      {items.map(it => {
        const contenu = (
          <>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px" }}>
              <span aria-hidden="true" style={{ color: C.t3, display: "inline-flex" }}>{it.icon}</span>
              {it.label}
            </span>
            <span style={{ display: "block", color: it.alerte && it.value > 0 ? C.red : C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>{it.value}</span>
            <span style={{ display: "block", marginTop: "6px" }}><DeltaBadge C={C} delta={it.delta}/></span>
          </>
        );
        const style = { minHeight: "88px", padding: "14px 18px", textAlign: "left", boxShadow: it.active ? `inset 0 -2px 0 ${C.gold}` : "none", backgroundColor: "transparent", border: "none", font: "inherit" } as const;
        return it.onClick ? (
          <button key={it.key} type="button" className="sigx-kpi-item sigx-btn tap" aria-pressed={it.active} onClick={it.onClick} style={{ ...style, cursor: "pointer" }}>{contenu}</button>
        ) : (
          <div key={it.key} className="sigx-kpi-item" style={style}>{contenu}</div>
        );
      })}
    </div>
  );
}

// ── Barre d'outils ───────────────────────────────────────────────────────
export type SigTab = { key: string; label: string; count: number };
export function SigToolbar({ C, active, recherche, onRecherche, tabs, tabActive, onTab, avancesOuverts, onToggleAvances, avancesCount, total }: {
  C: ThemeTokens; active: boolean; recherche: string; onRecherche: (v: string) => void;
  tabs: SigTab[]; tabActive: string; onTab: (key: string) => void;
  avancesOuverts: boolean; onToggleAvances: () => void; avancesCount: number; total: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Raccourci "/" : n'agit pas quand la frappe est déjà dans un champ, et
  // seulement quand l'onglet est visible (l'onglet reste monté en arrière-plan).
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: "10px" }}>
      <div style={{ position: "relative", width: "360px", maxWidth: "100%" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input ref={inputRef} className="sigx-input" value={recherche} onChange={e => onRecherche(e.target.value)} aria-label="Rechercher un signalement"
          placeholder="Rechercher un numéro, un motif, un citoyen…"
          style={{ width: "100%", height: "36px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 32px 0 32px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit" }}/>
        {recherche ? (
          <button type="button" className="sigx-btn tap" aria-label="Effacer la recherche" onClick={() => { onRecherche(""); inputRef.current?.focus(); }}
            style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "6px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ) : (
          <kbd aria-hidden="true" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "inherit" }}>/</kbd>
        )}
      </div>

      <div role="tablist" aria-label="Filtrer par statut" style={{ display: "flex", gap: "4px", overflowX: "auto" }}>
        {tabs.map(t => {
          const on = t.key === tabActive;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} className="sigx-tab tap" onClick={() => onTab(t.key)}
              style={{ height: "36px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, color: on ? C.t1 : C.t2, fontSize: "13.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {t.label}
              <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="sigx-btn tap" aria-expanded={avancesOuverts} onClick={onToggleAvances}
        style={{ height: "32px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: avancesOuverts ? C.bg3 : C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "12.5px", fontWeight: 500, cursor: "pointer" }}>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filtres avancés
        {avancesCount > 0 && <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", backgroundColor: C.gold, color: "#000", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{avancesCount}</span>}
      </button>

      <span aria-live="polite" style={{ marginLeft: "auto", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
        {total} signalement{total > 1 ? "s" : ""}
      </span>
    </div>
  );
}

export function SigChips({ C, chips, onReset }: { C: ThemeTokens; chips: { key: string; label: string; onRemove: () => void }[]; onReset: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
      {chips.map(c => (
        <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "24px", padding: "0 4px 0 9px", borderRadius: "6px", backgroundColor: C.bg3, color: C.t1, fontSize: "12px" }}>
          {c.label}
          <button type="button" className="sigx-btn tap" aria-label={`Retirer le filtre ${c.label}`} onClick={c.onRemove}
            style={{ width: "18px", height: "18px", borderRadius: "4px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </span>
      ))}
      <button type="button" className="sigx-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>
    </div>
  );
}

// ── Tableau + cartes ─────────────────────────────────────────────────────
export type SigRowData = {
  id: string; numero: string; titre: string; citoyen: string | null; contreVous: boolean;
  priorite: string; prioriteLabel: string; statut: string; statutLabel: string;
  assigne: string | null; createdAt: string;
};
const termine = (s: string) => s === "cloture" || s === "rejete" || s === "doublon";

const COLS = ["N°", "Signalement", "Citoyen", "Sens", "Priorité", "Statut", "Assigné", "Créé"];
const WIDTHS = ["120px", "auto", "180px", "140px", "110px", "120px", "160px", "130px"];

export function SigTable({ C, rows, maintenant, onOpen }: { C: ThemeTokens; rows: SigRowData[]; maintenant: number; onOpen: (id: string) => void }) {
  return (
    <div className="sigx-table" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "auto", maxHeight: "68svh" }}>
      <table style={{ width: "100%", minWidth: "1220px", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{WIDTHS.map((w, i) => <col key={i} style={{ width: w }}/>)}</colgroup>
        <thead>
          <tr>
            {COLS.map((h, i) => (
              <th key={h} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, textAlign: i === COLS.length - 1 ? "right" : "left", padding: "10px 14px", color: C.t2, fontSize: "12px", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const clos = termine(r.statut);
            const nom = r.citoyen ? nomPropre(r.citoyen) : null;
            const td = { padding: "0 14px", height: "60px", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none", verticalAlign: "middle" } as const;
            return (
              <tr key={r.id} className="sigx-row tap" tabIndex={0} onClick={() => onOpen(r.id)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.id); } }}
                style={{ cursor: "pointer" }}>
                <td style={{ ...td, fontFamily: "monospace", fontSize: "12px", color: C.t2, whiteSpace: "nowrap" }}>{r.numero}</td>
                <td style={{ ...td, overflow: "hidden" }}>
                  <div title={r.titre} style={{ color: clos ? C.t2 : C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.titre}</div>
                </td>
                <td style={{ ...td, overflow: "hidden" }}>
                  {nom ? (
                    <span title={nom} style={{ display: "flex", alignItems: "center", gap: "8px", color: clos ? C.t3 : C.t1, fontSize: "13px" }}>
                      <Avatar C={C} nom={nom}/>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nom}</span>
                    </span>
                  ) : <span style={{ color: C.t3, fontSize: "13px" }}>—</span>}
                </td>
                <td style={td}><SigSens C={C} contreVous={r.contreVous}/></td>
                <td style={td}><SigPriorityBadge C={C} priorite={r.priorite} label={r.prioriteLabel}/></td>
                <td style={td}><SigStatusBadge C={C} statut={r.statut} label={r.statutLabel}/></td>
                <td style={{ ...td, overflow: "hidden" }}>
                  {r.assigne ? (
                    <span title={r.assigne} style={{ display: "flex", alignItems: "center", gap: "8px", color: clos ? C.t3 : C.t1, fontSize: "13px" }}>
                      <Avatar C={C} nom={r.assigne}/>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.assigne}</span>
                    </span>
                  ) : <span style={{ color: C.t3, fontSize: "13px", fontStyle: "italic" }}>Non assigné</span>}
                </td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", color: C.t2, fontSize: "13px" }}>
                  <span title={dateComplete(r.createdAt)}>{dateRelative(r.createdAt, maintenant)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SigCards({ C, rows, maintenant, onOpen }: { C: ThemeTokens; rows: SigRowData[]; maintenant: number; onOpen: (id: string) => void }) {
  return (
    <div className="sigx-cards" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {rows.map(r => {
        const clos = termine(r.statut);
        return (
          <div key={r.id} role="button" tabIndex={0} className="sigx-row tap" onClick={() => onOpen(r.id)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.id); } }}
            style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontFamily: "monospace", color: C.t2, fontSize: "12px" }}>{r.numero}</span>
              <SigStatusBadge C={C} statut={r.statut} label={r.statutLabel}/>
            </div>
            <p style={{ color: clos ? C.t2 : C.t1, fontSize: "14px", fontWeight: 500, margin: "0 0 4px", overflowWrap: "anywhere" }}>{r.titre}</p>
            <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 10px" }}>{r.citoyen ? nomPropre(r.citoyen) : "—"}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <SigPriorityBadge C={C} priorite={r.priorite} label={r.prioriteLabel}/>
              <span title={dateComplete(r.createdAt)} style={{ color: C.t2, fontSize: "12.5px" }}>{dateRelative(r.createdAt, maintenant)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Skeletons ────────────────────────────────────────────────────────────
export function SigSkeleton({ C, kpi }: { C: ThemeTokens; kpi?: boolean }) {
  if (kpi) {
    return <div aria-hidden="true" className="sigx-skel" style={{ height: "88px", borderRadius: "12px", marginBottom: "20px" }}/>;
  }
  return (
    <div role="status" aria-label="Chargement des signalements" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden" }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{ height: "60px", padding: "0 14px", display: "flex", alignItems: "center", gap: "16px", borderBottom: i < 4 ? `1px solid ${C.border}` : "none" }}>
          <div className="sigx-skel" style={{ width: "88px", height: "12px" }}/>
          <div className="sigx-skel" style={{ flex: 1, height: "12px" }}/>
          <div className="sigx-skel" style={{ width: "120px", height: "12px" }}/>
          <div className="sigx-skel" style={{ width: "70px", height: "20px" }}/>
        </div>
      ))}
    </div>
  );
}
