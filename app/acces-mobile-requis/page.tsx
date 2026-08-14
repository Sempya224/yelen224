"use client";

// Mur mobile-only citoyen (mission séparation Citizen/Web, 12/08/2026,
// décision CEO) — atteint uniquement via un rewrite serveur depuis
// middleware.ts (lib/deviceAccess.ts fait le vrai contrôle par
// User-Agent, jamais cet écran). Miroir volontaire de
// app/region-non-disponible/page.tsx (même discipline : cet écran
// explique la situation, il ne décide jamais lui-même de l'autorisation).
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

export default function AccesMobileRequisPage() {
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "420px", textAlign: "center" }}>
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ margin: "0 auto 28px" }}>
          <circle cx="60" cy="60" r="58" fill={isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.07)"} />
          <rect x="40" y="22" width="40" height="76" rx="8" stroke="#F5A623" strokeWidth="2.5" fill={isDark ? "#1C1C1E" : "#fff"} />
          <rect x="45" y="30" width="30" height="52" rx="2" fill={isDark ? "rgba(245,166,35,0.12)" : "rgba(245,166,35,0.08)"} />
          <circle cx="60" cy="90" r="3.5" fill="#F5A623" />
          <path d="M20 60c0-6 4-10 9-10M100 60c0-6-4-10-9-10" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
        </svg>

        <h1 style={{ color: C.text, fontSize: "21px", fontWeight: "900", margin: "0 0 12px", letterSpacing: "-0.4px", lineHeight: 1.3 }}>
          Yelen224 est fait pour votre téléphone.
        </h1>
        <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 6px" }}>
          L&apos;espace citoyen n&apos;est accessible que depuis un mobile ou une tablette.
        </p>
        <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 32px" }}>
          Ouvrez ce lien depuis votre téléphone pour continuer.
        </p>

        <div style={{ padding: "18px", borderRadius: "16px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(8,8,18,0.03)", border: `1px solid ${C.border}` }}>
          <p style={{ color: C.textSubtle, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 12px" }}>
            Vous représentez une institution ou un établissement ?
          </p>
          <Link
            href="/institution/connexion"
            className="tap"
            style={{ display: "block", width: "100%", padding: "14px", borderRadius: "14px", background: "#F5A623", color: "#080812", fontSize: "14px", fontWeight: "800", textDecoration: "none" }}
          >
            Accéder à l&apos;espace professionnel →
          </Link>
        </div>

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
