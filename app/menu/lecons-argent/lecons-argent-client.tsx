"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { CATEGORIES, LECONS, type LeconCategorieId } from "@/lib/leconsArgent";

// Illustrations de bannière par catégorie — deux tons, pleine largeur,
// même logique "sur mesure" que les badges du menu (components/
// CitoyenMenu.tsx), pas un stock photo. Une seule illustration par
// catégorie pour l'instant (une leçon par catégorie au lancement) ;
// l'architecture supporte déjà plusieurs leçons par catégorie.
const Banniere: Record<LeconCategorieId, () => React.ReactNode> = {
  epargne: () => (
    <svg viewBox="0 0 320 140" width="100%" height="140" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="140" fill="#DCFCE7"/>
      <circle cx="160" cy="70" r="38" fill="#16A34A"/>
      <circle cx="110" cy="55" r="16" fill="#22C55E"/>
      <circle cx="210" cy="55" r="16" fill="#22C55E"/>
      <circle cx="110" cy="95" r="16" fill="#22C55E"/>
      <circle cx="210" cy="95" r="16" fill="#22C55E"/>
      <text x="160" y="77" fontSize="20" fontWeight="800" fill="#fff" textAnchor="middle">GNF</text>
    </svg>
  ),
  mobile_money: () => (
    <svg viewBox="0 0 320 140" width="100%" height="140" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="140" fill="#E0E7FF"/>
      <rect x="130" y="30" width="60" height="90" rx="10" fill="#4F46E5"/>
      <rect x="140" y="42" width="40" height="60" rx="3" fill="#C7D2FE"/>
      <circle cx="230" cy="60" r="20" fill="#F5A623"/>
      <path d="M225 60l4 4 8-8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M195 55c10-4 20-4 28 0" stroke="#4F46E5" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  credit: () => (
    <svg viewBox="0 0 320 140" width="100%" height="140" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="140" fill="#FEF3C7"/>
      <rect x="110" y="70" width="18" height="35" rx="2" fill="#E8960A"/>
      <rect x="135" y="55" width="18" height="50" rx="2" fill="#F5A623"/>
      <rect x="160" y="40" width="18" height="65" rx="2" fill="#C8740A"/>
      <path d="M185 75c8 8 18 12 30 6" stroke="#080812" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <circle cx="220" cy="75" r="3" fill="#080812"/>
    </svg>
  ),
  revenus: () => (
    <svg viewBox="0 0 320 140" width="100%" height="140" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="140" fill="#D1FAE5"/>
      <path d="M160 100V60" stroke="#15803D" strokeWidth="6" strokeLinecap="round"/>
      <path d="M160 60c-14 0-22-10-22-10s6 16 22 16 22-16 22-16-8 10-22 10z" fill="#16A34A"/>
      <ellipse cx="160" cy="106" rx="45" ry="8" fill="#16A34A" opacity="0.35"/>
    </svg>
  ),
  budget: () => (
    <svg viewBox="0 0 320 140" width="100%" height="140" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="140" fill="#EDE9FE"/>
      <rect x="130" y="35" width="60" height="75" rx="8" fill="#7C3AED"/>
      <line x1="140" y1="55" x2="180" y2="55" stroke="#EDE9FE" strokeWidth="4" strokeLinecap="round"/>
      <line x1="140" y1="68" x2="170" y2="68" stroke="#EDE9FE" strokeWidth="4" strokeLinecap="round"/>
      <line x1="140" y1="81" x2="175" y2="81" stroke="#EDE9FE" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="205" cy="95" r="14" fill="#A78BFA"/>
    </svg>
  ),
  fraudes: () => (
    <svg viewBox="0 0 320 140" width="100%" height="140" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="140" fill="#FFE4E6"/>
      <path d="M160 32l38 14v28c0 26-16 40-38 46-22-6-38-20-38-46V46z" fill="#E11D48"/>
      <line x1="160" y1="58" x2="160" y2="86" stroke="#fff" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="160" cy="97" r="3.4" fill="#fff"/>
    </svg>
  ),
};

const Ic = {
  Chev: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Play: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
};

export function LeconsArgentClient() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [filtre, setFiltre] = useState<LeconCategorieId | "toutes">("toutes");
  const lecons = filtre === "toutes" ? LECONS : LECONS.filter(l => l.categorie === filtre);

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      <CompteHeader titre="Leçons d'argent" fondNeutre retourHref="/?menu=1"/>

      <div style={{ padding: "14px 0 4px" }}>
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", padding: "0 16px" }}>
          <button onClick={() => setFiltre("toutes")} className="tap" style={{ flexShrink: 0, padding: "8px 16px", borderRadius: "20px", border: filtre === "toutes" ? "none" : `1px solid ${brd}`, background: filtre === "toutes" ? "#F5A623" : card, color: filtre === "toutes" ? "#080812" : t1, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Toutes</button>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setFiltre(c.id)} className="tap" style={{ flexShrink: 0, padding: "8px 16px", borderRadius: "20px", border: filtre === c.id ? "none" : `1px solid ${brd}`, background: filtre === c.id ? "#F5A623" : card, color: filtre === c.id ? "#080812" : t1, fontSize: "13px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px 40px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {lecons.map(lecon => (
          <Link key={lecon.id} href={`/menu/lecons-argent/${lecon.id}`} className="tap" style={{ display: "block", backgroundColor: card, borderRadius: "18px", overflow: "hidden", textDecoration: "none" }}>
            {Banniere[lecon.categorie]()}
            <div style={{ padding: "16px" }}>
              <div style={{ color: t1, fontSize: "16px", fontWeight: "800", marginBottom: "6px" }}>{lecon.titre}</div>
              <div style={{ color: t2, fontSize: "13.5px", lineHeight: "1.5", marginBottom: "14px" }}>{lecon.resume}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: t2, fontSize: "12px", fontWeight: "600" }}>{lecon.questions.length} questions</span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "20px", backgroundColor: card2, color: t1, fontSize: "13px", fontWeight: "700" }}>
                  {Ic.Play()} Commencer
                </span>
              </div>
            </div>
          </Link>
        ))}
        {lecons.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: t2, fontSize: "14px", fontWeight: "600" }}>Aucune leçon dans cette catégorie pour l&apos;instant.</div>
        )}
      </div>
    </div>
  );
}
