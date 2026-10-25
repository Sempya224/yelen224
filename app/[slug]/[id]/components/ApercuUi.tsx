"use client";

// Briques présentationnelles de l'écran « Aperçu général » (refonte UI
// 20/10/2026). Aucune requête, aucun calcul métier : layout.tsx garde les
// données, les KPI, les comparaisons, le realtime et les handlers ; on
// dessine seulement ce qu'on nous passe.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";
import { nomPropre } from "./ClockInShiftUi";

export { nomPropre };

// Affichage seulement : « Avis 5/5 de ALPHA DAILO » → « Avis 5/5 de Alpha Dailo ».
export function motsEnCasse(texte: string): string {
  return texte.replace(/[\p{Lu}][\p{Lu}'’-]{1,}/gu, m => m.charAt(0) + m.slice(1).toLowerCase());
}
// « 3sem » / « 14min » / « 2h » → « il y a 3 sem. » ; toute autre valeur est conservée.
export function tempsRelatif(brut: string): string {
  const m = brut.trim().match(/^(\d+)\s*(min|h|j|sem|mois|m|an|ans)$/i);
  if (!m) return brut;
  const unite: Record<string, string> = { min: "min", h: "h", j: "j", sem: "sem.", mois: "mois", m: "mois", an: "an", ans: "ans" };
  return `il y a ${m[1]} ${unite[m[2].toLowerCase()] ?? m[2]}`;
}

export function ApercuStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .apc-wrap{width:100%;max-width:none;margin:0;padding:24px;box-sizing:border-box}
      @media(min-width:1024px){.apc-wrap{padding:24px 32px}}
      .apc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;min-height:72px;margin-bottom:16px}
      .apc-act-d{display:none;align-items:center;gap:8px}
      .apc-act-m{display:block}
      @media(min-width:1024px){.apc-act-d{display:flex}.apc-act-m{display:none}}
      .apc-main{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:stretch;margin-bottom:16px}
      .apc-main>*{min-width:0}
      .apc-o1{order:2}.apc-o2{order:1}.apc-o3{order:3}
      @media(min-width:768px){.apc-main{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(min-width:1280px){
        .apc-main{grid-template-columns:repeat(12,minmax(0,1fr))}
        .apc-o1,.apc-o2,.apc-o3{order:0}
        .apc-c5{grid-column:span 5}.apc-c4{grid-column:span 4}.apc-c3{grid-column:span 3}
      }
      .vd-analytics{display:flex;flex-direction:column;gap:16px}
      @media(min-width:1024px){.vd-analytics{display:grid;grid-template-columns:2fr 2fr 1.5fr;align-items:start}}
      .apc-bottom{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-bottom:16px}
      @media(min-width:1280px){.apc-bottom{grid-template-columns:repeat(12,minmax(0,1fr))}.apc-b4{grid-column:span 4}.apc-b8{grid-column:span 8}}
      .apc-acces{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
      .apc-objectifs{margin-bottom:16px}
      .apc-btn:focus-visible,.apc-row:focus-visible,.apc-kpi:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .apc-row:hover,.apc-kpi:hover:not(:disabled){background-color:${C.bgCard2}}
      .apc-syn{display:grid;grid-template-columns:minmax(0,1fr)}
      @media(min-width:768px){.apc-syn{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:767px){.apc-syn>*+*{border-top:1px solid ${C.border}}}
      @media(min-width:768px){.apc-syn>*+*{border-left:1px solid ${C.border}}}
      @media(prefers-reduced-motion:reduce){.apc-btn,.apc-row,.apc-kpi{transition:none!important}}
    `}</style>
  );
}

const IcoChevron = (c: string) => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;

// ── Carte standard ───────────────────────────────────────────────────────
export function ApercuCard({ C, titre, action, children, className, titreId }: {
  C: ThemeTokens; titre: string; action?: React.ReactNode; children: React.ReactNode; className?: string; titreId?: string;
}) {
  return (
    <section aria-labelledby={titreId} className={className} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", boxSizing: "border-box", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "12px" }}>
        <h2 id={titreId} style={{ margin: 0, color: C.t1, fontSize: "16px", fontWeight: 600 }}>{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function VoirLien({ C, label, onClick }: { C: ThemeTokens; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="apc-btn tap" style={{ display: "inline-flex", alignItems: "center", gap: "2px", background: "none", border: "none", color: C.t2, fontSize: "13px", cursor: "pointer", padding: "2px 2px 2px 6px", borderRadius: "6px" }}>
      {label}{IcoChevron(C.t3)}
    </button>
  );
}
export function EtatVideCarte({ C, icone, titre, aide }: { C: ThemeTokens; icone: React.ReactNode; titre: string; aide?: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16px 8px", color: C.t3 }}>
      <div aria-hidden="true">{icone}</div>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, marginTop: "8px" }}>{titre}</div>
      {aide && <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px" }}>{aide}</div>}
    </div>
  );
}

// ── En-tête ──────────────────────────────────────────────────────────────
export function ApercuHeader({ C, date, salutation, demandes, onDemandes, onValider, onDispo }: {
  C: ThemeTokens; date: string; salutation?: string; demandes: number; onDemandes: () => void; onValider: () => void; onDispo: () => void;
}) {
  const ui = toUiTokens(C);
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [ouvert]);
  const pastille = demandes > 0 && <span aria-label={`${demandes} en attente`} style={{ backgroundColor: C.gold, color: "#000", fontSize: "11px", fontWeight: 700, padding: "0 6px", borderRadius: "10px", minWidth: "18px", height: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: "6px", fontVariantNumeric: "tabular-nums" }}>{demandes}</span>;
  const items = [
    { label: "Nouvelles demandes", onClick: onDemandes, extra: pastille },
    { label: "Valider un RDV", onClick: onValider },
    { label: "Disponibilités", onClick: onDispo },
  ];
  return (
    <header className="apc-head">
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.3px" }}>Aperçu général</h1>
        <p style={{ margin: "4px 0 0", color: C.t2, fontSize: "13px" }}>{salutation ? `${salutation} — suivez la performance de votre entreprise en temps réel.` : "Suivez la performance de votre entreprise en temps réel."}</p>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", textTransform: "capitalize", marginTop: "8px", whiteSpace: "nowrap" }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>{date}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "nowrap", marginLeft: "auto" }}>
        <div className="apc-act-d">
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onDemandes}>Nouvelles demandes{pastille}</Button>
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onDispo}>Disponibilités</Button>
          <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onValider}>Valider un RDV</Button>
        </div>
        <div className="apc-act-m" ref={ref} style={{ position: "relative" }}>
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => setOuvert(v => !v)} aria-haspopup="menu" aria-expanded={ouvert}>Actions ▾</Button>
          {ouvert && (
            <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, minWidth: "210px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "4px 0" }}>
              {items.map(it => (
                <button key={it.label} role="menuitem" type="button" className="apc-btn tap" onClick={() => { setOuvert(false); it.onClick(); }}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 14px", color: C.t1, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center" }}>{it.label}{it.extra}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Bande KPI unique ─────────────────────────────────────────────────────
export type ApercuKpi = { key: string; label: string; valeur: React.ReactNode; valeurTexte: number; dot: string; variation: { value: number; has: boolean }; onClick: () => void; active?: boolean };
export type ApercuKpiGroupe = { label: string; poids: number; items: ApercuKpi[] };

export function KpiBand({ C, groupes }: { C: ThemeTokens; groupes: ApercuKpiGroupe[] }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflowX: "auto", marginBottom: "16px" }}>
      <div style={{ display: "flex", minWidth: "880px" }}>
        {groupes.map((g, gi) => (
          <div key={g.label} role="group" aria-label={g.label || "Indicateurs"} style={{ flex: `${g.poids} 1 0`, minWidth: 0, borderLeft: gi > 0 ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "column" }}>
            {g.label && <div style={{ color: C.t3, fontSize: "12px", padding: "10px 16px 0" }}>{g.label}</div>}
            <div style={{ display: "flex", flex: 1 }}>
              {g.items.map((k, i) => {
                const v = k.variation;
                const couleur = v.value >= 0 ? C.green : C.red;
                return (
                  <button key={k.key} type="button" onClick={k.onClick} className="apc-kpi tap" aria-label={`${k.label} : ${k.valeurTexte}`} aria-pressed={k.active}
                    title={v.has ? `${v.value >= 0 ? "+" : ""}${v.value} % par rapport à hier` : "Pas de comparaison disponible"}
                    style={{ flex: "1 1 0", minWidth: 0, textAlign: "left", background: "none", border: "none", borderLeft: i > 0 ? `1px solid ${C.border}` : "none", padding: g.label ? "6px 16px 14px" : "14px 16px", cursor: "pointer", font: "inherit", boxShadow: k.active ? `inset 0 -2px 0 ${C.gold}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}>
                      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: k.dot, flexShrink: 0 }}/>{k.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                      <span style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{k.valeur}</span>
                      {v.has && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", height: "20px", padding: "0 6px", borderRadius: "5px", backgroundColor: `${couleur}1c`, color: couleur, fontSize: "11.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" fill="currentColor">{v.value >= 0 ? <path d="M5 1l4 7H1z"/> : <path d="M5 9L1 2h8z"/>}</svg>
                          {v.value >= 0 ? "+" : "−"}{Math.abs(v.value)} %
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Synthèse Aujourd'hui / Semaine / Mois ────────────────────────────────
export type ApercuSyntheseItem = { key: string; label: string; valeur: React.ReactNode; lignes: string[]; vide?: string; illustration?: React.ReactNode };
export function SyntheseBand({ C, items }: { C: ThemeTokens; items: ApercuSyntheseItem[] }) {
  return (
    <div className="apc-syn" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", marginBottom: "16px" }}>
      {items.map(it => (
        <div key={it.key} style={{ padding: "16px 20px", minWidth: 0 }}>
          <div style={{ color: C.t2, fontSize: "13px" }}>{it.label}</div>
          {it.vide ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "6px" }}>{it.illustration}<div style={{ color: C.t3, fontSize: "13px", lineHeight: 1.4 }}>{it.vide}</div></div>
          ) : (<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}><div style={{ minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "28px", fontWeight: 600, lineHeight: 1.2, marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>{it.valeur}</div>
            <div style={{ color: C.t3, fontSize: "12px", marginTop: "4px", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{it.lignes.join(" · ")}</div>
          </div>{it.illustration}</div>)}
        </div>
      ))}
    </div>
  );
}

// ── Ligne « À traiter maintenant » ───────────────────────────────────────
export function LigneATraiter({ C, couleur, titre, desc, onClick }: { C: ThemeTokens; couleur: string; titre: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="apc-row tap" aria-label={`${titre} : ${desc}`}
      style={{ width: "100%", minHeight: "64px", textAlign: "left", display: "flex", alignItems: "center", gap: "12px", background: "none", border: "none", borderTop: `1px solid ${C.border}`, padding: "10px 4px", cursor: "pointer", font: "inherit" }}>
      <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: couleur, flexShrink: 0 }}/>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 500 }}>{titre}</span>
        <span style={{ display: "block", color: C.t2, fontSize: "13px", lineHeight: 1.4 }}>{desc}</span>
      </span>
      {IcoChevron(C.t3)}
    </button>
  );
}

