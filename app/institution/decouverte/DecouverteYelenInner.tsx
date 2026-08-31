"use client";

import Link from "next/link";
import Image from "next/image";
import { YelenLogo } from "@/components/YelenLogo";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

// ═══════════════════════════════════════════════════════════
// ACCENT DE MARQUE — fixe, jamais dérivé du thème clair/sombre. Une seule
// valeur, jamais une deuxième nuance (retour Bryan 14/08/2026 : une teinte
// plus foncée se lisait comme "une autre couleur" à côté du doré réel).
// ═══════════════════════════════════════════════════════════
const GOLD = { gold: "#F5A623" };

// Photographe Gustavo Fring, Pexels (licence gratuite, usage commercial
// autorisé) — coiffeur au travail avec son client, cadrage rapproché,
// scène de service réelle plutôt qu'une photo de bureau générique.
const HERO_IMAGE = "https://images.pexels.com/photos/7447135/pexels-photo-7447135.jpeg?auto=compress&cs=tinysrgb&w=1200";

function SearchIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function MessageIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function CalendarIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function TrendingIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  );
}

const BENEFITS = [
  { n: "01", title: "Soyez trouvé", desc: "Présentez clairement votre activité aux personnes qui recherchent vos services.", Icon: SearchIcon },
  { n: "02", title: "Recevez des demandes", desc: "Facilitez le contact entre votre activité et vos clients.", Icon: MessageIcon },
  { n: "03", title: "Organisez vos rendez-vous", desc: "Centralisez vos rendez-vous et vos disponibilités dans votre espace Yelen.", Icon: CalendarIcon },
  { n: "04", title: "Développez votre présence", desc: "Construisez une présence professionnelle et identifiable sur Yelen.", Icon: TrendingIcon },
] as const;

