"use client";

import Link from "next/link";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";

// Écran "Paramètres" — décision CEO 18/07/2026 : plus une simple section
// qui se dépliait dans l'onglet Compte, mais un écran dédié à part
// entière (référence Apple/Android Settings — structure reprise, pas
// copiée : Yelen n'a rien d'identique à ces systèmes). Toujours 2
// sections, jamais de mélange : "Paramètres du compte" (identité,
// sécurité, infos perso) puis "Paramètres de l'application"
// (personnalisation de l'appareil). Ordre des cartes fixe, imposé par le
// brief CEO — ne pas réordonner sans nouvelle décision produit.
const P = { pointerEvents: "none" as const };
const Ic = {
  Shield: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Lock:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Bell:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Globe:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Down:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Trash:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Access: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  Signal: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="20" x2="4" y2="14"/><line x1="10" y1="20" x2="10" y2="10"/><line x1="16" y1="20" x2="16" y2="6"/><line x1="22" y1="20" x2="22" y2="2"/></svg>,
  Drive:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="14" x2="6.01" y2="14"/><line x1="10" y1="14" x2="10.01" y2="14"/></svg>,
  Sound:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  Info:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Chev:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
};

// Sélecteur de thème inline — retiré de l'écran dédié /compte/apparence
// (retour Bryan 18/07/2026 : "les choix du thème s'affichent direct, tu
// choisis le dark sans cliquer ouvrir un nouvel écran"), mirroring le
// sélecteur déjà utilisé côté institution
// (app/institution/[id]/dashboard/page.tsx, section "Apparence").
const THEME_OPTIONS: { key: ThemeMode; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: "system", label: "Système", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    ) },
  { key: "light", label: "Clair", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    ) },
  { key: "dark", label: "Sombre", icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    ) },
];

function ApparenceCard({ mode, setMode, card, brd, t1, t2, isDark }: {
  mode: ThemeMode; setMode: (m: ThemeMode) => void;
  card: string; brd: string; t1: string; t2: string; isDark: boolean;
}) {
  return (
    <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px" }}>
      <div style={{ color: t1, fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Apparence</div>
      <div style={{ color: t2, fontSize: "12.5px", marginBottom: "12px" }}>« Système » suit les réglages de votre appareil.</div>
      <div style={{ display: "flex", gap: "8px" }}>
        {THEME_OPTIONS.map((opt) => {
          const selected = mode === opt.key;
          return (
            <button
              key={opt.key} onClick={() => setMode(opt.key)} className="tap"
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "12px 8px",
                borderRadius: "14px", backgroundColor: selected ? "rgba(245,166,35,0.1)" : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
                border: `1.5px solid ${selected ? "rgba(245,166,35,0.4)" : brd}`, cursor: "pointer",
              }}
            >
              {opt.icon(selected ? "#F5A623" : t2)}
              <span style={{ color: selected ? "#F5A623" : t2, fontSize: "12px", fontWeight: selected ? 700 : 500 }}>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Carte = { icon: React.ReactNode; titre: string; description: string; href: string; danger?: boolean };

const PARAMETRES_COMPTE: Carte[] = [
  { icon: <Ic.Shield/>, titre: "Sécurité",               description: "PIN, mot de passe, biométrie et appareils connectés.",       href: "/compte/securite" },
  { icon: <Ic.Lock/>,   titre: "Confidentialité",         description: "Gérez vos autorisations et vos préférences de confidentialité.", href: "/compte/confidentialite" },
  { icon: <Ic.Bell/>,   titre: "Notifications",           description: "Choisissez les notifications que vous souhaitez recevoir.",  href: "/compte/notifications" },
  { icon: <Ic.Globe/>,  titre: "Langue",                  description: "Modifier la langue de votre compte.",                       href: "/compte/langue" },
  { icon: <Ic.Down/>,   titre: "Télécharger mes données", description: "Exporter toutes les données liées à votre compte.",          href: "/compte/mes-donnees" },
  { icon: <Ic.Trash/>,  titre: "Supprimer mon compte",    description: "Suppression définitive de votre compte Yelen.",              href: "/compte/informations-personnelles", danger: true },
];

const PARAMETRES_APPLICATION: Carte[] = [
  { icon: <Ic.Access/>,  titre: "Accessibilité",          description: "Taille du texte, contrastes et préférences visuelles.", href: "/compte/accessibilite" },
  { icon: <Ic.Signal/>,  titre: "Utilisation des données", description: "Optimisation des données mobiles et téléchargements.",  href: "/compte/donnees-mobiles" },
  { icon: <Ic.Drive/>,   titre: "Stockage",               description: "Cache, espace utilisé et nettoyage.",                  href: "/compte/stockage" },
  { icon: <Ic.Sound/>,   titre: "Sons et vibrations",     description: "Notifications sonores et vibrations.",                 href: "/compte/sons" },
  { icon: <Ic.Info/>,    titre: "Version",                description: "Version actuelle de Yelen.",                           href: "/compte/version" },
];

// Définie au niveau module — jamais à l'intérieur du composant (piège
// React déjà rencontré et corrigé sur les écrans Sécurité/Confidentialité :
// un composant redéfini à chaque rendu perd le focus de ses champs internes).
function Section({ titre, description, cartes, card, brd, t1, t2, t3, isDark, children }: {
  titre: string; description: string; cartes: Carte[];
  card: string; brd: string; t1: string; t2: string; t3: string; isDark: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "40px" }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ color: t1, fontSize: "13px", fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase" }}>{titre}</div>
        <div style={{ color: t2, fontSize: "12.5px", marginTop: "4px" }}>{description}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}
        {cartes.map(c => (
          <Link key={c.titre} href={c.href} className="tap" style={{ display: "flex", alignItems: "flex-start", gap: "14px", backgroundColor: card, border: `1px solid ${c.danger ? "rgba(239,68,68,0.25)" : brd}`, borderRadius: "16px", padding: "16px", textDecoration: "none", boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: c.danger ? "rgba(239,68,68,0.1)" : "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: c.danger ? "#ef4444" : "#F5A623", flexShrink: 0 }}>{c.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: c.danger ? "#ef4444" : t1, fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>{c.titre}</div>
              <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.4 }}>{c.description}</div>
            </div>
            <div style={{ color: t3, flexShrink: 0, marginTop: "11px" }}><Ic.Chev/></div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function ParametresPage() {
  const { theme, mode, setMode } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <CompteHeader titre="Paramètres"/>
      <main style={{ padding: "16px 16px 40px", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ padding: "8px 4px 24px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>Gérez votre compte, votre sécurité et les préférences de votre application.</p>
        </div>

        <Section titre="Paramètres du compte" description="Contrôlez votre identité, votre sécurité et vos informations personnelles." cartes={PARAMETRES_COMPTE} card={card} brd={brd} t1={t1} t2={t2} t3={t3} isDark={isDark}/>
        <Section titre="Paramètres de l'application" description="Personnalisez votre expérience Yelen sur cet appareil." cartes={PARAMETRES_APPLICATION} card={card} brd={brd} t1={t1} t2={t2} t3={t3} isDark={isDark}>
          <ApparenceCard mode={mode} setMode={setMode} card={card} brd={brd} t1={t1} t2={t2} isDark={isDark}/>
        </Section>
      </main>
    </div>
  );
}
