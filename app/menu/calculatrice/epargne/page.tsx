"use client";

import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { SCENARIOS_EPARGNE, totalEpargne, formatGNF, type FrequenceEpargne } from "@/lib/calculateurs";

// Simulateur d'épargne — chantier "Vos outils financiers" du 25/07/2026.
// Pas de taux générique inventé pour "l'épargne en Guinée" : 3 scénarios
// réels et sourcés (tontine sans intérêt, OMIG Tik Tak 3%/an, IMF type
// BSIC 4-4,5%/an) — voir lib/calculateurs.ts.
const RANGE_CSS = `
  .yelen-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:4px;background:var(--track);outline:none}
  .yelen-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:#F5A623;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);cursor:pointer}
  .yelen-range::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#F5A623;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);cursor:pointer;border:none}
  .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
  .tap:active{opacity:0.65;transform:scale(0.97)}
  @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes resultPop{0%{transform:scale(1)}40%{transform:scale(1.04)}100%{transform:scale(1)}}
`;

export default function Page() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";

  const [scenarioId, setScenarioId] = useState<typeof SCENARIOS_EPARGNE[number]["id"]>("tontine");
  const [frequence, setFrequence] = useState<FrequenceEpargne>("hebdo");
  const [contribution, setContribution] = useState(20000);
  const [periodes, setPeriodes] = useState(24);

  const scenario = SCENARIOS_EPARGNE.find(s => s.id === scenarioId)!;
  const total = totalEpargne(contribution, scenario.tauxAnnuel, frequence, periodes);
  const totalVerse = contribution * periodes;
  const interets = total - totalVerse;
  const resultKey = `${scenarioId}-${frequence}-${contribution}-${periodes}`;

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{RANGE_CSS}</style>
      <CompteHeader titre="Simulateur d'épargne" fondNeutre retourHref="/menu/calculatrice"/>

      <div style={{ padding: "28px 20px 8px", textAlign: "center", animation: "screenIn 0.35s ease" }}>
        <div style={{ width: "88px", height: "88px", borderRadius: "50%", backgroundColor: "#FCA5A5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg viewBox="0 0 64 64" width="46" height="46">
            <ellipse cx="32" cy="36" rx="16" ry="11" fill="#fff"/>
            <circle cx="20" cy="30" r="4" fill="#fff"/>
            <circle cx="26" cy="44" r="2.4" fill="#FBBF24"/>
            <circle cx="33" cy="46" r="2.4" fill="#FBBF24"/>
          </svg>
        </div>
        <div style={{ color: t1, fontSize: "20px", fontWeight: "900", marginBottom: "6px" }}>Simulateur d'épargne</div>
        <div style={{ color: t2, fontSize: "13px" }}>Tontine, épargne mobile ou IMF — trois scénarios réels, pas un taux inventé</div>
      </div>

      <div style={{ padding: "20px 20px 0", "--track": card2 } as React.CSSProperties}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {SCENARIOS_EPARGNE.map(s => (
            <button key={s.id} onClick={() => setScenarioId(s.id)} className="tap" style={{ flex: 1, padding: "10px 8px", borderRadius: "14px", border: "none", backgroundColor: scenarioId === s.id ? "#F5A623" : card, color: scenarioId === s.id ? "#080812" : t1, fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "0 4px 16px", color: t2, fontSize: "12.5px", lineHeight: "1.5" }}>
          {scenario.description}
          {scenario.source && (
            <> — <a href={scenario.source.url} target="_blank" rel="noopener noreferrer" style={{ color: t2, textDecoration: "underline" }}>{scenario.source.label}</a></>
          )}
        </div>

        <div style={{ backgroundColor: card, borderRadius: "20px", padding: "18px" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
            <button onClick={() => setFrequence("hebdo")} className="tap" style={{ flex: 1, padding: "8px", borderRadius: "10px", border: "none", backgroundColor: frequence === "hebdo" ? card2 : "transparent", color: frequence === "hebdo" ? t1 : t3, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>Par semaine</button>
            <button onClick={() => setFrequence("mensuel")} className="tap" style={{ flex: 1, padding: "8px", borderRadius: "10px", border: "none", backgroundColor: frequence === "mensuel" ? card2 : "transparent", color: frequence === "mensuel" ? t1 : t3, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>Par mois</button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "700" }}>Montant {frequence === "hebdo" ? "par semaine" : "par mois"}</span>
            <span style={{ color: t1, fontSize: "15px", fontWeight: "800" }}>{formatGNF(contribution)}</span>
          </div>
          <input className="yelen-range" type="range" min={5000} max={200000} step={5000} value={contribution} onChange={e => setContribution(Number(e.target.value))}/>

          <div style={{ display: "flex", justifyContent: "space-between", margin: "18px 0 8px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "700" }}>Nombre de {frequence === "hebdo" ? "semaines" : "mois"}</span>
            <span style={{ color: t1, fontSize: "15px", fontWeight: "800" }}>{periodes}</span>
          </div>
          <input className="yelen-range" type="range" min={4} max={104} step={1} value={periodes} onChange={e => setPeriodes(Number(e.target.value))}/>
        </div>

        <div key={resultKey} style={{ marginTop: "16px", backgroundColor: card, borderRadius: "20px", padding: "22px", textAlign: "center", animation: "resultPop 0.3s ease" }}>
          <div style={{ color: t2, fontSize: "12.5px", fontWeight: "700", marginBottom: "6px" }}>Épargne totale estimée</div>
          <div style={{ color: t1, fontSize: "30px", fontWeight: "900", marginBottom: "18px" }}>{formatGNF(total)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", backgroundColor: card2, borderRadius: "12px", marginBottom: "8px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "600" }}>Total versé</span>
            <span style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{formatGNF(totalVerse)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", backgroundColor: card2, borderRadius: "12px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "600" }}>Intérêts estimés</span>
            <span style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{formatGNF(interets)}</span>
          </div>
        </div>

        <div style={{ marginTop: "16px", padding: "16px 4px 32px", color: t3, fontSize: "12px", lineHeight: "1.6" }}>
          Une tontine n'offre pas d'intérêt (0%) — le fonds tourne simplement entre les membres. Les scénarios OMIG et IMF utilisent les taux réellement publiés par ces produits, pas une moyenne nationale supposée.
        </div>
      </div>
    </div>
  );
}
