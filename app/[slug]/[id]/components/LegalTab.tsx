"use client";

// Écran dédié "Légal" — extrait du bloc "Support & Légal" de page.tsx
// (chantier éclatement de Paramètres, 14/09/2026). Purement des liens
// internes, aucune donnée à charger.
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens } from "../theme";
import { Card } from "@/components/ui/Card";

type LegalLink = { label: string; href: string; color: string };

export function LegalTab() {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const links: LegalLink[] = [
    { label: "Conditions d'utilisation",     href: "/cgu",            color: C.t2 },
    { label: "Politique de confidentialité", href: "/confidentialite", color: C.t2 },
  ];

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "16px" }}>Légal</h1>
        <Card tokens={toCardTokens(C)} noPadding>
          {links.map((item, i) => (
            <a key={item.label} href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderBottom: i < links.length - 1 ? `1px solid ${C.border}` : "none", textDecoration: "none", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }}/>
              <span style={{ flex: 1, color: C.t1, fontSize: "13px", fontWeight: "600" }}>{item.label}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          ))}
        </Card>
      </div>
    </div>
  );
}
