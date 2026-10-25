"use client";

// Carte KPI du Centre d'Analyse (refonte UI 20/10/2026) — extraite de
// CentreAnalyseTab.tsx avec la même signature de props, donc les ~30
// usages (Vue d'ensemble, Acquisition, Tunnel, Heatmap, Mes clients,
// tiroir de source) adoptent le même rendu d'un coup. Les calculs
// (valeur, delta, serie) restent ceux de lib/analyseAggregation.ts : ce
// composant ne fait que les présenter. La prop `color` est conservée pour
// ne pas toucher aux appelants mais n'est plus décorative : une seule
// couleur pour toutes les sparklines/icônes.
import type { ThemeTokens } from "../../theme";
import { toCardTokens } from "../../theme";
import { Card } from "@/components/ui/Card";
import type { KpiMetric } from "@/lib/analyseAggregation";

// Styles partagés par les composants de l'écran — à rendre UNE fois dans
// CentreAnalyseTab (évite un <style> par carte).
export function AnalyseStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .ya-kpi{container-type:inline-size;transition:border-color 150ms ease}
      .ya-kpi:hover{border-color:${C.border2}!important}
      .ya-pad{padding-left:24px;padding-right:24px}
      @media (min-width:1024px){.ya-pad{padding-left:32px;padding-right:32px}}
      .ya-kpi-vs{display:none}
      @container (min-width: 190px){.ya-kpi-vs{display:inline}}
      .ya-kpi-grid{display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:24px}
      @media (min-width:640px){.ya-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (min-width:1024px){.ya-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media (min-width:1536px){.ya-kpi-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
      @keyframes ya-pulse{0%,100%{opacity:1}50%{opacity:.45}}
      .ya-skel{animation:ya-pulse 1.4s ease-in-out infinite}
      @media (prefers-reduced-motion: reduce){.ya-skel{animation:none}.ya-kpi{transition:none}}
    `}</style>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="ya-kpi-grid">{children}</div>;
}

const LARGEUR = 100;
const HAUTEUR = 32;

// Courbe lissée (cubique à tangentes horizontales : jamais de dépassement
// au-dessus/en dessous des points).
export function cheminLisse(points: [number, number][]): string {
  if (points.length === 0) return "";
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(2)},${y0.toFixed(2)} ${mx.toFixed(2)},${y1.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return d;
}

function KpiSparkline({ serie, C }: { serie: number[]; C: ThemeTokens }) {
  const exploitable = serie.length >= 2 && serie.some(v => v > 0);
  if (!exploitable) {
    return (
      <svg aria-hidden="true" viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} preserveAspectRatio="none" style={{ width: "100%", height: `${HAUTEUR}px`, display: "block" }}>
        <line x1="0" y1={HAUTEUR - 4} x2={LARGEUR} y2={HAUTEUR - 4} stroke={C.border2} strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke"/>
      </svg>
    );
  }
  const max = Math.max(...serie, 1);
  const pts: [number, number][] = serie.map((v, i) => [(i / (serie.length - 1)) * LARGEUR, HAUTEUR - 3 - (v / max) * (HAUTEUR - 6)]);
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} preserveAspectRatio="none" style={{ width: "100%", height: `${HAUTEUR}px`, display: "block" }}>
      <path d={cheminLisse(pts)} fill="none" stroke={C.gold} strokeOpacity="0.8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

function fmtNombre(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
// Les callbacks `format` des appelants produisent des chaînes à point
// décimal (« 12.5% », « 4.2/5 ») — localisées ici sans modifier les appelants.
function localiser(s: string): string {
  return s.replace(/(\d)\.(\d)/g, "$1,$2");
}

function VariationBadge({ delta, unite, C }: { delta: number | null; unite: "%" | "pts"; C: ThemeTokens }) {
  if (delta === null) {
    return <span style={{ color: C.t3, fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Pas de comparaison</span>;
  }
  const sens = delta > 0 ? "hausse" : delta < 0 ? "baisse" : "nul";
  const couleur = sens === "hausse" ? C.green : sens === "baisse" ? C.red : C.t3;
  const fond = sens === "nul" ? C.bg3 : `${couleur}1a`;
  const unit = unite === "pts" ? "pts" : "%";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
      <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "3px", backgroundColor: fond, color: couleur, fontSize: "12px", fontWeight: 600, padding: "2px 7px", borderRadius: "10px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {sens === "hausse" && <span aria-hidden="true">▲</span>}
        {sens === "baisse" && <span aria-hidden="true">▼</span>}
        {sens === "hausse" ? "+" : sens === "baisse" ? "−" : ""}{fmtNombre(Math.abs(delta))} {unit}
      </span>
      <span className="ya-kpi-vs" style={{ color: C.t3, fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs période préc.</span>
    </span>
  );
}

export function KpiCard({ label, icon, metric, unite, format, C }: {
  label: string;
  icon: React.ReactNode;
  color?: string;
  metric: KpiMetric | null;
  unite: "%" | "pts";
  format?: (v: number) => string;
  C: ThemeTokens;
}) {
  if (metric === null) {
    return (
      <Card tokens={toCardTokens(C)} padding="16px" className="ya-kpi" style={{ height: "100%", minHeight: "128px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div role="status" aria-label={`${label} : chargement`} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div className="ya-skel" style={{ width: "55%", height: "13px", borderRadius: "6px", backgroundColor: C.bg3 }}/>
          <div className="ya-skel" style={{ width: "40%", height: "28px", borderRadius: "6px", backgroundColor: C.bg3 }}/>
          <div className="ya-skel" style={{ width: "30%", height: "16px", borderRadius: "8px", backgroundColor: C.bg3 }}/>
        </div>
      </Card>
    );
  }
  const sansDonnee = metric.valeur === null;
  const valeur = sansDonnee ? "—" : localiser(format ? format(metric.valeur as number) : (metric.valeur as number).toLocaleString("fr-FR"));
  const sens = metric.delta === null ? "" : metric.delta > 0 ? `, en hausse de ${fmtNombre(metric.delta)} ${unite === "pts" ? "points" : "%"}` : metric.delta < 0 ? `, en baisse de ${fmtNombre(Math.abs(metric.delta))} ${unite === "pts" ? "points" : "%"}` : ", stable";

  return (
    <Card
      tokens={toCardTokens(C)} padding="16px" className="ya-kpi" role="group"
      aria-label={sansDonnee ? `${label} : pas encore de données` : `${label} : ${valeur}${sens}`}
      style={{ height: "100%", minHeight: "128px", display: "flex", flexDirection: "column", gap: "8px" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span title={label} style={{ color: C.t3, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{label}</span>
        <span aria-hidden="true" style={{ color: C.t3, display: "flex", flexShrink: 0 }}>{icon}</span>
      </div>
      <div style={{ color: sansDonnee ? C.t3 : C.t1, fontSize: "28px", fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={valeur}>{valeur}</div>
      <div style={{ minHeight: "20px", display: "flex", alignItems: "center" }}>
        {sansDonnee
          ? <span style={{ color: C.t3, fontSize: "12px" }}>Pas encore de données</span>
          : <VariationBadge delta={metric.delta} unite={unite} C={C}/>}
      </div>
      <div style={{ marginTop: "auto" }}>
        <KpiSparkline serie={sansDonnee ? [] : metric.serie} C={C}/>
      </div>
    </Card>
  );
}