// ── Satisfaction ─────────────────────────────────────────────────────────
export function EtoilesAmbre({ C, note, taille = 16 }: { C: ThemeTokens; note: number; taille?: number }) {
  return (
    <span role="img" aria-label={`${note.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} sur 5`} style={{ display: "inline-flex", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} aria-hidden="true" width={taille} height={taille} viewBox="0 0 20 20" fill={i <= Math.round(note) ? C.orange : C.border2}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292z"/>
        </svg>
      ))}
    </span>
  );
}
export function LigneDistribution({ C, note, pct, count }: { C: ThemeTokens; note: number; pct: number; count: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 84px", alignItems: "center", gap: "8px", marginBottom: "6px", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ color: C.t2, fontSize: "13px" }}>{note} ★</span>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${note} étoiles`} style={{ height: "8px", borderRadius: "4px", backgroundColor: C.bg3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: C.orange, borderRadius: "4px" }}/>
      </div>
      <span style={{ color: C.t2, fontSize: "12px", textAlign: "right" }}>{Math.round(pct)} % · {count}</span>
    </div>
  );
}

// ── Objectifs ────────────────────────────────────────────────────────────
export function LigneObjectif({ C, label, texte, pct }: { C: ThemeTokens; label: string; texte: string; pct: number }) {
  const atteint = pct >= 100;
  return (
    <div style={{ minHeight: "56px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
        <span style={{ color: C.t1, fontSize: "14px" }}>{label}</span>
        <span style={{ color: C.t1, fontSize: "14px", fontWeight: 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{texte}</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label} style={{ height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: atteint ? C.green : C.gold, borderRadius: "3px" }}/>
      </div>
    </div>
  );
}

// ── Accès rapides ────────────────────────────────────────────────────────
export function CarteAcces({ C, icone, titre, desc, onClick }: { C: ThemeTokens; icone: React.ReactNode; titre: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="apc-row tap"
      style={{ width: "100%", minHeight: "72px", textAlign: "left", display: "flex", alignItems: "center", gap: "12px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 16px", cursor: "pointer", font: "inherit" }}>
      <span aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: C.bg3, color: C.t2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icone}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 500 }}>{titre}</span>
        <span style={{ display: "block", color: C.t3, fontSize: "12px" }}>{desc}</span>
      </span>
    </button>
  );
}

// Formateur d'heure unique : lib/heure.ts (règle Yelen, 12 h AM/PM). Ré-exporté
// ici pour ne pas casser les imports existants de ce module.
export { heureAmPm } from "@/lib/heure";
