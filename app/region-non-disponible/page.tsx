"use client";

// Écran de restriction géographique de pré-lancement (mission sécurité,
// 09/08/2026, décision CEO) — atteint uniquement via un rewrite serveur
// depuis middleware.ts (jamais une redirection avec code d'erreur visible,
// jamais de détail technique sur l'infrastructure ou la raison précise du
// blocage). Le vrai contrôle d'accès vit à l'edge (middleware.ts +
// lib/geoAccess.ts) — cet écran ne fait qu'expliquer la situation, il ne
// décide jamais lui-même de l'autorisation.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

export default function RegionNonDisponiblePage() {
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";
  const [verification, setVerification] = useState(false);

  const verifierMaRegion = () => {
    // Pas de contournement côté client (brief : "ne pas permettre à
    // l'utilisateur de contourner lui-même la restriction") — ce bouton ne
    // fait que redemander la page au serveur, où middleware.ts retranche
    // la même décision. Si le visiteur a coupé son VPN entre-temps, la
    // page réelle s'affichera ; sinon cet écran se réaffiche à l'identique.
    setVerification(true);
    window.location.reload();
  };

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "420px", textAlign: "center" }}>
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ margin: "0 auto 28px" }}>
          <circle cx="60" cy="60" r="58" fill={isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.07)"} />
          <circle cx="60" cy="58" r="34" stroke="#F5A623" strokeWidth="2.5" fill="none" />
          <path d="M26 58h68M60 24c9 9 14 21 14 34s-5 25-14 34c-9-9-14-21-14-34s5-25 14-34z" stroke="#F5A623" strokeWidth="1.6" fill="none" opacity="0.55" />
          <g>
            <path d="M60 70c-9 0-17 6.5-17 13v3h34v-3c0-6.5-8-13-17-13z" fill={isDark ? "#1C1C1E" : "#fff"} stroke="#F5A623" strokeWidth="2" />
            <circle cx="60" cy="86" r="26" fill="none" stroke="#F5A623" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
          </g>
          <circle cx="60" cy="52" r="8" fill="#F5A623" />
          <path d="M52 52a8 8 0 0 1 16 0c0 5-8 14-8 14s-8-9-8-14z" fill="#F5A623" opacity="0.9" />
        </svg>

        <h1 style={{ color: C.text, fontSize: "21px", fontWeight: "900", margin: "0 0 12px", letterSpacing: "-0.4px", lineHeight: 1.3 }}>
          Yelen n&apos;est pas encore disponible dans votre région.
        </h1>
        <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 6px" }}>
          Nous préparons actuellement le déploiement de Yelen.
        </p>
        <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 6px" }}>
          Le service sera progressivement disponible dans de nouvelles régions.
        </p>
        <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 32px" }}>
          Merci de votre compréhension.
        </p>

        <button
          onClick={verifierMaRegion}
          disabled={verification}
          className="tap"
          style={{
            width: "100%", padding: "15px", borderRadius: "16px", border: "none",
            background: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800",
            cursor: verification ? "not-allowed" : "pointer", opacity: verification ? 0.7 : 1,
          }}
        >
          {verification ? "Vérification…" : "Vérifier ma région"}
        </button>

        <div style={{ marginTop: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: "16px", height: "11px", background: "#CE1126", borderRadius: "2px 0 0 2px" }} />
            <div style={{ width: "16px", height: "11px", background: "#FCD20F" }} />
            <div style={{ width: "16px", height: "11px", background: "#009A44", borderRadius: "0 2px 2px 0" }} />
            <span style={{ color: C.textSubtle, fontSize: "10px", marginLeft: "8px", fontWeight: "600", alignSelf: "center" }}>Yelen224</span>
          </div>
        </div>
      </div>
      <style>{`.tap{transition:opacity .1s,transform .1s}.tap:active{opacity:.7;transform:scale(.98)}`}</style>
    </div>
  );
}