// Porte d'entrée professionnelle Yelen (Lot 03-A) — écran de valeur avant
// toute collecte d'information. Le CTA principal mène vers
// /institution/inscription, le nouveau moteur d'inscription progressif
// (Lot 03-B, bascule validée le 15/08/2026).
export function DecouverteYelenInner() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = T[theme];
  const C = {
    gold: GOLD.gold,
    goldBg2: isDark ? "rgba(245,166,35,0.12)" : "#FEF3C7",
    bg: t.pageBg,
    card: t.cardBg,
    dark: t.text,
    dark2: t.textMuted,
    gray: t.textSubtle,
    gray3: isDark ? "rgba(255,255,255,0.08)" : "#EDE8D8",
    border: isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.14)",
    shadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(20,20,30,0.09)",
  };

  const css = `
    .dec-root *{box-sizing:border-box}
    .dec-root a:focus-visible,.dec-root button:focus-visible{outline:2px solid ${C.gold};outline-offset:2px;border-radius:6px}
    .dec-tap{transition:opacity .12s,transform .12s;touch-action:manipulation}
    .dec-tap:active{opacity:.8;transform:scale(.98)}
    .dec-cta-main{transition:transform .15s,box-shadow .15s,filter .15s}
    .dec-cta-main:hover{transform:translateY(-1px);filter:brightness(1.03)}
    .dec-login-link:hover{color:${C.gold};text-decoration:underline}
    .dec-footer-link:hover{color:${C.gold};text-decoration:underline}

    .dec-grid{display:grid;grid-template-columns:1fr;row-gap:40px;
      grid-template-areas:"title" "visual" "benefits" "cta";}
    .dec-visual-frame{position:relative;width:100%;aspect-ratio:4/3;border-radius:24px;overflow:hidden;box-shadow:${C.shadow};border:1px solid ${C.border}}

    @media (min-width: 960px){
      .dec-grid{grid-template-columns:minmax(0,520px) 1fr;column-gap:72px;row-gap:32px;align-items:stretch;
        grid-template-areas:"title visual" "benefits visual" "cta visual";}
      .dec-visual-frame{aspect-ratio:auto;height:100%;min-height:520px}
    }
  `;

  return (
    <div className="dec-root" style={{ minHeight: "100svh", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: C.dark }}>
      <style>{css}</style>

      {/* HEADER */}
      <header style={{ padding: "calc(16px + env(safe-area-inset-top)) 24px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, backgroundColor: `${C.card}E6`, backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 10 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div style={{ width: "36px", height: "36px", background: C.gold, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${C.gold}40`, flexShrink: 0 }}>
            <YelenLogo size={18} color="#111"/>
          </div>
          <div>
            <div style={{ color: C.dark, fontSize: "15px", fontWeight: 900, letterSpacing: "0.5px", lineHeight: 1 }}>YELEN224</div>
            <div style={{ color: C.gold, fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>Espace professionnel</div>
          </div>
        </Link>
        <Link href="/institution/connexion" className="dec-login-link" style={{ color: C.dark2, fontSize: "13.5px", fontWeight: 700, textDecoration: "none" }}>
          Se connecter
        </Link>
      </header>

      {/* CONTENU */}
      <main style={{ flex: 1, width: "100%", maxWidth: "1180px", margin: "0 auto", padding: "56px 24px 72px" }}>
        <div className="dec-grid">

          {/* Titre + sous-titre */}
          <div style={{ gridArea: "title", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h1 style={{ fontSize: "clamp(30px, 4vw, 44px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.08, marginBottom: "18px", color: C.dark }}>
              Votre activité a sa place sur <span style={{ color: C.gold }}>Yelen</span>.
            </h1>
            <p style={{ fontSize: "16px", lineHeight: 1.6, color: C.gray, maxWidth: "460px" }}>
              Yelen rapproche les personnes qui recherchent un service des professionnels qui peuvent les accompagner.
              Présentez votre activité, soyez trouvé, et gérez simplement vos rendez-vous depuis votre espace Yelen.
            </p>
          </div>

          {/* Visuel */}
          <div style={{ gridArea: "visual" }}>
            <div className="dec-visual-frame">
              <Image
                src={HERO_IMAGE}
                alt="Un coiffeur au travail, en train de s'occuper d'un client dans son salon"
                fill
                sizes="(min-width: 960px) 520px, 100vw"
                style={{ objectFit: "cover" }}
                priority
              />
            </div>
          </div>

          {/* Bénéfices */}
          <div style={{ gridArea: "benefits", display: "flex", flexDirection: "column", gap: "18px" }}>
            {BENEFITS.map(({ n, title, desc, Icon }) => (
              <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <div style={{ flexShrink: 0, width: "44px", height: "44px", borderRadius: "12px", border: `1.5px solid ${C.border}`, backgroundColor: C.goldBg2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon color={C.gold}/>
                </div>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 800, color: C.dark, marginBottom: "3px" }}>{title}</div>
                  <div style={{ fontSize: "13.5px", lineHeight: 1.5, color: C.gray }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ gridArea: "cta", display: "flex", flexDirection: "column", gap: "14px", maxWidth: "460px" }}>
            <Link
              href="/institution/inscription"
              className="dec-tap dec-cta-main"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                width: "100%", padding: "17px", borderRadius: "14px",
                background: C.gold, color: "#111", fontSize: "16px", fontWeight: 800,
                textDecoration: "none", boxShadow: `0 8px 24px ${C.gold}40`,
              }}
            >
              Créer mon espace Yelen
            </Link>
            <Link href="/institution/connexion" className="dec-login-link" style={{ textAlign: "center", color: C.gray, fontSize: "13.5px", fontWeight: 600, textDecoration: "none" }}>
              Déjà un compte ? Se connecter
            </Link>
          </div>

        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "14px", padding: "16px 20px", fontSize: "11.5px", color: C.gray }}>
        <Link href="/confidentialite" className="dec-footer-link" style={{ color: C.gray, textDecoration: "none" }}>Confidentialité</Link>
        <span aria-hidden="true">·</span>
        <Link href="/cgu" className="dec-footer-link" style={{ color: C.gray, textDecoration: "none" }}>CGU</Link>
        <span aria-hidden="true">·</span>
        <Link href="/contact" className="dec-footer-link" style={{ color: C.gray, textDecoration: "none" }}>Contact</Link>
      </footer>
    </div>
  );
}
