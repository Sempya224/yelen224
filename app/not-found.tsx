"use client";

// Écran 404 Yelen (décision CEO 13/08/2026) — un seul écran neutre, unique
// et global pour tout le domaine (pas de version scopée par admin/
// institution, choix explicite de Bryan face aux alternatives présentées).
// Convention Next.js App Router native : ce fichier est automatiquement
// rendu par Next.js pour toute route non matchée, sans configuration
// Netlify (_redirects/netlify.toml) — ce n'est pas une SPA classique, voir
// le plan de ce chantier pour le détail de l'audit routing. Même patron
// que app/region-non-disponible/page.tsx (thème lib/theme.ts, bouton doré
// plat, icône SVG maison) pour rester cohérent avec l'unique autre écran
// "plein écran hors dashboard" déjà construit dans le projet.
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

export default function NotFound() {
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "420px", textAlign: "center" }}>
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ margin: "0 auto 28px" }}>
          <circle cx="60" cy="60" r="58" fill={isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.07)"} />
          {/* Chemin en pointillés qui s'interrompt — la route suivie ne mène nulle part */}
          <path d="M20 78c10-4 20-4 28-10s10-16 20-20 22-2 30 2" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" opacity="0.55" fill="none" />
          {/* Loupe — recherche restée sans résultat */}
          <circle cx="50" cy="48" r="21" stroke="#F5A623" strokeWidth="3" fill={isDark ? "#1C1C1E" : "#fff"} />
          <line x1="65" y1="63" x2="84" y2="82" stroke="#F5A623" strokeWidth="6" strokeLinecap="round" />
          <line x1="42" y1="48" x2="58" y2="48" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        </svg>

        <p style={{ color: "#F5A623", fontSize: "11px", fontWeight: "800", letterSpacing: "0.4px", margin: "0 0 10px" }}>
          ERREUR 404 · PAGE INTROUVABLE
        </p>
        <h1 style={{ color: C.text, fontSize: "21px", fontWeight: "900", margin: "0 0 12px", letterSpacing: "-0.4px", lineHeight: 1.3 }}>
          Cette page n&apos;existe pas
        </h1>
        <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 32px" }}>
          La page que vous recherchez est peut-être introuvable, a été déplacée ou l&apos;adresse saisie est incorrecte.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Link
            href="/"
            className="tap"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              width: "100%", padding: "15px", borderRadius: "16px", border: "none",
              background: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800",
              textDecoration: "none", boxSizing: "border-box",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Retour à l&apos;accueil
          </Link>

          <Link
            href="/recherche"
            className="tap"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              width: "100%", padding: "15px", borderRadius: "16px",
              border: `1px solid ${C.border}`, background: "transparent", color: C.text,
              fontSize: "14.5px", fontWeight: "800", textDecoration: "none", boxSizing: "border-box",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            Rechercher sur Yelen
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
