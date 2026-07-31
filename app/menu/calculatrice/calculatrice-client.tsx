"use client";

import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";

// "Vos outils financiers" — chantier engagement du 25/07/2026, adapté de
// la référence "Your Money Tools" (liste d'icônes colorées + titre +
// description + chevron). Seuls 2 outils ont un vrai contenu sourcé pour
// l'instant (microcrédit, épargne) — les autres sont volontairement
// affichés en "Bientôt disponible" plutôt qu'inventés (décision CEO
// 25/07/2026 : on ne construit que ce qui est vérifié). "Assurance auto"
// de la référence a été laissé de côté — aucune marketplace d'assurance
// n'existe ni n'est prévue dans Yelen, contrairement aux autres qui sont
// des concepts crédibles pour une future itération.
const Ic = {
  Chev: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
};

const Illu = {
  microcredit: () => (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="32" fill="#14B8A6"/>
      <path d="M22 20l14 4-2 18-14-4z" fill="#fff"/>
      <path d="M24 24l10 3" stroke="#14B8A6" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M40 28c4 3 5 9 3 14l-6-2c1-4 1-8-1-11z" fill="#0F766E"/>
      <circle cx="41" cy="26" r="4.5" fill="#FBBF24"/>
    </svg>
  ),
  epargne: () => (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="32" fill="#FCA5A5"/>
      <ellipse cx="32" cy="36" rx="16" ry="11" fill="#fff"/>
      <circle cx="20" cy="30" r="4" fill="#fff"/>
      <circle cx="18.5" cy="29" r="1" fill="#080812"/>
      <rect x="29" y="24" width="6" height="6" rx="1" fill="#fff" transform="rotate(20 32 27)"/>
      <circle cx="26" cy="44" r="2.4" fill="#FBBF24"/>
      <circle cx="33" cy="46" r="2.4" fill="#FBBF24"/>
    </svg>
  ),
  dettes: () => (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="32" fill="#FDE68A"/>
      <rect x="18" y="26" width="20" height="14" rx="2" fill="#fff"/>
      <path d="M38 22l8 8M46 22l-8 8" stroke="#78350F" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  ),
  investissement: () => (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="32" fill="#5EEAD4"/>
      <circle cx="22" cy="38" r="5" fill="#fff"/>
      <circle cx="22" cy="30" r="5" fill="#fff" opacity="0.7"/>
      <path d="M20 40l10-10 6 6 8-10" stroke="#0F766E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  siJavais: () => (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="32" fill="#7DD3FC"/>
      <rect x="24" y="18" width="16" height="28" rx="3" fill="#fff"/>
      <path d="M28 34l4-6 4 4 6-8" stroke="#075985" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  suiviCredit: () => (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="32" fill="#F0ABFC"/>
      <path d="M20 38a12 12 0 0 1 20-9" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <circle cx="38" cy="38" r="8" fill="none" stroke="#fff" strokeWidth="3"/>
      <line x1="44" y1="44" x2="49" y2="49" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  ),
};

const OUTILS: { id: string; titre: string; description: string; illu: () => React.ReactNode; href?: string }[] = [
  { id: "microcredit", titre: "Calculateur de microcrédit", description: "Estimez la mensualité d'un crédit dégressif façon microfinance guinéenne.", illu: Illu.microcredit, href: "/menu/calculatrice/microcredit" },
  { id: "epargne", titre: "Simulateur d'épargne", description: "Tontine, épargne mobile ou IMF — projetez une épargne programmée réelle.", illu: Illu.epargne, href: "/menu/calculatrice/epargne" },
  { id: "dettes", titre: "Consolidation de dettes", description: "Bientôt disponible.", illu: Illu.dettes },
  { id: "investissement", titre: "Croissance d'investissement", description: "Bientôt disponible.", illu: Illu.investissement },
  { id: "si-javais", titre: "« Et si j'avais investi »", description: "Bientôt disponible.", illu: Illu.siJavais },
  { id: "suivi-credit", titre: "Suivi de mon crédit", description: "Bientôt disponible.", illu: Illu.suiviCredit },
];

export function CalculatriceClient() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const card2= isDark ? "#2C2C2E" : "#EBEBF0";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        @keyframes outilIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <CompteHeader titre="Vos outils financiers" fondNeutre retourHref="/?menu=1"/>

      <div style={{ padding: "16px 16px 40px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {OUTILS.map((outil, i) => {
          const disponible = !!outil.href;
          const contenu = (
            <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", backgroundColor: card, borderRadius: "20px", opacity: disponible ? 1 : 0.55, animation: `outilIn 0.35s ease ${i * 0.05}s both` }}>
              <div style={{ flexShrink: 0 }}>{outil.illu()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "3px" }}>{outil.titre}</div>
                <div style={{ color: t2, fontSize: "12.5px", lineHeight: "1.4" }}>{outil.description}</div>
              </div>
              {disponible ? (
                <span style={{ color: t3, flexShrink: 0 }}>{Ic.Chev()}</span>
              ) : (
                <span style={{ flexShrink: 0, padding: "5px 10px", borderRadius: "12px", backgroundColor: card2, color: t3, fontSize: "10.5px", fontWeight: "800", whiteSpace: "nowrap" }}>Bientôt</span>
              )}
            </div>
          );
          return disponible
            ? <Link key={outil.id} href={outil.href!} className="tap" style={{ textDecoration: "none", display: "block" }}>{contenu}</Link>
            : <div key={outil.id}>{contenu}</div>;
        })}
      </div>
    </div>
  );
}
