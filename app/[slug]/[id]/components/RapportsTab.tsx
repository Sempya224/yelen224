"use client";

// Rapports — "Executive Report Center" (refonte niveau US, brief CEO
// 06/08/2026, instruction #10). Périmètre fonctionnel inchangé : mêmes
// données (revenus, top services, répartition, activité), uniquement la
// hiérarchie visuelle/lisibilité/crédibilité changent. Source de données :
// GET /api/institution/rapports/executif (lib/rapportsAggregation.ts),
// distincte de /api/institution/finance/accueil (FinanceAccueilTab, pas
// touchée par ce chantier). Aucune librairie de charts dans le projet —
// courbe, donut et sparklines sont du SVG manuel, même convention que
// CentreAnalyseTab.tsx (Sparkline/DeltaLabel/KpiCard répliqués localement).
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";
import { DEVISE_LABEL } from "@/lib/devise";

type PointSerie = { label: string; montant: number; ventes: number };
type KpiPeriode = { montant: number; nb: number; delta: number | null };
type ServiceRapport = {
  id: string; nom: string; categorie: string; nb: number; montant: number;
  delta: number | null; partCA: number; dureeMinutes: number | null;
};
type CategorieRepartition = { categorie: string; montant: number; pct: number };
type RapportExecutif = {
  genere_le: string;
  kpi: { aujourdhui: KpiPeriode; semaine: KpiPeriode; mois: KpiPeriode; annee: KpiPeriode };
  sparklines: { aujourdhui: number[]; semaine: number[]; mois: number[]; annee: number[] };
  evolution: { jour: PointSerie[]; semaine: PointSerie[]; mois: PointSerie[]; annee: PointSerie[] };
  top_services: ServiceRapport[];
  repartition_categories: CategorieRepartition[];
  activite_jour: PointSerie[];
  meilleur_jour_semaine: { jour: string; montant: number } | null;
  resume: string[];
};

function formatPrix(p: number): string { return Math.round(p).toLocaleString("fr-FR") + " " + DEVISE_LABEL; }
function formatDateHeure(iso: string): string { return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
function formatHeureCourte(iso: string): string { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }

const ICON_CLOCK = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const ICON_CALENDAR = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const ICON_BARCHART = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>;
const ICON_TRENDING = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
const ICON_PDF = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const ICON_EXCEL = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const ICON_PRINT = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
const ICON_SPARKLE = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/><circle cx="12" cy="12" r="5"/></svg>;

// ── Mini-sparkline SVG (polyline manuelle) ──
function Sparkline({ serie, color }: { serie: number[]; color: string }) {
  if (serie.length < 2 || serie.every(v => v === 0)) return <div style={{ height: "26px" }}/>;
  const max = Math.max(...serie, 1);
  const points = serie.map((v, i) => {
    const x = (i / (serie.length - 1)) * 100;
    const y = 26 - (v / max) * 22 - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ width: "100%", height: "26px", display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DeltaBadge({ delta, C }: { delta: number | null; C: ThemeTokens }) {
  if (delta === null) return <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 600 }}>Pas de comparaison</span>;
  const positif = delta > 0;
  const neutre = delta === 0;
  const color = neutre ? C.t3 : positif ? C.green : C.red;
  return (
    <span style={{ color, fontSize: "11px", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "3px" }}>
      {!neutre && (positif
        ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>)}
      {positif ? "+" : ""}{delta}%
    </span>
  );
}

// ── Carte KPI exécutive (§3) — valeur + évolution + icône + sparkline, jamais un chiffre nu ──
function KpiCard({ label, icon, montant, nb, delta, sparkline, vsLabel, color, C }: {
  label: string; icon: React.ReactNode; montant: number; nb: number; delta: number | null;
  sparkline: number[]; vsLabel: string; color: string; C: ThemeTokens;
}) {
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "26px", height: "26px", borderRadius: "8px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
      </div>
      <div style={{ color: C.t1, fontSize: "21px", fontWeight: "800", letterSpacing: "-0.4px", lineHeight: 1.1 }}>{formatPrix(montant)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <DeltaBadge delta={delta} C={C}/>
        <span style={{ color: C.t3, fontSize: "10.5px" }}>{vsLabel}</span>
      </div>
      <Sparkline serie={sparkline} color={color}/>
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: 600 }}>{nb} vente{nb > 1 ? "s" : ""}</div>
    </Card>
  );
}

