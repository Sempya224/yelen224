"use client";

// Graphique "Performance des offres" — SVG fait main (aucune lib de
// graphiques dans le projet, convention déjà établie partout). Vues (orange
// Yelen) + Clics (gris-bleu) uniquement — Conversions retiré (non mesurable,
// le CTA renvoie vers un site externe partenaire sans callback). Données
// réelles fournies par app/api/institution/offres/vues (offre_vues/
// offre_clics), aucun chiffre fabriqué. Refonte UI 20/10/2026 : grille,
// axes, courbes lissées, légende cliquable, info-bulle au survol.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";

export type LignePerf = { date: string; vues: number; clics: number };

const W = 800;
const H = 320;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;
const SERIE_CLICS = "#64748B";

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// Courbe lissée sans dépassement : tangentes horizontales aux points,
// jamais de valeur interpolée au-delà des données réelles.
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function jourCourt(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function MesOffresPerformanceChart({ parJour }: { parJour: LignePerf[] }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [range, setRange] = useState<7 | 30>(30);
  const [masque, setMasque] = useState<{ vues: boolean; clics: boolean }>({ vues: false, clics: false });
  const [survol, setSurvol] = useState<number | null>(null);

  const data = parJour.slice(-range);
  const totalVues = data.reduce((s, d) => s + d.vues, 0);
  const totalClics = data.reduce((s, d) => s + d.clics, 0);
  const visibles = [!masque.vues && "vues", !masque.clics && "clics"].filter(Boolean) as ("vues" | "clics")[];
  const maxVal = niceMax(Math.max(1, ...data.map(d => Math.max(masque.vues ? 0 : d.vues, masque.clics ? 0 : d.clics))));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;
  const pts = (key: "vues" | "clics"): [number, number][] => data.map((d, i) => [x(i), y(d[key])]);
  const ticks = [0, 1, 2, 3, 4].map(i => (maxVal / 4) * i);
  const labelIdx = data.length <= 7 ? data.map((_, i) => i) : [0, Math.round((data.length - 1) / 4), Math.round((data.length - 1) / 2), Math.round(((data.length - 1) * 3) / 4), data.length - 1];
  const vide = data.length === 0 || (totalVues === 0 && totalClics === 0);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || data.length === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD_L) / innerW) * (data.length - 1));
    setSurvol(Math.min(data.length - 1, Math.max(0, i)));
  }

  const legende = (key: "vues" | "clics", label: string, total: number, color: string) => (
    <button type="button" aria-pressed={!masque[key]} onClick={() => setMasque(m => ({ ...m, [key]: !m[key] }))} className="ofx-btn tap"
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "2px 0", cursor: "pointer", color: masque[key] ? C.t3 : C.t2, fontSize: "13px", textDecoration: masque[key] ? "line-through" : "none" }}>
      <span aria-hidden="true" style={{ width: "10px", height: "3px", borderRadius: "2px", background: color, opacity: masque[key] ? 0.4 : 1 }}/>
      {label} <span style={{ fontVariantNumeric: "tabular-nums", color: C.t1, fontWeight: 600 }}>({total})</span>
    </button>
  );

  const s = survol !== null ? data[survol] : null;
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "8px" }}>
        <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>Performance des offres</h2>
        <div role="group" aria-label="Période" style={{ display: "inline-flex", border: `1px solid ${C.border2}`, borderRadius: "8px", overflow: "hidden" }}>
          {([7, 30] as const).map((r, i) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className="ofx-btn tap"
              style={{ height: "30px", padding: "0 12px", border: "none", borderLeft: i > 0 ? `1px solid ${C.border2}` : "none", backgroundColor: range === r ? C.bg3 : "transparent", color: range === r ? C.t1 : C.t2, fontSize: "12.5px", fontWeight: range === r ? 600 : 500, cursor: "pointer" }}>
              {r === 7 ? "7 jours" : "30 jours"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
        {legende("vues", "Vues", totalVues, C.gold)}
        {legende("clics", "Clics", totalClics, SERIE_CLICS)}
      </div>
      <span aria-live="polite" className="ofx-sr">{`Période ${range} jours : ${totalVues} vues, ${totalClics} clics`}</span>

      {vide ? (
        <div style={{ height: "320px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: C.t2, fontSize: "13px" }}>
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Aucune vue ni clic enregistré sur cette période.
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Courbes des vues et des clics sur ${range} jours`} style={{ width: "100%", height: "auto", maxHeight: "320px", display: "block" }}
            onMouseMove={onMove} onMouseLeave={() => setSurvol(null)}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke={C.border} strokeWidth="1"/>
                <text x={PAD_L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill={C.t3}>{Math.round(t)}</text>
              </g>
            ))}
            {labelIdx.map(i => (
              <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="12" fill={C.t3}>{jourCourt(data[i].date)}</text>
            ))}
            {visibles.includes("vues") && <path d={smoothPath(pts("vues"))} fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}
            {visibles.includes("clics") && <path d={smoothPath(pts("clics"))} fill="none" stroke={SERIE_CLICS} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}
            {survol !== null && (
              <g>
                <line x1={x(survol)} x2={x(survol)} y1={PAD_T} y2={H - PAD_B} stroke={C.border2} strokeWidth="1"/>
                {visibles.includes("vues") && <circle cx={x(survol)} cy={y(data[survol].vues)} r="4" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>}
                {visibles.includes("clics") && <circle cx={x(survol)} cy={y(data[survol].clics)} r="4" fill={C.bgCard} stroke={SERIE_CLICS} strokeWidth="2"/>}
              </g>
            )}
          </svg>
          {s && survol !== null && (
            <div style={{ position: "absolute", top: 8, left: `${Math.min(78, Math.max(2, (x(survol) / W) * 100 + 2))}%`, pointerEvents: "none", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 10px", fontSize: "12px", color: C.t2, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", whiteSpace: "nowrap" }}>
              <div style={{ color: C.t1, fontWeight: 600, marginBottom: "4px" }}>{jourCourt(s.date)}</div>
              {visibles.includes("vues") && <div>Vues : <strong style={{ color: C.t1, fontVariantNumeric: "tabular-nums" }}>{s.vues}</strong></div>}
              {visibles.includes("clics") && <div>Clics : <strong style={{ color: C.t1, fontVariantNumeric: "tabular-nums" }}>{s.clics}</strong></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
