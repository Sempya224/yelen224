"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YelenLogo } from "@/components/YelenLogo";
import { LegalLanguageSwitcher } from "@/app/(legal)/_components/LegalLanguageSwitcher";

// ═══════════════════════════════════════════════════════════
// ROUTES — adapter selon l'arborescence réelle du projet
// ═══════════════════════════════════════════════════════════
// Mobile réservé aux citoyens (mission séparation Citizen/Web, 11/08/2026)
// — les institutions/prestataires/professionnels restent exclusivement sur
// leur portail Web (/institution/inscription, /institution/connexion),
// jamais promu ni même mentionné depuis l'onboarding mobile.
const ROUTES = {
  citoyenInscription: "/inscription",   // ← app/inscription/citoyen/page.tsx
  citoyenConnexion:   "/login",      // ← app/connexion/citoyen/page.tsx (ou /login si différent)
  home: "/",
};

const slides = [
  {
    id: 1,
    title: "Bienvenue sur Yelen",
    subtitle: "La plateforme numérique pour simplifier toutes vos démarches administratives et institutionnelles.",
    illustration: (
      <Image src="/illustrations/onboarding-bienvenue.png" alt="Bienvenue sur Yelen" width={1536} height={1024}
        style={{ width: "100%", height: "100%", objectFit: "contain" }} priority/>
    ),
  },
  {
    id: 2,
    title: "Planifiez vos démarches",
    subtitle: "Évitez les files d'attente. Choisissez la date et l'heure qui vous conviennent le mieux.",
    illustration: (
      <Image src="/illustrations/onboarding-planifier.png" alt="Planifiez vos démarches" width={1214} height={1295}
        style={{ width: "100%", height: "100%", objectFit: "contain" }} priority/>
    ),
  },
  {
    id: 3,
    title: "Tout votre quotidien, au même endroit",
    subtitle: "Interagissez avec vos institutions, gérez vos finances, échangez avec la communauté et accédez à des offres exclusives.",
    illustration: (
      <Image src="/illustrations/onboarding-institutions.png" alt="Toutes vos institutions" width={1254} height={1254}
        style={{ width: "100%", height: "100%", objectFit: "contain" }} priority/>
    ),
  },
  {
    id: 4,
    title: "Sécurité et confidentialité garanties",
    subtitle: "Vos données personnelles sont chiffrées selon les standards bancaires les plus stricts pour assurer la protection de chaque démarche.",
    illustration: (
      <Image src="/illustrations/onboarding-securite.png" alt="Sécurité et confidentialité garanties" width={1536} height={1024}
        style={{ width: "100%", height: "100%", objectFit: "contain" }} priority/>
    ),
  },
];

// ─── Statut de permission réel ──────────────────────────────────────────────────
// Lu depuis l'API navigateur elle-même, jamais déduit d'un choix utilisateur côté
// écran Yelen (retour Bryan 29/09/2026 : un tap sur "Continuer" n'est jamais une
// permission accordée, seul l'OS/navigateur fait foi).
type PermStatus = "granted" | "denied" | "prompt" | "unsupported";

function getNotificationStatus(): PermStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "prompt";
}

async function getGeolocationStatus(): Promise<PermStatus> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  if (!navigator.permissions?.query) return "prompt"; // Permissions API absente : impossible de vérifier sans déclencher la demande
  try {
    const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return result.state as PermStatus;
  } catch {
    return "prompt";
  }
}

