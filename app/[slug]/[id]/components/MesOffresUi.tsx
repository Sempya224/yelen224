"use client";

// Briques présentationnelles de l'écran "Mes offres" (refonte UI 20/10/2026,
// référence Stripe Products / Cloudflare). Aucune donnée ni handler ici :
// MesOffresTable.tsx et MesOffresTab.tsx passent des props prêtes à afficher.
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { OFFRE_GENRE_LABELS, OFFRE_GENRE_COULEURS, type OffreGenre } from "@/lib/offresCategories";
import { type ThemeTokens, toUiTokens } from "../theme";
import { heureDepuisHorodatage } from "@/lib/heure";

// ── Formatage d'affichage ────────────────────────────────────────────────
export function formatCtr(vues: number, clics: number): string {
  if (vues === 0) return "—";
  return `${((clics / vues) * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
export function dateHeure(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) + " à " + heureDepuisHorodatage(d);
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

// ── Badges ───────────────────────────────────────────────────────────────
// Libellés alignés sur les KPI et filtres de l'écran ("En attente" partout,
// jamais "En modération" dans un endroit et "En attente" dans un autre).
const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon", en_attente_validation: "En attente", publiee: "Publiée",
  refusee: "Refusée", suspendue: "Suspendue", archivee: "Archivée",
};
export function statutLabel(statut: string): string { return STATUT_LABELS[statut] ?? statut; }

export function OfferStatusBadge({ C, statut }: { C: ThemeTokens; statut: string }) {
  let fg = C.t2; let bg = C.bg3; let hollow = false;
  if (statut === "publiee") { fg = C.green; bg = `${C.green}1c`; }
  else if (statut === "en_attente_validation" || statut === "suspendue") { fg = C.orange; bg = `${C.orange}1c`; hollow = statut === "suspendue"; }
  else if (statut === "refusee") { fg = C.red; bg = `${C.red}1c`; }
  else if (statut === "archivee") { fg = C.t3; bg = "transparent"; hollow = true; }
  const titre = statut === "en_attente_validation" ? "En attente de modération par Yelen" : undefined;
  return (
    <span title={titre} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: bg, color: fg, border: statut === "archivee" ? `1px solid ${C.border2}` : "none", boxSizing: "border-box", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", boxSizing: "border-box", backgroundColor: hollow ? "transparent" : fg, border: `1.5px solid ${fg}` }}/>
      {statutLabel(statut)}
    </span>
  );
}

export function OfferTypeBadge({ C, genre }: { C: ThemeTokens; genre: string }) {
  const accent = OFFRE_GENRE_COULEURS[genre as OffreGenre]?.bg;
  const label = OFFRE_GENRE_LABELS[genre as OffreGenre] || genre;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: "20px", padding: "0 7px", borderRadius: "6px", boxSizing: "border-box", fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap", backgroundColor: accent ? `${accent}1a` : C.bg3, color: accent ?? C.t2, border: `1px solid ${accent ? `${accent}40` : C.border2}` }}>
      {label}
    </span>
  );
}

// Vignette : seule l'image de l'offre est montrée. Le logo de l'institution
// (identique pour toutes les offres) n'aide pas à les distinguer, il est
// remplacé par un placeholder neutre avec les initiales du titre.
export function OfferThumb({ C, image, titre, size = 40 }: { C: ThemeTokens; image: string | null; titre: string; size?: number }) {
  const mots = titre.trim().split(/\s+/).filter(Boolean);
  const initiales = ((mots[0]?.[0] ?? "") + (mots[1]?.[0] ?? "")).toUpperCase() || "?";
  return (
    <div aria-hidden="true" style={{ width: `${size}px`, height: `${size}px`, position: "relative", borderRadius: "8px", flexShrink: 0, overflow: "hidden", backgroundColor: C.bg3, border: `1px solid ${C.border}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {image ? <Image src={image} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }}/> : <span style={{ color: C.t2, fontWeight: 600, fontSize: `${Math.round(size * 0.32)}px` }}>{initiales}</span>}
    </div>
  );
}

