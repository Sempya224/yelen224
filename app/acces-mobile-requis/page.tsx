"use client";

// Mur mobile-only citoyen (mission séparation Citizen/Web, 12/08/2026,
// décision CEO) — atteint uniquement via un rewrite serveur depuis
// middleware.ts (lib/deviceAccess.ts fait le vrai contrôle par
// User-Agent, jamais cet écran). Miroir volontaire de
// app/region-non-disponible/page.tsx (même discipline : cet écran
// explique la situation, il ne décide jamais lui-même de l'autorisation).
//
// Illustration ajoutée à gauche (retour Bryan 07/09/2026, "space PC") — ce
// mur n'est JAMAIS vu depuis un vrai mobile (seuls les visiteurs desktop y
// sont redirigés), d'où la mise en page 2 colonnes dès le chargement plutôt
// qu'un simple mobile-first empilé.
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

export default function AccesMobileRequisPage() {
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <div className="amr-layout">
        <div style={{ width: "100%", maxWidth: 360, borderRadius: 24, overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
          <Image src="/illustrations/acces-mobile-requis.png" alt="Yelen224 sur mobile ou tablette" width={700} height={620} style={{ width: "100%", height: "auto", display: "block" }} priority/>
        </div>
        <div className="amr-content" style={{ width: "100%", maxWidth: 420 }}>
          <h1 style={{ color: C.text, fontSize: "22px", fontWeight: "900", margin: "0 0 12px", letterSpacing: "-0.4px", lineHeight: 1.3 }}>
            Yelen224 est fait pour votre téléphone.
          </h1>
          <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 6px" }}>
            L&apos;espace citoyen n&apos;est accessible que depuis un mobile ou une tablette.
          </p>
          <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 28px" }}>
            Ouvrez ce lien depuis votre téléphone pour continuer.
          </p>

          <div style={{ padding: "18px", borderRadius: "16px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(8,8,18,0.03)", border: `1px solid ${C.border}` }}>
            <p style={{ color: C.textSubtle, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 12px" }}>
              Vous représentez une institution ou un établissement ?
            </p>
            <Link
              href="/institution/connexion"
              className="tap"
              style={{ display: "block", width: "100%", padding: "14px", borderRadius: "14px", background: "#F5A623", color: "#080812", fontSize: "14px", fontWeight: "800", textDecoration: "none", boxSizing: "border-box" }}
            >
              Accéder à l&apos;espace professionnel →
            </Link>
          </div>

          <div className="amr-flagrow" style={{ marginTop: "32px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex" }}>
              <div style={{ width: "16px", height: "11px", background: "#CE1126", borderRadius: "2px 0 0 2px" }} />
              <div style={{ width: "16px", height: "11px", background: "#FCD20F" }} />
              <div style={{ width: "16px", height: "11px", background: "#009A44", borderRadius: "0 2px 2px 0" }} />
              <span style={{ color: C.textSubtle, fontSize: "10px", marginLeft: "8px", fontWeight: "600", alignSelf: "center" }}>Yelen224</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .tap{transition:opacity .1s,transform .1s}
        .tap:active{opacity:.7;transform:scale(.98)}
        .amr-layout{display:flex;flex-direction:column;align-items:center;gap:32px;max-width:420px}
        .amr-content{text-align:center}
        .amr-flagrow{align-items:center}
        @media (min-width:860px){
          .amr-layout{flex-direction:row;align-items:center;gap:56px;max-width:900px}
          .amr-content{text-align:left}
          .amr-flagrow{align-items:flex-start}
        }
      `}</style>
    </div>
  );
}