// ─── Écran de permission plein écran ────────────────────────────────────────────
// Vraie étape Yelen, pas une bottom sheet décorative : pas de fond flouté, pas
// d'écran visible derrière, une seule action ("Continuer") qui déclenche la vraie
// demande système. Jamais de "Pas maintenant" ici (retour Bryan 29/09/2026,
// conforme HIG Apple sur les pré-demandes de permission à action unique).
function PermissionScreen({
  icon, title, description, onContinue,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onContinue: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme];

  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
      `}</style>

      <div style={{ height: "calc(env(safe-area-inset-top) + 64px)" }}/>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
        <div style={{
          width: "96px", height: "96px", borderRadius: "28px",
          background: "#F5A623",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "28px",
          boxShadow: "0 10px 32px rgba(245,166,35,0.35)",
        }}>
          {icon}
        </div>
        <h1 style={{ textAlign: "center", fontSize: "22px", fontWeight: "900", color: C.text, margin: "0 0 12px", lineHeight: 1.25 }}>
          {title}
        </h1>
        <p style={{ textAlign: "center", fontSize: "14px", color: C.textSubtle, lineHeight: 1.6, margin: 0, maxWidth: "340px" }}>
          {description}
        </p>
      </div>

      <div style={{ padding: "16px 20px calc(env(safe-area-inset-bottom) + 16px)" }}>
        <button onClick={onContinue} className="tap" style={{
          width: "100%", height: "52px", borderRadius: "26px",
          border: "none", cursor: "pointer",
          fontWeight: "800", fontSize: "15px",
          background: "#F5A623", color: "#080812",
        }}>
          Continuer
        </button>
      </div>
    </div>
  );
}

// ─── Aide contextuelle Yelen — point d'entrée unique vers l'aide (retour Bryan
// 29/09/2026) : plein écran, jamais une popup, ouvert depuis le "?" de l'écran
// de choix de compte. Volontairement pas un Centre d'aide séparé — les 4 blocs
// renvoient vers les vraies actions déjà existantes (créer compte, continuer
// sans compte, /confidentialite) plutôt que vers des pages inventées ; seul
// "Prendre rendez-vous" reste un simple encart informatif (aucun parcours RDV
// n'existe avant la création d'un compte ou l'entrée sans compte).
const HELP_FAQ: { id: string; question: string; reponse: string }[] = [
  { id: "pourquoi-compte", question: "Pourquoi créer un compte ?", reponse: "Un compte vous permet de retrouver votre historique, vos rendez-vous et vos préférences à chaque connexion, sur n'importe quel appareil." },
  { id: "sans-compte", question: "Puis-je utiliser Yelen sans compte ?", reponse: "Oui. Vous pouvez explorer Yelen librement. Certaines actions, comme prendre un rendez-vous ou suivre une démarche, nécessiteront ensuite un compte." },
  { id: "quest-ce-que", question: "Qu'est-ce que Yelen ?", reponse: "Yelen est votre espace pour organiser vos démarches, rendez-vous et activités avec les institutions, au même endroit." },
  { id: "comment-rdv", question: "Comment fonctionne un rendez-vous ?", reponse: "Vous recherchez un service, choisissez un créneau disponible, puis retrouvez toutes les informations liées à votre rendez-vous dans votre espace." },
  { id: "donnees-protegees", question: "Mes données sont-elles protégées ?", reponse: "Oui. Vos informations personnelles sont protégées et vous gardez le contrôle de vos préférences et de vos documents à tout moment." },
  { id: "compte-plus-tard", question: "Puis-je créer mon compte plus tard ?", reponse: "Oui, vous pouvez continuer sans compte maintenant et créer votre compte à tout moment depuis l'application." },
];

function HelpYelenScreen({
  onClose, onCreerCompte, onSkipAccount,
}: {
  onClose: () => void;
  onCreerCompte: () => void;
  onSkipAccount: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme];
  const [rdvOuvert, setRdvOuvert] = useState(false);
  const [faqOuverte, setFaqOuverte] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        html,body{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,0.4) transparent}
        html::-webkit-scrollbar,body::-webkit-scrollbar{width:6px}
        html::-webkit-scrollbar-track,body::-webkit-scrollbar-track{background:transparent}
        html::-webkit-scrollbar-thumb,body::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.4);border-radius:4px}
      `}</style>

      {/* Header — retour ET fermeture, les deux ramènent au même écran de choix */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 16px) 12px 12px" }}>
        <button onClick={onClose} aria-label="Retour" className="tap" style={{ width: "44px", height: "44px", borderRadius: "22px", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.text }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize: "15px", fontWeight: "800", color: C.text }}>Besoin d&apos;aide ?</span>
        <button onClick={onClose} aria-label="Fermer" className="tap" style={{ width: "44px", height: "44px", borderRadius: "22px", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.text }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px 24px" }}>
        {/* Intro — réduire l'incertitude immédiatement */}
        <h1 style={{ fontSize: "22px", fontWeight: "900", margin: "12px 0 8px", color: C.text }}>Bienvenue sur Yelen</h1>
        <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 28px", color: C.textSubtle }}>
          Vous êtes libre de découvrir Yelen avant de créer votre compte. Voici comment ça fonctionne.
        </p>

        <h2 style={{ fontSize: "16px", fontWeight: "800", margin: "0 0 6px", color: C.text }}>Découvrez Yelen</h2>
        <p style={{ fontSize: "13.5px", lineHeight: 1.6, margin: "0 0 20px", color: C.textSubtle }}>
          Yelen vous permet de retrouver au même endroit les services, démarches, rendez-vous et informations dont vous avez besoin.
        </p>

        {/* 4 blocs — chacun renvoie vers une action réelle, jamais une page inventée */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
          <div style={{ padding: "16px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, backgroundColor: C.cardBg }}>
            <div style={{ fontSize: "14.5px", fontWeight: "800", marginBottom: "4px", color: C.text }}>Créer mon compte</div>
            <p style={{ fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px", color: C.textSubtle }}>Votre compte vous permet de retrouver vos activités et de bénéficier d&apos;une expérience personnalisée.</p>
            <button onClick={onCreerCompte} className="tap" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#F5A623", fontWeight: "700", fontSize: "13px" }}>En savoir plus →</button>
          </div>

          <div style={{ padding: "16px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, backgroundColor: C.cardBg }}>
            <div style={{ fontSize: "14.5px", fontWeight: "800", marginBottom: "4px", color: C.text }}>Découvrir Yelen sans compte</div>
            <p style={{ fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px", color: C.textSubtle }}>Vous pouvez commencer à explorer Yelen sans créer de compte. Certaines fonctionnalités nécessiteront ensuite une connexion.</p>
            <button onClick={onSkipAccount} className="tap" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#F5A623", fontWeight: "700", fontSize: "13px" }}>Découvrir →</button>
          </div>

          <div style={{ padding: "16px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, backgroundColor: C.cardBg }}>
            <div style={{ fontSize: "14.5px", fontWeight: "800", marginBottom: "4px", color: C.text }}>Prendre rendez-vous</div>
            <p style={{ fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px", color: C.textSubtle }}>Recherchez un service, choisissez un créneau disponible et retrouvez les informations liées à votre rendez-vous.</p>
            <button onClick={() => setRdvOuvert(v => !v)} className="tap" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#F5A623", fontWeight: "700", fontSize: "13px" }}>
              Comment ça marche {rdvOuvert ? "↑" : "→"}
            </button>
            {rdvOuvert && (
              <p style={{ fontSize: "12.5px", lineHeight: 1.6, margin: "10px 0 0", color: C.textSubtle }}>
                1. Recherchez le service ou l&apos;institution souhaitée.<br/>
                2. Choisissez un créneau disponible.<br/>
                3. Retrouvez la confirmation et le suivi dans votre espace.
              </p>
            )}
          </div>

          <div style={{ padding: "16px", borderRadius: "14px", border: `1px solid ${C.borderCard}`, backgroundColor: C.cardBg }}>
            <div style={{ fontSize: "14.5px", fontWeight: "800", marginBottom: "4px", color: C.text }}>Vos données</div>
            <p style={{ fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px", color: C.textSubtle }}>Yelen protège vos informations et vous permet de gérer vos préférences et vos documents légaux.</p>
            <Link href="/confidentialite" className="tap" style={{ color: "#F5A623", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}>Confidentialité →</Link>
          </div>
        </div>

        {/* Rassurance — répond explicitement à "dois-je créer un compte maintenant ?" */}
        <h2 style={{ fontSize: "16px", fontWeight: "800", margin: "0 0 12px", color: C.text }}>Vous avez le choix</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "28px" }}>
          {[
            { titre: "Créer mon compte", texte: "Pour utiliser pleinement Yelen." },
            { titre: "Découvrir d'abord", texte: "Pour explorer Yelen sans compte." },
            { titre: "Revenir plus tard", texte: "Vous pouvez quitter cette page et revenir à votre parcours." },
          ].map(item => (
            <div key={item.titre} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "12px", backgroundColor: C.cardBg }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F5A623", flexShrink: 0 }}/>
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: "700", color: C.text }}>{item.titre}</div>
                <div style={{ fontSize: "12.5px", color: C.textSubtle }}>{item.texte}</div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ courte — reste orientée décision, pas une documentation */}
        <h2 style={{ fontSize: "16px", fontWeight: "800", margin: "0 0 12px", color: C.text }}>Questions fréquentes</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
          {HELP_FAQ.map(item => {
            const ouverte = faqOuverte === item.id;
            return (
              <div key={item.id} style={{ borderRadius: "12px", border: `1px solid ${C.borderCard}`, overflow: "hidden" }}>
                <button
                  onClick={() => setFaqOuverte(ouverte ? null : item.id)}
                  className="tap"
                  aria-expanded={ouverte}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "13px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: "700", color: C.text }}>{item.question}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: C.textSubtle, flexShrink: 0, transform: ouverte ? "rotate(180deg)" : undefined, transition: "transform 0.15s ease" }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {ouverte && (
                  <p style={{ margin: 0, padding: "0 14px 14px", fontSize: "13px", lineHeight: 1.55, color: C.textSubtle }}>{item.reponse}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA permanent — reprendre le parcours immédiatement après consultation */}
      <div style={{ padding: "12px 20px calc(env(safe-area-inset-bottom) + 16px)", borderTop: `1px solid ${C.borderCard}` }}>
        <button onClick={onCreerCompte} className="tap" style={{ width: "100%", height: "52px", borderRadius: "26px", border: "none", cursor: "pointer", fontWeight: "800", fontSize: "15px", background: "#F5A623", color: "#080812" }}>
          Créer mon compte →
        </button>
        <button onClick={onSkipAccount} className="tap" style={{ display: "block", width: "100%", marginTop: "10px", background: "none", border: "none", cursor: "pointer", color: C.textSubtle, fontWeight: "700", fontSize: "13px", padding: "6px", textAlign: "center" }}>
          Continuer sans compte
        </button>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const [current, setCurrent]       = useState(0);
  const [showChoice, setShowChoice] = useState(false);
  const [animating, setAnimating]   = useState(false);
  const [permStep, setPermStep]     = useState<null | "location" | "notif" | "done">(null);
  const [helpOpen, setHelpOpen]     = useState(false);

  const finishOnboarding = () => {
    try { localStorage.setItem("yelen224_onboarding_done", "1"); } catch {}
  };

  const handleCreerCompte = () => {
    finishOnboarding();
    router.push(ROUTES.citoyenInscription);
  };

  const handleSkipAccount = () => {
    finishOnboarding();
    // Acceptation implicite CGU/Confidentialité affichée sur cet écran (point 5
    // du brief) — permet à un futur gate invité de ne jamais redemander cette
    // confirmation déjà donnée ici.
    try { localStorage.setItem("yelen224_guest_legal_acceptee", "1"); } catch {}
    router.push(ROUTES.home);
  };

  const handleAlreadyAccount = () => {
    finishOnboarding();
    router.push(ROUTES.citoyenConnexion);
  };

  // Décide le premier écran de permission à montrer (ou aucun) en lisant le
  // statut réel — jamais réafficher une pré-demande déjà tranchée par l'OS.
  const advanceToPermissions = async () => {
    const geo = await getGeolocationStatus();
    if (geo === "prompt") { setPermStep("location"); return; }
    if (getNotificationStatus() === "prompt") { setPermStep("notif"); return; }
    setPermStep("done");
    setShowChoice(true);
  };

  const goNext = () => {
    if (current < slides.length - 1) {
      setAnimating(true);
      setTimeout(() => { setCurrent(current + 1); setAnimating(false); }, 300);
    } else {
      advanceToPermissions();
    }
  };

  const goPrev = () => {
    if (current > 0) {
      setAnimating(true);
      setTimeout(() => { setCurrent(current - 1); setAnimating(false); }, 300);
    }
  };

  const afterLocationResolved = () => {
    if (getNotificationStatus() === "prompt") { setPermStep("notif"); return; }
    setPermStep("done");
    setShowChoice(true);
  };

  const requestLocation = () => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(afterLocationResolved, afterLocationResolved, { timeout: 8000 });
    } else {
      afterLocationResolved();
    }
  };

  const requestNotifications = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try { await Notification.requestPermission(); } catch {}
    }
    setPermStep("done");
    setShowChoice(true);
  };

  // ─── Écrans de permission plein écran (vraies étapes, jamais une overlay) ────
  if (permStep === "location") {
    return (
      <PermissionScreen
        icon={
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        }
        title="Trouvez les services près de chez vous"
        description="Yelen224 utilise votre position pour vous montrer les institutions et services disponibles près de chez vous, et calculer les distances en temps réel."
        onContinue={requestLocation}
      />
    );
  }

  if (permStep === "notif") {
    return (
      <PermissionScreen
        icon={
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        }
        title="Ne manquez aucun rendez-vous"
        description="Recevez des rappels pour vos rendez-vous, des confirmations de réservation et des alertes importantes de vos institutions directement sur votre téléphone."
        onContinue={requestNotifications}
      />
    );
  }

  // ─── Aide contextuelle Yelen — "?" de l'Account Gateway ──────────────────────
  if (showChoice && helpOpen) {
    return (
      <HelpYelenScreen
        onClose={() => setHelpOpen(false)}
        onCreerCompte={handleCreerCompte}
        onSkipAccount={handleSkipAccount}
      />
    );
  }

  // ─── Écran de choix du profil — Account Gateway ─────────────────────────────
  // Point de sortie de l'onboarding, pensé comme un vrai palier d'entrée (retour
  // Bryan 29/09/2026, direction Apple/Stripe/Linear) : logo discret en header
  // (le branding plein écran des slides a déjà été vu), un seul CTA dominant,
  // aucune carte décorative/emoji, "Continuer sans compte" volontairement en
  // retrait pour ne plus concurrencer visuellement la création de compte.
  if (showChoice) {
    return (
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
        <style>{`
          *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
          html,body{overflow-x:hidden;background:${C.pageBg}}
          .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
          .tap:active{opacity:.7;transform:scale(.97)}
          html,body{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,0.4) transparent}
          html::-webkit-scrollbar,body::-webkit-scrollbar{width:6px}
          html::-webkit-scrollbar-track,body::-webkit-scrollbar-track{background:transparent}
          html::-webkit-scrollbar-thumb,body::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.4);border-radius:4px}
        `}</style>

        {/* Header discret */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 20px) 12px 0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5A623" }}>
              <YelenLogo size={18} color="#080812"/>
            </div>
            <span style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", color: C.text }}>
              YELEN<span style={{ color: "#F5A623" }}>224</span>
            </span>
          </div>
          {/* Aide contextuelle — seule icône d'aide de l'écran, ouvre le Help Yelen plein écran */}
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="Besoin d'aide ?"
            className="tap"
            style={{ width: "44px", height: "44px", borderRadius: "22px", border: `1.5px solid ${C.borderCard}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.text, flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px 32px", minHeight: 0 }}>
          {/* Illustration — élément central de l'écran, dominant comme la référence Target */}
          <div style={{ position: "relative", width: "100%", maxWidth: "340px", height: "clamp(220px, 40svh, 380px)", flexShrink: 1 }}>
            <Image src="/illustrations/onboarding-compte-hero.png" alt="" fill sizes="340px" priority style={{ objectFit: "contain" }}/>
          </div>

          <h1 style={{ fontSize: "24px", fontWeight: "900", textAlign: "center", margin: "0 0 10px", color: C.text }}>
            Bienvenue sur Yelen
          </h1>
          <p style={{ textAlign: "center", fontSize: "14px", lineHeight: 1.5, margin: "0 0 28px", color: C.textSubtle, maxWidth: "320px" }}>
            Votre espace pour organiser vos démarches, rendez-vous et activités au même endroit.
          </p>

          {/* Espace flexible — pousse le bloc d'actions vers le bas plutôt que de
              laisser un vide au-dessus de l'illustration (retour Bryan 29/09/2026) */}
          <div style={{ flex: 1, minHeight: "12px" }}/>

          {/* Créer un compte — CTA dominant, mobile réservé aux citoyens */}
          <button
            onClick={handleCreerCompte}
            className="tap"
            style={{ width: "100%", maxWidth: "400px", padding: "20px 22px", borderRadius: "18px", border: "none", cursor: "pointer", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "17px", fontWeight: "900", marginBottom: "3px", color: "#080812" }}>Créer mon compte</div>
              <div style={{ fontSize: "12.5px", color: "rgba(8,8,18,0.65)" }}>Accéder à mon espace Yelen</div>
            </div>
            <span style={{ fontSize: "20px", color: "#080812", flexShrink: 0 }}>→</span>
          </button>
          <p style={{ textAlign: "center", marginTop: "12px", fontSize: "12px", color: C.textFaint, letterSpacing: "0.2px" }}>
            Rendez-vous · Démarches · Suivi
          </p>

          {/* Découverte sans compte — zone distincte, clairement secondaire, jamais une 2e carte */}
          <div style={{ marginTop: "26px", textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", fontSize: "13px", color: C.textSubtle }}>
              Vous préférez d&apos;abord découvrir Yelen ?
            </p>
            <button
              onClick={handleSkipAccount}
              className="tap"
              style={{ background: "none", border: "none", cursor: "pointer", color: C.text, fontWeight: "700", fontSize: "14px", padding: "6px" }}>
              Continuer sans compte →
            </button>
          </div>

          {/* Clause légale — système légal Yelen existant (/cgu, /confidentialite) */}
          <p style={{ textAlign: "center", marginTop: "10px", fontSize: "11.5px", lineHeight: 1.5, color: C.textFaint, maxWidth: "300px" }}>
            En continuant sans compte, vous confirmez avoir lu et accepté les{" "}
            <Link href="/cgu" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none" }}>CGU</Link>
            {" "}et la{" "}
            <Link href="/confidentialite" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none" }}>Politique de confidentialité</Link>.
          </p>

          {/* Déjà un compte */}
          <div style={{ marginTop: "18px", textAlign: "center" }}>
            <span style={{ color: C.textSubtle, fontSize: "13px" }}>Déjà un compte ? </span>
            <button
              onClick={handleAlreadyAccount}
              style={{ color: "#F5A623", fontSize: "13px", fontWeight: "700", background: "none", border: "none", cursor: "pointer", textDecoration: "none" }}>
              Se connecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Slides ────────────────────────────────────────────────────────────────
  const slide = slides[current];

  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 20px) 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5A623" }}>
            <YelenLogo size={18} color="#080812"/>
          </div>
          <span style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", color: C.text }}>
            YELEN<span style={{ color: "#F5A623" }}>224</span>
          </span>
        </div>
        {current === 0 ? (
          <LegalLanguageSwitcher variant="pill"/>
        ) : (
          <button
            onClick={advanceToPermissions}
            className="tap"
            style={{ padding: "7px 14px", borderRadius: "20px", border: "none", cursor: "pointer", color: C.text, background: "transparent", fontSize: "13px", fontWeight: "700" }}>
            Passer
          </button>
        )}
      </div>

      {/* Indicateurs de progression */}
      <div style={{ display: "flex", justifyContent: "center", gap: "6px", padding: "10px 0" }}>
        {slides.map((_, i) => (
          <div key={i}
            style={{
              width: i === current ? "22px" : "6px",
              height: "6px",
              borderRadius: "3px",
              background: i === current ? "#F5A623" : C.borderCard,
              transition: "width 0.25s ease",
            }}/>
        ))}
      </div>

      {/* Illustration */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px", transition: "all 0.3s ease", opacity: animating ? 0 : 1, transform: animating ? "translateX(30px)" : "translateX(0)" }}>
        <div style={{ width: "100%", maxWidth: "280px", height: "256px" }}>{slide.illustration}</div>
      </div>

      {/* Texte */}
      <div style={{ padding: "0 28px 16px", transition: "opacity 0.3s ease", opacity: animating ? 0 : 1 }}>
        <h1 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center", lineHeight: 1.25, margin: "0 0 10px", color: C.text }}>
          {slide.title}
        </h1>
        <p style={{ textAlign: "center", fontSize: "14px", lineHeight: 1.6, margin: 0, color: C.textSubtle }}>
          {slide.subtitle}
        </p>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px calc(env(safe-area-inset-bottom) + 16px)" }}>
        {current > 0 && (
          <button onClick={goPrev} className="tap" aria-label="Précédent"
            style={{ width: "52px", height: "52px", borderRadius: "26px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, background: "transparent", border: `1.5px solid ${C.borderCard}` }}>
            <span style={{ color: "#080812", fontSize: "18px" }}>←</span>
          </button>
        )}
        <button onClick={goNext} className="tap"
          style={{ flex: 1, height: "52px", borderRadius: "26px", border: "none", cursor: "pointer", fontWeight: "800", fontSize: "15px", background: "#F5A623", color: "#080812" }}>
          {current === slides.length - 1 ? "Commencer →" : "Suivant →"}
        </button>
      </div>
    </div>
  );
}
