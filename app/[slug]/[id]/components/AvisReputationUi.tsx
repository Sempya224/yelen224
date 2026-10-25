"use client";

// Briques présentationnelles de l'écran "Santé du compte" (refonte UI
// 20/10/2026, références Stripe Radar / Trustpilot Business / Cloudflare).
// Aucune requête ni calcul de score ici : AvisReputationTab.tsx garde tout
// l'état, les handlers et la logique, et passe des props prêtes à afficher.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { classifierAvis } from "@/lib/reputationScore";
import { type ThemeTokens, toUiTokens } from "../theme";

const ETOILE = "#F59E0B";

// ── Formatage d'affichage ────────────────────────────────────────────────
export function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
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
export function nomPropre(nom: string): string {
  return nom.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

export function HealthStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .hlx-page{max-width:1280px;margin:0 auto;padding:24px 24px 48px}
      @media(min-width:1024px){.hlx-page{padding:28px 32px 48px}}
      .hlx-score{display:grid;grid-template-columns:1fr;gap:0}
      @media(min-width:768px){.hlx-score{grid-template-columns:280px 1fr}}
      .hlx-score-left{padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-bottom:1px solid ${C.border}}
      @media(min-width:768px){.hlx-score-left{border-bottom:0;border-right:1px solid ${C.border}}}
      .hlx-comps{display:grid;grid-template-columns:1fr;gap:16px}
      @media(min-width:640px){.hlx-comps{grid-template-columns:repeat(2,1fr)}}
      @media(min-width:1280px){.hlx-comps{grid-template-columns:repeat(4,1fr)}}
      .hlx-sum{display:grid;grid-template-columns:1fr;gap:0}
      @media(min-width:900px){.hlx-sum{grid-template-columns:1fr 1fr}}
      .hlx-sum-left{padding:20px;border-bottom:1px solid ${C.border}}
      @media(min-width:900px){.hlx-sum-left{border-bottom:0;border-right:1px solid ${C.border}}}
      .hlx-kpi3{display:grid;grid-template-columns:repeat(3,1fr)}
      .hlx-kpi3>div+div{border-left:1px solid ${C.border}}
      .hlx-btn:focus-visible,.hlx-card:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .hlx-card:hover{border-color:${C.border2}!important}
      .hlx-skel{background:${C.bg3};border-radius:6px;animation:hlxPulse 1.4s ease-in-out infinite}
      @keyframes hlxPulse{0%,100%{opacity:1}50%{opacity:.5}}
      .hlx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      .hlx-clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
      @media(prefers-reduced-motion:reduce){.hlx-skel{animation:none}.hlx-btn{transition:none!important}}
    `}</style>
  );
}

// ── En-tête et onglets ───────────────────────────────────────────────────
export function HealthHeader({ C, actions }: { C: ThemeTokens; actions: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 16px", marginBottom: "20px" }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Santé du compte</h1>
        <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Suivez la qualité de service de votre établissement et améliorez votre réputation sur Yelen.</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>{actions}</div>
    </div>
  );
}

export type HealthTabDef = { key: string; label: string; count?: number };
export function HealthTabs({ C, tabs, active, onChange }: { C: ThemeTokens; tabs: HealthTabDef[]; active: string; onChange: (key: string) => void }) {
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
    <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: "20px", overflowX: "auto" }}>
      <div role="tablist" aria-label="Sections de Santé du compte" style={{ display: "flex", gap: "4px" }}>
        {tabs.map((t, i) => {
          const on = t.key === active;
          return (
            <button key={t.key} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={`hlx-tab-${t.key}`} aria-selected={on} aria-controls={`hlx-panel-${t.key}`}
              tabIndex={on ? 0 : -1} onClick={() => onChange(t.key)} onKeyDown={e => onKey(e, i)} className="hlx-btn tap"
              style={{ height: "40px", padding: "0 12px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, marginBottom: "-1px", color: on ? C.t1 : C.t2, fontSize: "14px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {t.label}
              {t.count !== undefined && <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>}
            </button>
          );
        })}
      </div>
      <span aria-live="polite" className="hlx-sr">{`Section ${tabs.find(t => t.key === active)?.label ?? ""}`}</span>
    </div>
  );
}

// ── Carte de synthèse du score ───────────────────────────────────────────
const cardStyle = (C: ThemeTokens): React.CSSProperties => ({ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px" });

function ScoreGauge({ C, score, color, niveauLabel }: { C: ThemeTokens; score: number; color: string; niveauLabel: string }) {
  const size = 150, stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div role="img" aria-label={`Score ${score} sur 100, niveau ${niveauLabel}`} style={{ position: "relative", width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.bg3} strokeWidth={stroke}/>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: C.t1, fontSize: "40px", fontWeight: 600, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{score}</span>
        <span style={{ color: C.t3, fontSize: "13px", marginTop: "2px" }}>/ 100</span>
      </div>
    </div>
  );
}

export type ScoreComposante = { label: string; poids: string; valeur: number; desc: string };
export function ScoreSummary({ C, score, color, niveauLabel, phrase, composantes, prochain }: {
  C: ThemeTokens; score: number; color: string; niveauLabel: string; phrase: string;
  composantes: ScoreComposante[] | null; prochain: { label: string; points: number } | null;
}) {
  return (
    <div className="hlx-score" style={{ ...cardStyle(C), marginBottom: "20px", overflow: "hidden" }}>
      <div className="hlx-score-left">
        <ScoreGauge C={C} score={score} color={color} niveauLabel={niveauLabel}/>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 10px", borderRadius: "13px", backgroundColor: `${color}1f`, color, fontSize: "14px", fontWeight: 600, marginTop: "14px" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/></svg>
          {niveauLabel}
        </span>
        <span style={{ color: C.t2, fontSize: "13px", marginTop: "6px" }}>{phrase}</span>
        {prochain && <span style={{ color: C.t3, fontSize: "12px", marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>{prochain.points} point{prochain.points > 1 ? "s" : ""} pour atteindre {prochain.label}</span>}
      </div>
      <div style={{ padding: "20px 24px" }}>
        <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 2px" }}>Comment le score est calculé</h2>
        <p style={{ color: C.t3, fontSize: "12px", margin: "0 0 16px" }}>Calculé sur vos 30 derniers avis reçus.</p>
        <div className="hlx-comps">
          {(composantes ?? []).map(c => (
            <div key={c.label} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span title={c.label} style={{ color: C.t1, fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                <span style={{ flexShrink: 0, fontSize: "12px", fontWeight: 600, color: C.t2, backgroundColor: C.bg3, borderRadius: "5px", padding: "1px 6px", fontVariantNumeric: "tabular-nums" }}>{c.poids}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "8px 0 6px" }}>
                <div role="img" aria-label={`${c.label} : ${Math.round(c.valeur)} sur 100`} style={{ flex: 1, height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, c.valeur))}%`, height: "100%", backgroundColor: C.gold, borderRadius: "3px" }}/>
                </div>
                <span style={{ color: C.t1, fontSize: "13px", fontWeight: 600, width: "28px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(c.valeur)}</span>
              </div>
              <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.45, margin: 0 }}>{c.desc}</p>
            </div>
          ))}
        </div>
        <p style={{ color: C.t3, fontSize: "12px", lineHeight: 1.5, margin: "16px 0 0" }}>
          Aucune fermeture automatique de compte n&apos;est liée à ce score : une baisse marquée déclenche un signalement, mais la décision reste toujours humaine, examinée par l&apos;équipe Yelen.
        </p>
      </div>
    </div>
  );
}

