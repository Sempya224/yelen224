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
//
// Mise en page 2 colonnes sur PC (retour Bryan 07/09/2026, même patron que
// app/acces-mobile-requis/page.tsx) — contrairement à ce mur-là, cet écran
// 404 reste atteignable depuis un vrai mobile (URL mal tapée), donc reste
// empilé en dessous de 860px plutôt que 2 colonnes forcées. Illustration
// recadrée sur le personnage uniquement (texte "404"/bouton d'origine de
// l'image retiré) pour ne pas dupliquer les vrais liens ci-dessous.
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

export default function NotFound() {
  const { theme } = useTheme();
  const C = T[theme];

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <div className="nf-layout">
        <div style={{ width: "100%", maxWidth: 360, borderRadius: 24, overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
          <Image src="/illustrations/404-yelen.png" alt="Erreur 404 — cette page n'existe pas" width={960} height={879} style={{ width: "100%", height: "auto", display: "block" }} priority/>
        </div>
        <div className="nf-content" style={{ width: "100%", maxWidth: 420 }}>
          <p style={{ color: "#F5A623", fontSize: "11px", fontWeight: "800", letterSpacing: "0.4px", margin: "0 0 10px" }}>
            ERREUR 404 · PAGE INTROUVABLE
          </p>
          <h1 style={{ color: C.text, fontSize: "22px", fontWeight: "900", margin: "0 0 12px", letterSpacing: "-0.4px", lineHeight: 1.3 }}>
            Cette page n&apos;existe pas
          </h1>
          <p style={{ color: C.textSubtle, fontSize: "14px", lineHeight: 1.7, margin: "0 0 28px" }}>
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

          <div className="nf-flagrow" style={{ marginTop: "32px", display: "flex", flexDirection: "column", gap: "8px" }}>
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
        .nf-layout{display:flex;flex-direction:column;align-items:center;gap:32px;max-width:420px}
        .nf-content{text-align:center}
        .nf-flagrow{align-items:center}
        @media (min-width:860px){
          .nf-layout{flex-direction:row;align-items:center;gap:56px;max-width:900px}
          .nf-content{text-align:left}
          .nf-flagrow{align-items:flex-start}
        }
      `}</style>
    </div>
  );
}
