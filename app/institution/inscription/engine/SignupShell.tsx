"use client";

import Link from "next/link";
import { YelenLogo } from "@/components/YelenLogo";
import { SecondaryButton } from "./ui";
import { useSignupTheme } from "./theme";

const CSS = `
  .signup-root *{box-sizing:border-box}
  .signup-root a:focus-visible,.signup-root button:focus-visible,.signup-root input:focus-visible,.signup-root select:focus-visible{outline:2px solid var(--signup-gold);outline-offset:2px;border-radius:6px}
  .signup-tap{transition:opacity .12s,transform .12s;touch-action:manipulation}
  .signup-tap:active{opacity:.8;transform:scale(.98)}
  .signup-cta:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.03)}
  .signup-footer-link:hover{color:var(--signup-gold);text-decoration:underline}
  .signup-header-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;text-decoration:none}
  .signup-header-icon:hover{background:var(--signup-goldbg2)}
  .signup-card{width:100%;max-width:480px}
  .signup-card-close{display:none}

  /* ── Mobile-first : liste inline visible par défaut, déclencheur/modale
     desktop invisibles (et donc inatteignables au clic — aucune détection
     JS de viewport nécessaire). Bascule à ≥960px ci-dessous. Voir
     ActiviteStep.tsx pour l'usage (catégorie+activité, statut juridique). ── */
  .signup-mobile-only{display:block}
  .signup-desktop-only{display:none}

  /* ── Desktop (≥960px) : repère explicite = Google Sign-in (carte large,
     colonne gauche titre/contexte + colonne droite contenu actionnable) et
     app/institution/connexion/page.tsx (même idée, .yelen-login-step-split).
     Jamais la mise en page mobile simplement recentrée dans un grand écran
     vide. .signup-split s'applique à toute étape avec un contenu réel
     (Téléphone/Responsable/Activité/Résumé) ; Intro/Succès restent centrées
     (même logique que les écrans de confirmation Google, pas de split). ── */
  @media (min-width: 960px){
    /* Même habillage que les popups desktop (ActiviteStep.tsx,
       DesktopModalShell) : fond de carte distinct de la page (jeton
       --signup-card-bg, jamais une couleur codée en dur), même ombre/coins
       — pour que la "carte" de chaque étape se lise visuellement comme le
       même objet que les popups Catégorie/Activité/Statut. */
    .signup-card{position:relative;max-width:760px;background-color:var(--signup-card-bg);box-shadow:var(--signup-shadow);border:1px solid var(--signup-border);border-radius:24px;padding:52px}
    .signup-card.signup-card-wide{max-width:900px}
    .signup-card-close{display:flex}
    .signup-split{display:flex;flex-direction:row;align-items:flex-start;gap:64px}
    .signup-split .signup-split-side{flex:0 0 280px;text-align:left}
    .signup-split .signup-split-body{flex:1;min-width:0}
    .signup-mobile-only{display:none}
    .signup-desktop-only{display:block}
  }
`;

export function SignupShell({ children, onBack, backLabel, wide, hideClose }: {
  children: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  wide?: boolean;
  hideClose?: boolean;
}) {
  const C = useSignupTheme();

  return (
    <div className="signup-root" style={{
      minHeight: "100svh", display: "flex", flexDirection: "column", background: C.bg,
      fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: C.dark,
      ["--signup-gold" as string]: C.gold,
      ["--signup-shadow" as string]: C.shadow,
      ["--signup-border" as string]: C.border,
      ["--signup-goldbg2" as string]: C.goldBg2,
      ["--signup-card-bg" as string]: C.card,
    } as React.CSSProperties}>
      <style>{CSS}</style>

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
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Link href="/faq" className="signup-header-icon" aria-label="Aide" title="Aide">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </Link>
          <Link href="/guide-prestataire" className="signup-header-icon" aria-label="Guide" title="Guide">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </Link>
        </div>
      </header>

      {/* CONTENU */}
      <main style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px 60px" }}>
        <div className={`signup-card${wide ? " signup-card-wide" : ""}`} style={{ animation: "signupFadeUp 0.3s ease" }}>
          {/* Fermeture desktop — même en-tête que les popups internes du
              wizard (ActiviteStep.tsx, DesktopModalShell) : cohérence
              visuelle totale entre "la carte de l'étape" et "les popups
              qu'elle ouvre". Masquée à l'étape "success" (rien à quitter,
              onGoToDashboard est l'unique sortie). Mobile : absente, la
              navigation "Retour" du header suffit déjà. */}
          {!hideClose && (
            <Link href="/institution/decouverte" aria-label="Quitter l'inscription" className="signup-card-close signup-tap"
              style={{ position: "absolute", top: "20px", right: "20px", width: "34px", height: "34px", borderRadius: "50%", background: C.gray3, alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.dark2} strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </Link>
          )}
          {children}
          {onBack && (
            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <SecondaryButton onClick={onBack} C={C}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
                {backLabel || "Retour"}
              </SecondaryButton>
            </div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "14px", padding: "16px 20px", fontSize: "11.5px", color: C.gray }}>
        <Link href="/confidentialite" className="signup-footer-link" style={{ color: C.gray, textDecoration: "none" }}>Confidentialité</Link>
        <span aria-hidden="true">·</span>
        <Link href="/cgu" className="signup-footer-link" style={{ color: C.gray, textDecoration: "none" }}>CGU</Link>
        <span aria-hidden="true">·</span>
        <Link href="/contact" className="signup-footer-link" style={{ color: C.gray, textDecoration: "none" }}>Contact</Link>
      </footer>

      <style>{`@keyframes signupFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
