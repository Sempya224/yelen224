"use client";

import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { YelenLogo } from "@/components/YelenLogo";

// Écran "À propos de Yelen" (chantier Légal & Confidentialité, refonte
// 29/09/2026, retour Bryan) — remplace le CompteEcranVide générique
// ("Contenu à venir") par un vrai écran produit/institutionnel : identité
// de l'app en haut, ce que fait Yelen, puis informations pratiques
// séparées du légal (jamais mélangées, retour explicite). Même version
// affichée que app/admin/page.tsx ("v1.0.0", plateforme en Production) —
// pas une valeur inventée pour cet écran.
const APP_VERSION = "1.0.0";

const P = { pointerEvents: "none" as const };
const Ic = {
  Chev: () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Calendar: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Demarches: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>,
  Suivi: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>,
  Communaute: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z"/></svg>,
};

type Feature = { icon: React.ReactNode; label: string };
const FEATURES: Feature[] = [
  { icon: <Ic.Calendar/>,   label: "Rendez-vous" },
  { icon: <Ic.Demarches/>,  label: "Démarches" },
  { icon: <Ic.Suivi/>,      label: "Suivi" },
  { icon: <Ic.Communaute/>, label: "Communauté" },
];

type Ligne = { titre: string; href?: string; valeur?: string };

// Chaque lien pointe vers un écran réel existant — "Nouveautés" et
// "Licences" restent volontairement des stubs "Contenu à venir" (pas dans
// le périmètre de ce chantier, retour Bryan), "Nous contacter"/"Centre
// d'aide" vers les écrans déjà construits (/contact, /faq).
const INFOS: Ligne[] = [
  { titre: "Version de l'application", valeur: APP_VERSION },
  { titre: "Nouveautés",   href: "/menu/nouveautes" },
  { titre: "Nous contacter", href: "/contact" },
  { titre: "Centre d'aide", href: "/faq" },
  { titre: "Licences",     href: "/compte/licences" },
];

// Séparé volontairement des "Informations" ci-dessus (retour Bryan : ne
// jamais mélanger info produit et légal) — /legal est le Centre légal
// consolidé (CGU, confidentialité, cookies, mentions légales), voir
// lib/legalNav.ts.
const LEGAL: Ligne[] = [
  { titre: "Centre légal", href: "/legal" },
];

function sectionTitreStyle(t2: string): React.CSSProperties {
  return { color: t2, fontSize: "12px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" };
}

// Même rendu "liste groupée" que app/compte/parametres/page.tsx::LignesCarte
// — étendu ici pour accepter une ligne d'information non cliquable
// (valeur affichée à droite au lieu du chevron), cas de la version de
// l'application.
function LignesCarte({ lignes, card, brd, t1, t2, t3 }: {
  lignes: Ligne[]; card: string; brd: string; t1: string; t2: string; t3: string;
}) {
  return (
    <div style={{ backgroundColor: card, borderRadius: "14px", overflow: "hidden" }}>
      {lignes.map((l, i) => {
        const rowStyle: React.CSSProperties = {
          display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px",
          borderBottom: i < lignes.length - 1 ? `1px solid ${brd}` : "none",
          textDecoration: "none",
        };
        const contenu = (
          <>
            <div style={{ flex: 1, minWidth: 0, color: t1, fontSize: "15px", fontWeight: 600 }}>{l.titre}</div>
            {l.href ? (
              <div style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></div>
            ) : (
              <div style={{ color: t2, fontSize: "14px", fontWeight: 600, flexShrink: 0 }}>{l.valeur}</div>
            )}
          </>
        );
        return l.href ? (
          <Link key={l.titre} href={l.href} className="tap" style={rowStyle}>{contenu}</Link>
        ) : (
          <div key={l.titre} style={rowStyle}>{contenu}</div>
        );
      })}
    </div>
  );
}

export default function AProposPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <CompteHeader titre="À propos de Yelen"/>
      <main style={{ padding: "8px 16px 40px" }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: "center", padding: "28px 12px 4px" }}>
          <div style={{ width: "72px", height: "72px", borderRadius: "20px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <YelenLogo size={34} color="#1a1200" strokeWidth={2.2}/>
          </div>
          <div style={{ color: t1, fontSize: "22px", fontWeight: 900, letterSpacing: "0.5px", marginBottom: "8px" }}>YELEN</div>
          <p style={{ color: t2, fontSize: "14px", lineHeight: 1.5, maxWidth: "280px", margin: "0 auto 14px" }}>
            Votre espace pour accéder simplement aux services qui vous entourent.
          </p>
          <div style={{ color: t3, fontSize: "12px", fontWeight: 600 }}>Version {APP_VERSION}</div>
        </div>

        {/* ── Yelen en quelques mots ── */}
        <section style={{ marginTop: "32px", marginBottom: "28px" }}>
          <div style={sectionTitreStyle(t2)}>Yelen en quelques mots</div>
          <p style={{ color: t1, fontSize: "14px", lineHeight: 1.6, margin: "0 0 14px" }}>
            Yelen vous aide à organiser vos rendez-vous, démarches et activités avec les services et établissements disponibles sur la plateforme.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{ backgroundColor: card, borderRadius: "14px", padding: "16px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ color: t1, flexShrink: 0 }}>{f.icon}</div>
                <div style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{f.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Informations ── */}
        <section style={{ marginBottom: "24px" }}>
          <div style={sectionTitreStyle(t2)}>Informations</div>
          <LignesCarte lignes={INFOS} card={card} brd={brd} t1={t1} t2={t2} t3={t3}/>
        </section>

        {/* ── Légal (jamais mélangé aux informations ci-dessus) ── */}
        <section style={{ marginBottom: "8px" }}>
          <div style={sectionTitreStyle(t2)}>Légal</div>
          <LignesCarte lignes={LEGAL} card={card} brd={brd} t1={t1} t2={t2} t3={t3}/>
        </section>

        {/* ── Pied de page ── */}
        <div style={{ textAlign: "center", padding: "40px 16px 4px" }}>
          <div style={{ color: t1, fontSize: "13px", fontWeight: 900, letterSpacing: "1px", marginBottom: "8px" }}>YELEN</div>
          <p style={{ color: t3, fontSize: "12px", lineHeight: 1.6, maxWidth: "240px", margin: "0 auto 10px" }}>
            Fait avec soin pour simplifier vos démarches du quotidien.
          </p>
          <div style={{ color: t3, fontSize: "11px", fontWeight: 600 }}>Yelen224</div>
          <div style={{ color: t3, fontSize: "11px", marginTop: "2px" }}>© {new Date().getFullYear()} Yelen</div>
        </div>
      </main>
    </div>
  );
}