export function OffresStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .ofx-table{display:block}
      .ofx-cards{display:none}
      @media(max-width:767px){.ofx-table{display:none}.ofx-cards{display:flex}}
      .ofx-row:hover{background-color:${C.bgCard2}}
      .ofx-row:focus-visible,.ofx-btn:focus-visible,.ofx-item:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .ofx-item:hover:not(:disabled){background-color:${C.bgCard2}}
      .ofx-page{max-width:1280px;margin:0 auto;padding:24px 24px 48px}
      @media(min-width:1024px){.ofx-page{padding:28px 32px 48px}}
      .ofx-skel{background:${C.bg3};border-radius:6px;animation:ofxPulse 1.4s ease-in-out infinite}
      @keyframes ofxPulse{0%,100%{opacity:1}50%{opacity:.5}}
      .ofx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      @media(prefers-reduced-motion:reduce){.ofx-row,.ofx-btn{transition:none!important}.ofx-skel{animation:none}}
    `}</style>
  );
}

// ── En-tête, onglets, bande KPI, barre d'outils ──────────────────────────
export function OffersHeader({ C, titleExtras, canCreate, onCreate }: { C: ThemeTokens; titleExtras: ReactNode; canCreate: boolean; onCreate: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 16px", marginBottom: "20px" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: 0 }}>Mes offres</h1>
          {titleExtras}
        </div>
        <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Gérez ici toutes les offres publiées par votre institution.</p>
      </div>
      {canCreate && (
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }} onClick={onCreate}
          icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>
          Nouvelle offre
        </Button>
      )}
    </div>
  );
}

export type OffersTabDef = { key: string; label: string; count?: number };
export function OffersTabs({ C, tabs, active, onChange }: { C: ThemeTokens; tabs: OffersTabDef[]; active: string; onChange: (key: string) => void }) {
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
  const label = tabs.find(t => t.key === active)?.label ?? "";
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: "20px", overflowX: "auto" }}>
      <div role="tablist" aria-label="Sections de Mes offres" style={{ display: "flex", gap: "4px" }}>
        {tabs.map((t, i) => {
          const on = t.key === active;
          return (
            <button key={t.key} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={`ofx-tab-${t.key}`} aria-selected={on} aria-controls={`ofx-panel-${t.key}`}
              tabIndex={on ? 0 : -1} onClick={() => onChange(t.key)} onKeyDown={e => onKey(e, i)} className="ofx-btn tap"
              style={{ height: "40px", padding: "0 12px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, marginBottom: "-1px", color: on ? C.t1 : C.t2, fontSize: "14px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {t.label}
              {t.count !== undefined && <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>}
            </button>
          );
        })}
      </div>
      <span aria-live="polite" className="ofx-sr">{`Section ${label}`}</span>
    </div>
  );
}

export type OffersKpi = { key: string; label: string; value: number; dot?: string; sub?: string; delta?: number; deltaLabel?: string; active?: boolean; onClick?: () => void };
export function OffersSummary({ C, items }: { C: ThemeTokens; items: OffersKpi[] }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflowX: "auto", marginBottom: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(140px, 1fr))`, minWidth: "max-content" }}>
        {items.map((it, i) => {
          const contenu = (
            <>
              <span title={it.label} style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {it.dot && <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: it.dot, flexShrink: 0 }}/>}
                {it.label}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <span style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{it.value}</span>
                {it.delta !== undefined && it.delta !== 0 && (
                  <span title={it.deltaLabel} style={{ display: "inline-flex", alignItems: "center", gap: "3px", height: "20px", padding: "0 6px", borderRadius: "5px", fontSize: "11.5px", fontWeight: 600, backgroundColor: `${it.delta > 0 ? C.green : C.red}1c`, color: it.delta > 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
                    <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" fill="currentColor">{it.delta > 0 ? <path d="M5 1l4 7H1z"/> : <path d="M5 9L1 2h8z"/>}</svg>
                    {it.delta > 0 ? "+" : "−"}{Math.abs(it.delta)}
                  </span>
                )}
              </span>
              <span style={{ display: "block", color: C.t3, fontSize: "12px", marginTop: "2px", whiteSpace: "nowrap" }}>{it.sub || " "}</span>
            </>
          );
          const style: CSSProperties = { minHeight: "80px", padding: "12px 16px", textAlign: "left", background: "none", border: "none", borderLeft: i > 0 ? `1px solid ${C.border}` : "none", font: "inherit", minWidth: 0, boxShadow: it.active ? `inset 0 -2px 0 ${C.gold}` : "none" };
          return it.onClick ? (
            <button key={it.key} type="button" aria-pressed={it.active} onClick={it.onClick} className="ofx-btn tap" style={{ ...style, cursor: "pointer" }}>{contenu}</button>
          ) : (
            <div key={it.key} style={style}>{contenu}</div>
          );
        })}
      </div>
    </div>
  );
}

