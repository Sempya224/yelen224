"use client";

// Carte « Évolution des performances » (refonte UI 20/10/2026). Mêmes
// données et même échelle qu'avant (`jours` découpé sur la période
// globale, une échelle Y commune aux 3 séries) — seul le rendu change :
// SVG fait main (aucune lib de graphiques dans le projet), courbes
// lissées, axes, grille légère, tooltip et légende cliquable.
import { useEffect, useId, useRef, useState } from "react";
import type { ThemeTokens } from "../../theme";
import { toCardTokens } from "../../theme";
import { Card } from "@/components/ui/Card";
import { parseLocalDate } from "../../dashboardShared";
import type { PointEvolution } from "@/lib/analyseAggregation";
import { cheminLisse } from "./KpiCard";

type SerieKey = "vues" | "clics" | "conversions";

const PAD = { gauche: 40, droite: 12, haut: 12, bas: 28 };

function nombre(n: number): string { return n.toLocaleString("fr-FR"); }
function dateCourte(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function dateLongue(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

// Graduations « propres » (1, 2, 5 × 10^k), entières, 4 intervalles max.
function graduations(max: number): number[] {
  const brut = Math.max(1, max) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  const f = brut / p;
  const pas = Math.max(1, Math.ceil((f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p));
  const haut = Math.ceil(Math.max(1, max) / pas) * pas;
  const ticks: number[] = [];
  for (let v = 0; v <= haut; v += pas) ticks.push(v);
  return ticks;
}

export function PerformanceChart({ C, jours, periodeJours, vide }: {
  C: ThemeTokens; jours: PointEvolution[] | null; periodeJours: number; vide: React.ReactNode;
}) {
  const gradId = useId();
  const zoneRef = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(600);
  const [masquees, setMasquees] = useState<SerieKey[]>([]);
  const [survol, setSurvol] = useState<number | null>(null);

  useEffect(() => {
    const el = zoneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  });

  const data = (jours ?? []).slice(-periodeJours);
  const totaux = data.reduce((acc, d) => ({ vues: acc.vues + d.vues, clics: acc.clics + d.clics, conversions: acc.conversions + d.conversions }), { vues: 0, clics: 0, conversions: 0 });
  const estVide = jours === null || data.length === 0 || (totaux.vues === 0 && totaux.clics === 0 && totaux.conversions === 0);

  // Palette sobre : série principale en or Yelen, secondaires en gris.
  const series: { key: SerieKey; label: string; couleur: string }[] = [
    { key: "vues", label: "Vues", couleur: C.gold },
    { key: "clics", label: "Clics", couleur: "#64748b" },
    { key: "conversions", label: "Conversions", couleur: "#9ca3af" },
  ];

  const mobile = largeur < 480;
  const hauteur = mobile ? 240 : 340;
  const w = Math.max(largeur, 240);
  const zoneW = w - PAD.gauche - PAD.droite;
  const zoneH = hauteur - PAD.haut - PAD.bas;
  const maxVal = Math.max(1, ...data.map(d => Math.max(d.vues, d.clics, d.conversions)));
  const ticks = graduations(maxVal);
  const yMax = ticks[ticks.length - 1];
  const stepX = data.length > 1 ? zoneW / (data.length - 1) : 0;
  const px = (i: number) => PAD.gauche + (data.length > 1 ? i * stepX : zoneW / 2);
  const py = (v: number) => PAD.haut + zoneH - (v / yMax) * zoneH;

  function basculer(k: SerieKey) {
    setMasquees(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  }

  function surPointeur(e: React.PointerEvent<SVGRectElement>) {
    if (data.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = data.length > 1 ? Math.round((x - PAD.gauche) / stepX) : 0;
    setSurvol(Math.min(data.length - 1, Math.max(0, i)));
  }

  const nbEtiquettes = mobile ? 3 : 6;
  const indicesX = data.length <= 1 ? [0] : Array.from({ length: Math.min(nbEtiquettes, data.length) }, (_, k) => Math.round((k * (data.length - 1)) / (Math.min(nbEtiquettes, data.length) - 1)));

  const aria = `Évolution sur la période : ${nombre(totaux.vues)} vues, ${nombre(totaux.clics)} clics, ${nombre(totaux.conversions)} conversions.`;

  return (
    <Card tokens={toCardTokens(C)} padding="20px" style={{ marginBottom: "24px" }}>
      <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 12px" }}>Évolution des performances</h2>
      <div role="group" aria-label="Séries affichées" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
        {series.map(sr => {
          const off = masquees.includes(sr.key);
          return (
            <button key={sr.key} onClick={() => basculer(sr.key)} aria-pressed={!off} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "7px", height: "28px", padding: "0 10px", borderRadius: "14px", border: `1px solid ${C.border2}`, backgroundColor: "transparent", color: off ? C.t3 : C.t1, fontSize: "13px", cursor: "pointer", opacity: off ? 0.6 : 1 }}>
              <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: off ? "transparent" : sr.couleur, border: `1.5px solid ${sr.couleur}` }}/>
              {sr.label}
              <span style={{ color: C.t3, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{nombre(totaux[sr.key])}</span>
            </button>
          );
        })}
      </div>

      {jours === null ? (
        <div role="status" aria-label="Chargement du graphique" className="ya-skel" style={{ height: `${hauteur}px`, borderRadius: "8px", backgroundColor: C.bg3 }}/>
      ) : estVide ? (
        <div style={{ minHeight: "240px", display: "flex", alignItems: "center", justifyContent: "center" }}>{vide}</div>
      ) : (
        <div ref={zoneRef} style={{ position: "relative", width: "100%", height: `${hauteur}px` }}>
          <svg role="img" aria-label={aria} width={w} height={hauteur} viewBox={`0 0 ${w} ${hauteur}`} style={{ display: "block", overflow: "visible" }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} stopOpacity="0.22"/>
                <stop offset="100%" stopColor={C.gold} stopOpacity="0"/>
              </linearGradient>
            </defs>
            {ticks.map(t => (
              <g key={t}>
                <line x1={PAD.gauche} x2={w - PAD.droite} y1={py(t)} y2={py(t)} stroke={C.border} strokeWidth="1"/>
                <text x={PAD.gauche - 8} y={py(t) + 4} textAnchor="end" fontSize="12" fill={C.t3} style={{ fontVariantNumeric: "tabular-nums" }}>{nombre(t)}</text>
              </g>
            ))}
            {indicesX.map(i => (
              <text key={i} x={px(i)} y={hauteur - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="12" fill={C.t3}>{dateCourte(data[i].date)}</text>
            ))}
            {!masquees.includes("vues") && data.length > 1 && (
              <path d={`${cheminLisse(data.map((d, i) => [px(i), py(d.vues)]))} L${px(data.length - 1)},${py(0)} L${px(0)},${py(0)} Z`} fill={`url(#${gradId})`}/>
            )}
            {[...series].reverse().filter(sr => !masquees.includes(sr.key)).map(sr => (
              data.length > 1
                ? <path key={sr.key} d={cheminLisse(data.map((d, i) => [px(i), py(d[sr.key])]))} fill="none" stroke={sr.couleur} strokeWidth={sr.key === "vues" ? 2 : 1.75} strokeLinecap="round" strokeLinejoin="round"/>
                : <circle key={sr.key} cx={px(0)} cy={py(data[0][sr.key])} r="3" fill={sr.couleur}/>
            ))}
            {survol !== null && (
              <g>
                <line x1={px(survol)} x2={px(survol)} y1={PAD.haut} y2={PAD.haut + zoneH} stroke={C.border2} strokeWidth="1" strokeDasharray="3 3"/>
                {series.filter(sr => !masquees.includes(sr.key)).map(sr => (
                  <circle key={sr.key} cx={px(survol)} cy={py(data[survol][sr.key])} r="4" fill={C.bgCard} stroke={sr.couleur} strokeWidth="2"/>
                ))}
              </g>
            )}
            <rect x={PAD.gauche} y={PAD.haut} width={zoneW} height={zoneH} fill="transparent" onPointerMove={surPointeur} onPointerDown={surPointeur} onPointerLeave={() => setSurvol(null)}/>
          </svg>
          {survol !== null && (
            <div role="presentation" style={{
              position: "absolute", top: "8px", pointerEvents: "none", minWidth: "150px",
              left: Math.min(Math.max(px(survol) + 12, 0), Math.max(0, w - 170)),
              backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
            }}>
              <div style={{ color: C.t3, fontSize: "12px", marginBottom: "6px" }}>{dateLongue(data[survol].date)}</div>
              {series.filter(sr => !masquees.includes(sr.key)).map(sr => (
                <div key={sr.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: C.t1, lineHeight: 1.7 }}>
                  <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: sr.couleur }}/>
                  <span style={{ flex: 1 }}>{sr.label}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{nombre(data[survol][sr.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