// ── Évolution ────────────────────────────────────────────────────────────
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

export type EvolutionPoint = { date: string; score: number; nbAvis: number };
export function ScoreTrendChart({ C, evolution, color }: { C: ThemeTokens; evolution: EvolutionPoint[]; color: string }) {
  const gid = useId().replace(/:/g, "");
  const [survol, setSurvol] = useState<number | null>(null);
  const n = evolution.length;
  const W = 800, H = 260, PL = 36, PR = 16, PT = 14, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const x = (i: number) => PL + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const y = (v: number) => PT + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const pts: [number, number][] = evolution.map((d, i) => [x(i), y(d.score)]);
  const scores = evolution.map(d => d.score);
  const dernier = n > 0 ? scores[n - 1] : 0;
  const delta = n > 0 ? dernier - scores[0] : 0;
  const max = n > 0 ? Math.max(...scores) : 0;
  const min = n > 0 ? Math.min(...scores) : 0;
  const moyenne = n > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / n) : 0;
  const plat = n > 1 && max === min;
  const labelIdx = n <= 1 ? [] : [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || n < 2) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setSurvol(Math.min(n - 1, Math.max(0, Math.round(((px - PL) / iw) * (n - 1)))));
  }

  const entete = (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 16px", marginBottom: "14px" }}>
      <div>
        <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>Évolution</h2>
        <span style={{ color: C.t2, fontSize: "13px" }}>{n > 0 ? `Score sur les ${n} derniers jours` : "Score sur les 30 derniers jours"}</span>
      </div>
      {n > 1 && (
        <span style={{ color: delta > 0 ? C.green : delta < 0 ? C.red : C.t3, fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(delta)} {Math.abs(delta) === 1 ? "pt" : "pts"} vs il y a {n} jours
        </span>
      )}
    </div>
  );

  if (n < 2) {
    return (
      <div style={{ ...cardStyle(C), padding: "20px", marginBottom: "20px" }}>
        {entete}
        <div style={{ height: "160px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: C.t2, fontSize: "13px", textAlign: "center" }}>
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Pas encore assez de données pour afficher une évolution.
        </div>
      </div>
    );
  }

  const s = survol !== null ? evolution[survol] : null;
  return (
    <div style={{ ...cardStyle(C), padding: "20px", marginBottom: "20px" }}>
      {entete}
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Évolution du score sur ${n} jours : de ${scores[0]} à ${dernier}`} style={{ width: "100%", height: "auto", maxHeight: "280px", display: "block" }}
          onMouseMove={onMove} onMouseLeave={() => setSurvol(null)}>
          <defs>
            <linearGradient id={`hlx-g-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map(t => (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={C.border} strokeWidth="1"/>
              <text x={PL - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill={C.t3}>{t}</text>
            </g>
          ))}
          {labelIdx.map(i => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="12" fill={C.t3}>{dateCourte(evolution[i].date)}</text>
          ))}
          <path d={`${smoothPath(pts)} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill={`url(#hlx-g-${gid})`}/>
          <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx={x(n - 1)} cy={y(dernier)} r="4.5" fill={C.bgCard} stroke={color} strokeWidth="2.2"/>
          <text x={x(n - 1)} y={y(dernier) - 10} textAnchor="end" fontSize="13" fontWeight="600" fill={C.t1}>{dernier}</text>
          {survol !== null && (
            <g>
              <line x1={x(survol)} x2={x(survol)} y1={PT} y2={H - PB} stroke={C.border2} strokeWidth="1"/>
              <circle cx={x(survol)} cy={y(evolution[survol].score)} r="4" fill={C.bgCard} stroke={color} strokeWidth="2"/>
            </g>
          )}
        </svg>
        {s && survol !== null && (
          <div style={{ position: "absolute", top: 8, left: `${Math.min(76, Math.max(2, (x(survol) / W) * 100 + 2))}%`, pointerEvents: "none", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 10px", fontSize: "12px", color: C.t2, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", whiteSpace: "nowrap" }}>
            <div style={{ color: C.t1, fontWeight: 600, marginBottom: "2px" }}>{dateLongue(s.date)}</div>
            Score <strong style={{ color: C.t1 }}>{s.score}</strong> · {s.nbAvis} avis reçu{s.nbAvis > 1 ? "s" : ""}
          </div>
        )}
      </div>
      {plat && <p style={{ color: C.t2, fontSize: "13px", margin: "10px 0 0" }}>Score stable sur la période.</p>}
      <div className="hlx-kpi3" style={{ marginTop: "14px", border: `1px solid ${C.border}`, borderRadius: "10px" }}>
        {[{ label: "Plus haut", v: max }, { label: "Plus bas", v: min }, { label: "Moyenne", v: moyenne }].map(k => (
          <div key={k.label} style={{ padding: "10px 14px" }}>
            <div style={{ color: C.t2, fontSize: "13px" }}>{k.label}</div>
            <div style={{ color: C.t1, fontSize: "20px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{k.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Résumé des avis ──────────────────────────────────────────────────────
export function ReviewsSummary({ C, moisLabel, mois, distribution }: {
  C: ThemeTokens; moisLabel: string;
  mois: { positifs: number; negatifs: number; sansCommentaire: number; total: number };
  distribution: Record<"5" | "4" | "3" | "2" | "1", number>;
}) {
  const total = (["5", "4", "3", "2", "1"] as const).reduce((a, k) => a + distribution[k], 0);
  const moyenne = total > 0 ? (["5", "4", "3", "2", "1"] as const).reduce((a, k) => a + Number(k) * distribution[k], 0) / total : null;
  const kpis = [
    { label: "Positifs", v: mois.positifs, dot: C.green },
    { label: "Négatifs", v: mois.negatifs, dot: C.red },
    { label: "Sans commentaire", v: mois.sansCommentaire, dot: C.t3 },
  ];
  return (
    <div className="hlx-sum" style={{ ...cardStyle(C), marginBottom: "24px", overflow: "hidden" }}>
      <div className="hlx-sum-left">
        <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 2px" }}>Avis du mois</h2>
        <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 14px", textTransform: "capitalize" }}>{moisLabel}</p>
        <div className="hlx-kpi3">
          {kpis.map(k => (
            <div key={k.label} style={{ padding: "0 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}>
                <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: k.dot }}/>{k.label}
              </div>
              <div style={{ color: C.t1, fontSize: "24px", fontWeight: 600, fontVariantNumeric: "tabular-nums", marginTop: "4px" }}>{k.v}</div>
            </div>
          ))}
        </div>
        <p style={{ color: C.t3, fontSize: "12px", margin: "14px 0 0" }}>
          {mois.total === 0 ? "Aucun nouvel avis reçu ce mois-ci. " : ""}Total des avis : {total}
        </p>
      </div>
      <div style={{ padding: "20px" }}>
        <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 12px" }}>Répartition des notes</h2>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          {moyenne !== null && (
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ color: C.t1, fontSize: "32px", fontWeight: 600, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{moyenne.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
              <Stars note={Math.round(moyenne)} size={13}/>
            </div>
          )}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
            {(["5", "4", "3", "2", "1"] as const).map(k => {
              const nb = distribution[k];
              const pct = total > 0 ? Math.round((nb / total) * 100) : 0;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: C.t2, fontSize: "12px", width: "26px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>★ {k}</span>
                  <div role="img" aria-label={`${nb} avis à ${k} étoiles, ${pct} %`} style={{ flex: 1, height: "8px", borderRadius: "4px", backgroundColor: C.bg3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", backgroundColor: ETOILE, borderRadius: "4px" }}/>
                  </div>
                  <span style={{ color: C.t2, fontSize: "12px", width: "58px", textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{nb} · {pct} %</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Stars({ note, size = 16 }: { note: number; size?: number }) {
  return (
    <span role="img" aria-label={`${note} sur 5`} style={{ display: "inline-flex", gap: "1px" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={i <= note ? ETOILE : "none"} stroke={ETOILE} strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
      ))}
    </span>
  );
}

// ── Barre d'outils des avis ──────────────────────────────────────────────
export function ReviewsToolbar({ C, active, q, onQ, types, typeActif, onType, services, serviceActif, onService, chips, onReset, total, filtreActif }: {
  C: ThemeTokens; active: boolean; q: string; onQ: (v: string) => void;
  types: { value: string; label: string }[]; typeActif: string; onType: (v: string) => void;
  services: string[]; serviceActif: string; onService: (v: string) => void;
  chips: { key: string; label: string; onRemove: () => void }[]; onReset: () => void; total: number; filtreActif: boolean;
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
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px" }}>
        <div style={{ position: "relative", width: "320px", maxWidth: "100%" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} className="hlx-btn" value={q} onChange={e => onQ(e.target.value)} aria-label="Rechercher dans les commentaires" placeholder="Rechercher dans les commentaires…"
            style={{ width: "100%", height: "36px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 32px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit" }}/>
          {q ? (
            <button type="button" className="hlx-btn tap" aria-label="Effacer la recherche" onClick={() => { onQ(""); inputRef.current?.focus(); }}
              style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "6px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ) : (
            <kbd aria-hidden="true" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "inherit" }}>/</kbd>
          )}
        </div>

        <div role="group" aria-label="Filtrer par type d'avis" style={{ display: "inline-flex", border: `1px solid ${C.border2}`, borderRadius: "8px", overflow: "hidden", backgroundColor: C.bgCard, maxWidth: "100%", overflowX: "auto" }}>
          {types.map((t, i) => {
            const on = t.value === typeActif;
            return (
              <button key={t.value} type="button" aria-pressed={on} onClick={() => onType(t.value)} className="hlx-btn tap"
                style={{ height: "34px", padding: "0 12px", border: "none", borderLeft: i > 0 ? `1px solid ${C.border2}` : "none", backgroundColor: on ? C.bg3 : "transparent", color: on ? C.t1 : C.t2, fontSize: "12.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {services.length > 0 && (
          <select aria-label="Filtrer par service" value={serviceActif} onChange={e => onService(e.target.value)} className="hlx-btn"
            style={{ height: "36px", maxWidth: "240px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 10px", color: C.t1, fontSize: "13px", fontFamily: "inherit" }}>
            <option value="tous">Tous les services</option>
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {filtreActif && <button type="button" className="hlx-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>}
        <span aria-live="polite" style={{ marginLeft: "auto", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{total} avis</span>
      </div>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
          {chips.map(c => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "24px", padding: "0 4px 0 9px", borderRadius: "6px", backgroundColor: C.bg3, color: C.t1, fontSize: "12px", maxWidth: "100%" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
              <button type="button" className="hlx-btn tap" aria-label={`Retirer le filtre ${c.label}`} onClick={c.onRemove}
                style={{ width: "18px", height: "18px", borderRadius: "4px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carte d'avis ─────────────────────────────────────────────────────────
export type ReviewData = {
  id: string; note: number; commentaire: string | null; titre: string | null;
  reponse_institution: string | null; reponse_le: string | null; created_at: string; service: string | null; client: string;
};
export function ReviewCard({ C, avis, maintenant, readOnly, replyOpen, replyText, saving, onOpenReply, onChangeReply, onCancelReply, onSendReply }: {
  C: ThemeTokens; avis: ReviewData; maintenant: number; readOnly: boolean; replyOpen: boolean; replyText: string; saving: boolean;
  onOpenReply: () => void; onChangeReply: (v: string) => void; onCancelReply: () => void; onSendReply: () => void;
}) {
  const [etendu, setEtendu] = useState(false);
  const sentiment = classifierAvis(avis.note);
  const long = (avis.commentaire?.length ?? 0) > 240 || (avis.commentaire?.split("\n").length ?? 0) > 4;
  const ui = toUiTokens(C);
  const nom = nomPropre(avis.client);
  return (
    <article className="hlx-card" style={{ ...cardStyle(C), padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{avis.client.slice(0, 2).toUpperCase()}</span>
          <span title={nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nom}</span>
          <Stars note={avis.note}/>
          <span style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{avis.note.toLocaleString("fr-FR", { minimumFractionDigits: 1 })}</span>
        </div>
        <span title={dateLongue(avis.created_at)} style={{ color: C.t3, fontSize: "13px", whiteSpace: "nowrap" }}>{dateRelative(avis.created_at, maintenant)}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
        {avis.service && <span style={{ height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", display: "inline-flex", alignItems: "center" }}>{avis.service}</span>}
        {sentiment !== "neutre" && (
          <span style={{ height: "22px", padding: "0 8px", borderRadius: "6px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, backgroundColor: `${sentiment === "positif" ? C.green : C.red}1c`, color: sentiment === "positif" ? C.green : C.red }}>
            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "currentColor" }}/>
            {sentiment === "positif" ? "Positif" : "Négatif"}
          </span>
        )}
      </div>

      {avis.titre && <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginTop: "10px" }}>{avis.titre}</div>}
      {avis.commentaire ? (
        <>
          <p className={long && !etendu ? "hlx-clamp" : undefined} style={{ color: C.t2, fontSize: "14px", lineHeight: 1.55, margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{avis.commentaire}</p>
          {long && <button type="button" className="hlx-btn tap" aria-expanded={etendu} onClick={() => setEtendu(v => !v)} style={{ background: "none", border: "none", padding: "4px 0 0", color: C.t1, fontSize: "13px", fontWeight: 500, textDecoration: "underline", cursor: "pointer" }}>{etendu ? "Voir moins" : "Voir plus"}</button>}
        </>
      ) : (
        <p style={{ color: C.t3, fontSize: "14px", fontStyle: "italic", margin: "6px 0 0" }}>Aucun commentaire</p>
      )}

      {avis.reponse_institution ? (
        <div style={{ marginTop: "12px", marginLeft: "12px", padding: "10px 14px", backgroundColor: C.bgCard2, borderLeft: `2px solid ${C.gold}`, borderRadius: "0 8px 8px 0" }}>
          <div style={{ color: C.t3, fontSize: "12px", marginBottom: "4px" }}>Votre réponse{avis.reponse_le ? ` · ${dateLongue(avis.reponse_le)}` : ""}</div>
          <div style={{ color: C.t1, fontSize: "14px", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{avis.reponse_institution}</div>
        </div>
      ) : replyOpen ? (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <textarea value={replyText} onChange={e => onChangeReply(e.target.value)} rows={3} placeholder="Votre réponse…" aria-label="Votre réponse" className="hlx-btn"
            style={{ width: "100%", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "10px 12px", fontSize: "14px", color: C.t1, resize: "vertical", fontFamily: "inherit" }}/>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button tokens={ui} className="tap" variant="primary" size="sm" loading={saving} disabled={!replyText.trim()} onClick={onSendReply}>Envoyer</Button>
            <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onCancelReply}>Annuler</Button>
          </div>
        </div>
      ) : !readOnly && (
        <div style={{ marginTop: "12px" }}>
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onOpenReply}
            icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>}>
            Répondre
          </Button>
        </div>
      )}
    </article>
  );
}

export function ReviewsSkeleton() {
  return (
    <div role="status" aria-label="Chargement des avis" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {[0, 1, 2].map(i => <div key={i} className="hlx-skel" style={{ height: "120px", borderRadius: "12px" }}/>)}
    </div>
  );
}

export function HealthSkeleton() {
  return (
    <div role="status" aria-label="Chargement de la santé du compte">
      <div className="hlx-skel" style={{ height: "220px", borderRadius: "12px", marginBottom: "20px" }}/>
      <div className="hlx-skel" style={{ height: "300px", borderRadius: "12px" }}/>
    </div>
  );
}