export function OffersToolbar({ C, active, search, onSearch, statuts, statutActif, onStatut, total, filtreActif, onReset }: {
  C: ThemeTokens; active: boolean; search: string; onSearch: (v: string) => void;
  statuts: { key: string; label: string; count: number }[]; statutActif: string; onStatut: (k: string) => void;
  total: number; filtreActif: boolean; onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!active) return;
    function onKey(e: globalThis.KeyboardEvent) {
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
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: "12px" }}>
      <div style={{ position: "relative", width: "360px", maxWidth: "100%" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input ref={inputRef} className="ofx-btn" value={search} onChange={e => onSearch(e.target.value)} aria-label="Rechercher une offre"
          placeholder="Rechercher par titre, catégorie, genre, statut…"
          style={{ width: "100%", height: "36px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 32px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit" }}/>
        {search ? (
          <button type="button" className="ofx-btn tap" aria-label="Effacer la recherche" onClick={() => { onSearch(""); inputRef.current?.focus(); }}
            style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "6px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ) : (
          <kbd aria-hidden="true" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "inherit" }}>/</kbd>
        )}
      </div>

      <div role="group" aria-label="Filtrer par statut" style={{ display: "flex", gap: "2px", overflowX: "auto", maxWidth: "100%" }}>
        {statuts.map(s => {
          const on = s.key === statutActif;
          return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => onStatut(s.key)} className="ofx-btn tap"
              style={{ height: "36px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, color: on ? C.t1 : C.t2, fontSize: "13.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {s.label}
              <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
            </button>
          );
        })}
      </div>

      {filtreActif && (
        <button type="button" className="ofx-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>
      )}
      <span aria-live="polite" style={{ marginLeft: "auto", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{total} offre{total > 1 ? "s" : ""}</span>
    </div>
  );
}

export function OffersSkeleton({ C }: { C: ThemeTokens }) {
  return (
    <div role="status" aria-label="Chargement des offres">
      <div aria-hidden="true" className="ofx-skel" style={{ height: "80px", borderRadius: "12px", marginBottom: "20px" }}/>
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden" }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: "64px", padding: "0 14px", display: "flex", alignItems: "center", gap: "16px", borderBottom: i < 4 ? `1px solid ${C.border}` : "none" }}>
            <div className="ofx-skel" style={{ width: "40px", height: "40px", borderRadius: "8px" }}/>
            <div className="ofx-skel" style={{ flex: 1, height: "12px" }}/>
            <div className="ofx-skel" style={{ width: "90px", height: "20px" }}/>
            <div className="ofx-skel" style={{ width: "60px", height: "12px" }}/>
          </div>
        ))}
      </div>
    </div>
  );
}
