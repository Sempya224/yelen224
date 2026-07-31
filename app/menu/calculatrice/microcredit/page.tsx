"use client";

import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { CREDIT, mensualiteDegressif, formatGNF } from "@/lib/calculateurs";

// Calculateur de microcrédit — chantier "Vos outils financiers" du
// 25/07/2026. Taux, durées et frais sourcés (Crédit Rural de Guinée,
// étude base.socioeco.org) — voir lib/calculateurs.ts. Formule
// d'amortissement dégressif standard (intérêts sur le capital restant
// dû), pas un taux flat.
const RANGE_CSS = `
  .yelen-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:4px;background:var(--track);outline:none}
  .yelen-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:#F5A623;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);cursor:pointer}
  .yelen-range::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#F5A623;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);cursor:pointer;border:none}
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

  const [montant, setMontant] = useState<number>(CREDIT.montantDefaut);
  const [taux, setTaux] = useState<number>(CREDIT.tauxMensuelDefaut);
  const [duree, setDuree] = useState<number>(CREDIT.dureeMoisDefaut);

  const mensualite = mensualiteDegressif(montant, taux, duree);
  const totalRembourse = mensualite * duree;
  const totalInterets = totalRembourse - montant;
  const resultKey = `${montant}-${taux}-${duree}`;

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{RANGE_CSS}</style>
      <CompteHeader titre="Calculateur de microcrédit" fondNeutre retourHref="/menu/calculatrice"/>

      <div style={{ padding: "28px 20px 8px", textAlign: "center", animation: "screenIn 0.35s ease" }}>
        <div style={{ width: "88px", height: "88px", borderRadius: "50%", backgroundColor: "#14B8A6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg viewBox="0 0 64 64" width="46" height="46">
            <path d="M22 20l14 4-2 18-14-4z" fill="#fff"/>
            <path d="M40 28c4 3 5 9 3 14l-6-2c1-4 1-8-1-11z" fill="#0F766E"/>
            <circle cx="41" cy="26" r="4.5" fill="#FBBF24"/>
          </svg>
        </div>
        <div style={{ color: t1, fontSize: "20px", fontWeight: "900", marginBottom: "6px" }}>Calculateur de microcrédit</div>
        <div style={{ color: t2, fontSize: "13px" }}>Estimez la mensualité d'un crédit dégressif, façon Crédit Rural de Guinée</div>
      </div>

      <div style={{ padding: "20px 20px 0", "--track": card2 } as React.CSSProperties}>
        <div style={{ backgroundColor: card, borderRadius: "20px", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "700" }}>Montant emprunté</span>
            <span style={{ color: t1, fontSize: "15px", fontWeight: "800" }}>{formatGNF(montant)}</span>
          </div>
          <input className="yelen-range" type="range" min={CREDIT.montantMin} max={CREDIT.montantMax} step={50000} value={montant} onChange={e => setMontant(Number(e.target.value))}/>

          <div style={{ display: "flex", justifyContent: "space-between", margin: "18px 0 8px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "700" }}>Taux mensuel (dégressif)</span>
            <span style={{ color: t1, fontSize: "15px", fontWeight: "800" }}>{(taux * 100).toFixed(2)}%</span>
          </div>
          <input className="yelen-range" type="range" min={CREDIT.tauxMensuelMin} max={CREDIT.tauxMensuelMax} step={0.0025} value={taux} onChange={e => setTaux(Number(e.target.value))}/>

          <div style={{ display: "flex", justifyContent: "space-between", margin: "18px 0 8px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "700" }}>Durée</span>
            <span style={{ color: t1, fontSize: "15px", fontWeight: "800" }}>{duree} mois</span>
          </div>
          <input className="yelen-range" type="range" min={CREDIT.dureeMoisMin} max={CREDIT.dureeMoisMax} step={1} value={duree} onChange={e => setDuree(Number(e.target.value))}/>
        </div>

        <div key={resultKey} style={{ marginTop: "16px", backgroundColor: card, borderRadius: "20px", padding: "22px", textAlign: "center", animation: "resultPop 0.3s ease" }}>
          <div style={{ color: t2, fontSize: "12.5px", fontWeight: "700", marginBottom: "6px" }}>Mensualité estimée</div>
          <div style={{ color: t1, fontSize: "30px", fontWeight: "900", marginBottom: "18px" }}>{formatGNF(mensualite)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", backgroundColor: card2, borderRadius: "12px", marginBottom: "8px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "600" }}>Total remboursé</span>
            <span style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{formatGNF(totalRembourse)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", backgroundColor: card2, borderRadius: "12px" }}>
            <span style={{ color: t2, fontSize: "13px", fontWeight: "600" }}>Total des intérêts</span>
            <span style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{formatGNF(totalInterets)}</span>
          </div>
        </div>

        <div style={{ marginTop: "16px", padding: "16px", color: t3, fontSize: "12px", lineHeight: "1.6" }}>
          Estimation basée sur un remboursement dégressif (intérêts sur le capital restant dû), comme au Crédit Rural de Guinée. Des frais additionnels peuvent s'ajouter selon l'institution — frais de dossier, épargne de garantie ou pénalités de retard — à vérifier avant signature.
          <br/><br/>
          Source : <a href={CREDIT.source.url} target="_blank" rel="noopener noreferrer" style={{ color: t3, textDecoration: "underline" }}>{CREDIT.source.label}</a>, <a href={CREDIT.sourceFrais.url} target="_blank" rel="noopener noreferrer" style={{ color: t3, textDecoration: "underline" }}>{CREDIT.sourceFrais.label}</a>.
        </div>
      </div>
    </div>
  );
}