// ── Courbe d'évolution (§4) — aire + ligne, hover/tooltip, toggle Jour/Semaine/Mois/Année ──
const GRANULARITES: { id: "jour" | "semaine" | "mois" | "annee"; label: string }[] = [
  { id: "jour", label: "Jour" },
  { id: "semaine", label: "Semaine" },
  { id: "mois", label: "Mois" },
  { id: "annee", label: "Année" },
];
const CHART_W = 640;
const CHART_H = 240;
const CHART_PAD = 10;

function EvolutionChart({ evolution, range, onRangeChange, C }: {
  evolution: RapportExecutif["evolution"]; range: "jour" | "semaine" | "mois" | "annee";
  onRangeChange: (r: "jour" | "semaine" | "mois" | "annee") => void; C: ThemeTokens;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const points = evolution[range];
  const maxVal = Math.max(1, ...points.map(p => p.montant));
  const stepX = points.length > 1 ? (CHART_W - CHART_PAD * 2) / (points.length - 1) : 0;
  const xAt = (i: number) => CHART_PAD + i * stepX;
  const yAt = (v: number) => CHART_H - CHART_PAD - (v / maxVal) * (CHART_H - CHART_PAD * 2);
  const linePoints = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.montant).toFixed(1)}`).join(" ");
  const areaPoints = points.length > 0 ? `${xAt(0).toFixed(1)},${CHART_H - CHART_PAD} ${linePoints} ${xAt(points.length - 1).toFixed(1)},${CHART_H - CHART_PAD}` : "";
  const total = points.reduce((s, p) => s + p.montant, 0);
  const totalVentes = points.reduce((s, p) => s + p.ventes, 0);
  const vide = total === 0;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    let idx = Math.round((relX - CHART_PAD) / (stepX || 1));
    idx = Math.max(0, Math.min(points.length - 1, idx));
    setHoverIdx(idx);
  }

  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "6px" }}>
        <div>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Évolution des revenus</div>
          <div style={{ color: C.t3, fontSize: "11px", marginTop: "3px" }}>{formatPrix(total)} · {totalVentes} vente{totalVentes > 1 ? "s" : ""}</div>
        </div>
        <div className="no-print" style={{ display: "flex", gap: "6px" }}>
          {GRANULARITES.map(g => (
            <button key={g.id} onClick={() => { onRangeChange(g.id); setHoverIdx(null); }} className="tap" style={{ backgroundColor: range === g.id ? `${C.gold}15` : C.bg3, border: `1px solid ${range === g.id ? C.gold + "50" : C.border}`, borderRadius: "9px", padding: "6px 12px", color: range === g.id ? C.gold : C.t2, fontSize: "11.5px", fontWeight: range === g.id ? 800 : 600, cursor: "pointer" }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {vide ? (
        <div style={{ height: "240px", display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, fontSize: "12.5px" }}>Aucune vente sur cette période.</div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" style={{ width: "100%", height: "240px", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
            <defs>
              <linearGradient id="rapportsAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} stopOpacity="0.28"/>
                <stop offset="100%" stopColor={C.gold} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#rapportsAreaFill)"/>
            <polyline points={linePoints} fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            {hoverIdx !== null && points[hoverIdx] && (
              <>
                <line x1={xAt(hoverIdx)} y1={CHART_PAD} x2={xAt(hoverIdx)} y2={CHART_H - CHART_PAD} stroke={C.border2} strokeWidth="1" strokeDasharray="3 3"/>
                <circle cx={xAt(hoverIdx)} cy={yAt(points[hoverIdx].montant)} r="4" fill={C.gold} stroke={C.bgCard} strokeWidth="2"/>
              </>
            )}
          </svg>
          {hoverIdx !== null && points[hoverIdx] && (
            <div style={{ position: "absolute", left: `${(xAt(hoverIdx) / CHART_W) * 100}%`, top: "4px", transform: xAt(hoverIdx) > CHART_W / 2 ? "translateX(-104%)" : "translateX(6%)", backgroundColor: C.t1, borderRadius: "8px", padding: "7px 10px", pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(0,0,0,0.22)" }}>
              <div style={{ color: C.bg, fontSize: "10.5px", fontWeight: 700, opacity: 0.75 }}>{points[hoverIdx].label}</div>
              <div style={{ color: C.bg, fontSize: "13px", fontWeight: 800 }}>{formatPrix(points[hoverIdx].montant)}</div>
              <div style={{ color: C.bg, fontSize: "10px", fontWeight: 600, opacity: 0.75 }}>{points[hoverIdx].ventes} vente{points[hoverIdx].ventes > 1 ? "s" : ""}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Top services (§5) — tableau triable ──
type ColKey = "nom" | "categorie" | "nb" | "montant" | "delta" | "partCA" | "dureeMinutes";
const COLONNES: { key: ColKey; label: string; align?: "right" }[] = [
  { key: "nom", label: "Service" },
  { key: "categorie", label: "Catégorie" },
  { key: "nb", label: "Ventes", align: "right" },
  { key: "montant", label: "CA", align: "right" },
  { key: "delta", label: "Évolution", align: "right" },
  { key: "partCA", label: "Part du CA", align: "right" },
  { key: "dureeMinutes", label: "Durée", align: "right" },
];

function TopServicesTable({ services, C }: { services: ServiceRapport[]; C: ThemeTokens }) {
  const [sortKey, setSortKey] = useState<ColKey>("montant");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(k: ColKey) {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    const arr = [...services];
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      let cmp: number;
      if (typeof av === "string" || typeof bv === "string") {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      } else {
        cmp = (av ?? -Infinity) - (bv ?? -Infinity);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [services, sortKey, sortDir]);

  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ marginBottom: "16px" }}>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "2px" }}>Top services</div>
      <div style={{ color: C.t3, fontSize: "11px", marginBottom: "14px" }}>Cette année · cliquez un en-tête pour trier</div>
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", color: C.t3, fontSize: "12px", padding: "24px 8px" }}>Aucune vente cette année pour l&apos;instant.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "620px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {COLONNES.map(c => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} style={{ textAlign: c.align ?? "left", color: sortKey === c.key ? C.gold : C.t3, fontSize: "9.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.3px", padding: "8px 8px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                    {c.label}{sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.12s ease" }} className="tap">
                  <td style={{ padding: "9px 8px", color: C.t1, fontWeight: 700, whiteSpace: "nowrap" }}>{s.nom}</td>
                  <td style={{ padding: "9px 8px", color: C.t3, whiteSpace: "nowrap" }}>{s.categorie}</td>
                  <td style={{ padding: "9px 8px", color: C.t2, textAlign: "right" }}>{s.nb}</td>
                  <td style={{ padding: "9px 8px", color: C.green, fontWeight: 800, textAlign: "right", whiteSpace: "nowrap" }}>{formatPrix(s.montant)}</td>
                  <td style={{ padding: "9px 8px", textAlign: "right" }}><DeltaBadge delta={s.delta} C={C}/></td>
                  <td style={{ padding: "9px 8px", color: C.t1, fontWeight: 700, textAlign: "right" }}>{s.partCA}%</td>
                  <td style={{ padding: "9px 8px", color: C.t3, textAlign: "right", whiteSpace: "nowrap" }}>{s.dureeMinutes !== null ? `${s.dureeMinutes} min` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Répartition par catégorie (§6) — donut, clic = drill-down (filtre le tableau) ──
const CATEGORIE_COULEURS = (C: ThemeTokens) => [C.gold, C.blue, C.green, C.orange, C.purple, C.teal, C.red];

function DonutCategories({ categories, selected, onSelect, C }: {
  categories: CategorieRepartition[]; selected: string | null; onSelect: (c: string | null) => void; C: ThemeTokens;
}) {
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const total = categories.reduce((s, c) => s + c.montant, 0);
  const couleurs = CATEGORIE_COULEURS(C);
  // Sommes cumulées calculées sans mutation (react-hooks/immutability) —
  // même résultat numérique qu'un accumulateur `let`, via des sommes préfixes.
  const cumules = categories.reduce<{ frac: number; start: number }[]>((acc, c) => {
    const frac = total > 0 ? c.montant / total : 0;
    const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].frac : 0;
    return [...acc, { frac, start }];
  }, []);

  return (
    <Card tokens={toCardTokens(C)} padding="18px">
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "2px" }}>Répartition des revenus</div>
      <div style={{ color: C.t3, fontSize: "11px", marginBottom: "16px" }}>Cette année, par catégorie{categories.length > 0 ? (selected ? " — cliquez pour réinitialiser" : " — cliquez pour filtrer le tableau") : ""}</div>
      {categories.length === 0 ? (
        <div style={{ textAlign: "center", color: C.t3, fontSize: "12px", padding: "24px 8px" }}>Aucune vente cette année pour l&apos;instant.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "22px", flexWrap: "wrap" }}>
          <svg width="130" height="130" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
            <circle cx="50" cy="50" r={R} fill="none" stroke={C.bg3} strokeWidth="14"/>
            {categories.map((c, i) => {
              const frac = total > 0 ? c.montant / total : 0;
              const dash = frac * CIRC;
              const offset = -(cumules[i].start * CIRC);
              const estSelectionne = selected === c.categorie;
              const estAttenue = selected !== null && !estSelectionne;
              return (
                <circle key={c.categorie} cx="50" cy="50" r={R} fill="none" stroke={couleurs[i % couleurs.length]} strokeWidth={estSelectionne ? 16 : 14}
                  strokeDasharray={`${dash} ${CIRC - dash}`} strokeDashoffset={offset} transform="rotate(-90 50 50)"
                  opacity={estAttenue ? 0.3 : 1} style={{ cursor: "pointer", transition: "opacity 0.15s ease, stroke-width 0.15s ease" }}
                  onClick={() => onSelect(estSelectionne ? null : c.categorie)}/>
              );
            })}
            <text x="50" y="47" textAnchor="middle" fontSize="12.5" fontWeight="900" fill={C.t1}>{Math.round(total / 1000)}k</text>
            <text x="50" y="61" textAnchor="middle" fontSize="6.5" fill={C.t3}>{DEVISE_LABEL}</text>
          </svg>
          <div style={{ flex: 1, minWidth: "160px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {categories.map((c, i) => (
              <div key={c.categorie} onClick={() => onSelect(selected === c.categorie ? null : c.categorie)} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", opacity: selected !== null && selected !== c.categorie ? 0.4 : 1 }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: couleurs[i % couleurs.length], flexShrink: 0 }}/>
                <span style={{ flex: 1, minWidth: 0, color: C.t2, fontSize: "11.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.categorie}</span>
                <span style={{ color: C.t1, fontSize: "11.5px", fontWeight: 800, flexShrink: 0 }}>{c.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Vue activité (§7) — ventes par heure, aujourd'hui ──
function ActiviteTimeline({ points, C }: { points: PointSerie[]; C: ThemeTokens }) {
  const avecVentes = points.filter(p => p.ventes > 0);
  const maxVentes = Math.max(1, ...points.map(p => p.ventes));
  return (
    <Card tokens={toCardTokens(C)} padding="18px">
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "2px" }}>Activité du jour</div>
      <div style={{ color: C.t3, fontSize: "11px", marginBottom: "14px" }}>Ventes par heure, aujourd&apos;hui</div>
      {avecVentes.length === 0 ? (
        <div style={{ textAlign: "center", color: C.t3, fontSize: "12px", padding: "24px 8px" }}>Aucune vente aujourd&apos;hui pour l&apos;instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", maxHeight: "280px", overflowY: "auto" }}>
          {avecVentes.map(p => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "30px", color: C.t3, fontSize: "10.5px", fontWeight: 700, flexShrink: 0 }}>{p.label}</span>
              <div style={{ flex: 1, height: "8px", backgroundColor: C.bg3, borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(p.ventes / maxVentes) * 100}%`, backgroundColor: C.gold, borderRadius: "4px", transition: "width 0.3s ease" }}/>
              </div>
              <span style={{ width: "68px", textAlign: "right", color: C.t1, fontSize: "11px", fontWeight: 800, flexShrink: 0 }}>{p.ventes} vente{p.ventes > 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Résumé intelligent (§8) — synthèse 100% déterministe, générée côté serveur, zéro LLM ──
function ResumeIntelligent({ lignes, C }: { lignes: string[]; C: ThemeTokens }) {
  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ border: `1px solid ${C.gold}20` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ color: C.gold }}>{ICON_SPARKLE}</span>
        <span style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800" }}>Résumé</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {lignes.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: C.gold, marginTop: "7px", flexShrink: 0 }}/>
            <span style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{l}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RapportsTab({ instId }: { instId: string }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [data, setData] = useState<RapportExecutif | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"jour" | "semaine" | "mois" | "annee">("semaine");
  const [categorieFiltre, setCategorieFiltre] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/institution/rapports/executif");
    const j = await res.json().catch(() => null);
    setData(res.ok ? j : null);
    setLoading(false);
  }

  useEffect(() => { load(); }, [instId]);

  const servicesAffiches = useMemo(() => {
    if (!data) return [];
    return categorieFiltre ? data.top_services.filter(s => s.categorie === categorieFiltre) : data.top_services;
  }, [data, categorieFiltre]);

  async function telechargerFichier(url: string, filename: string, setBusy: (v: boolean) => void) {
    setBusy(true);
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
    }
    setBusy(false);
  }

  if (loading) {
    return <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>;
  }
  if (!data) {
    return <div style={{ padding: "48px 16px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Impossible de charger les rapports.</div>;
  }

  return (
    <div id="print-area-rapports" style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <style>{`
        @media print {
          body > *:not(#print-area-rapports) { display: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "6px" }}>Rapports</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px", lineHeight: 1.5 }}>Analyse financière et opérationnelle de votre établissement. Toutes les données proviennent de l&apos;activité réelle de Yelen.</p>

      {/* Header exécutif (§2) — date, dernière synchro, actions d'export.
          Pas de sélecteur de date interactif : toutes les périodes sont
          calculées par rapport à "maintenant" côté serveur (même périmètre
          fonctionnel qu'avant la refonte) — un vrai sélecteur de date
          historique nécessiterait une nouvelle capacité serveur (rapport à
          une date passée), hors périmètre "visuel uniquement" de ce lot. */}
      <Card tokens={toCardTokens(C)} padding="12px 16px" className="no-print" style={{ marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "800", textTransform: "capitalize" }}>{formatDateHeure(data.genere_le)}</span>
          <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "600" }}>Synchronisé à {formatHeureCourte(data.genere_le)}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" loading={exportingPdf} icon={ICON_PDF} onClick={() => telechargerFichier("/api/institution/rapports/pdf", `rapport-executif-${new Date().toISOString().slice(0, 10)}.pdf`, setExportingPdf)}>Export PDF</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" loading={exportingXlsx} icon={ICON_EXCEL} onClick={() => telechargerFichier("/api/institution/rapports", `rapport-financier-${new Date().toISOString().slice(0, 10)}.xlsx`, setExportingXlsx)}>Export Excel</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" icon={ICON_PRINT} onClick={() => window.print()}>Imprimer</Button>
          <button onClick={load} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px", fontSize: "12.5px", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center" }} aria-label="Actualiser">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
        </div>
      </Card>

      {/* KPI exécutifs (§3) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <KpiCard label="Aujourd'hui" icon={ICON_CLOCK} montant={data.kpi.aujourdhui.montant} nb={data.kpi.aujourdhui.nb} delta={data.kpi.aujourdhui.delta} sparkline={data.sparklines.aujourdhui} vsLabel="vs hier" color={C.gold} C={C}/>
        <KpiCard label="Cette semaine" icon={ICON_CALENDAR} montant={data.kpi.semaine.montant} nb={data.kpi.semaine.nb} delta={data.kpi.semaine.delta} sparkline={data.sparklines.semaine} vsLabel="vs semaine précédente" color={C.blue} C={C}/>
        <KpiCard label="Ce mois" icon={ICON_BARCHART} montant={data.kpi.mois.montant} nb={data.kpi.mois.nb} delta={data.kpi.mois.delta} sparkline={data.sparklines.mois} vsLabel="vs mois précédent" color={C.green} C={C}/>
        <KpiCard label="Cette année" icon={ICON_TRENDING} montant={data.kpi.annee.montant} nb={data.kpi.annee.nb} delta={data.kpi.annee.delta} sparkline={data.sparklines.annee} vsLabel="vs année précédente" color={C.purple} C={C}/>
      </div>

      {/* Courbe d'évolution (§4) */}
      <EvolutionChart evolution={data.evolution} range={range} onRangeChange={setRange} C={C}/>

      {/* Top services (§5) */}
      <TopServicesTable services={servicesAffiches} C={C}/>

      {/* Répartition (§6) + Activité (§7) côte à côte ≥1024px */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px", marginBottom: "16px" }}>
        <DonutCategories categories={data.repartition_categories} selected={categorieFiltre} onSelect={setCategorieFiltre} C={C}/>
        <ActiviteTimeline points={data.activite_jour} C={C}/>
      </div>

      {/* Résumé (§8) */}
      <ResumeIntelligent lignes={data.resume} C={C}/>
    </div>
  );
}
