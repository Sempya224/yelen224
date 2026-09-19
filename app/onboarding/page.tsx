"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

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
    title: "Bienvenue sur Yelen224",
    subtitle: "La plateforme officielle de la République de Guinée pour vos démarches en ligne",
    illustration: (
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
        <circle cx="160" cy="120" r="100" fill="#FFF3CD" opacity="0.6"/>
        <circle cx="160" cy="100" r="38" fill="#F5A623"/>
        <circle cx="160" cy="100" r="28" fill="#FFD166"/>
        {[0,30,60,90,120,150,180,210,240,270,300,330].map((angle, i) => (
          <line key={i}
            x1={160 + 42 * Math.cos((angle * Math.PI) / 180)}
            y1={100 + 42 * Math.sin((angle * Math.PI) / 180)}
            x2={160 + 55 * Math.cos((angle * Math.PI) / 180)}
            y2={100 + 55 * Math.sin((angle * Math.PI) / 180)}
            stroke="#F5A623" strokeWidth="3" strokeLinecap="round"/>
        ))}
        <rect x="30" y="160" width="30" height="80" rx="4" fill="#E8961A" opacity="0.8"/>
        <rect x="35" y="148" width="20" height="16" rx="2" fill="#F5A623" opacity="0.9"/>
        <rect x="70" y="145" width="40" height="95" rx="4" fill="#D4870F" opacity="0.85"/>
        <rect x="78" y="133" width="24" height="16" rx="2" fill="#F5A623"/>
        <rect x="120" y="155" width="35" height="85" rx="4" fill="#E8961A" opacity="0.8"/>
        <rect x="165" y="140" width="45" height="100" rx="4" fill="#C97A0E" opacity="0.9"/>
        <rect x="172" y="126" width="30" height="18" rx="2" fill="#FFD166"/>
        <rect x="220" y="158" width="32" height="82" rx="4" fill="#E8961A" opacity="0.8"/>
        <rect x="262" y="150" width="28" height="90" rx="4" fill="#D4870F" opacity="0.85"/>
        {[[78,160],[90,160],[78,178],[90,178],[78,196],[90,196],[172,145],[185,145],[172,163],[185,163]].map(([x,y],i) => (
          <rect key={i} x={x} y={y} width="8" height="8" rx="1" fill="#FFF8E7" opacity="0.9"/>
        ))}
        <ellipse cx="160" cy="248" rx="130" ry="18" fill="#F5A623" opacity="0.25"/>
        <line x1="160" y1="60" x2="160" y2="35" stroke="#8B5E0A" strokeWidth="2.5"/>
        <rect x="160" y="35" width="14" height="8" fill="#E8281E"/>
        <rect x="174" y="35" width="14" height="8" fill="#FFD700"/>
        <rect x="188" y="35" width="14" height="8" fill="#009A44"/>
      </svg>
    ),
  },
  {
    id: 2,
    title: "Prenez vos RDV facilement",
    subtitle: "Hôpitaux, mairies, ambassades, banques… Réservez en quelques secondes",
    illustration: (
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
        <circle cx="160" cy="130" r="110" fill="#FFF3CD" opacity="0.5"/>
        <rect x="70" y="70" width="180" height="160" rx="16" fill="white" stroke="#F5A623" strokeWidth="3"/>
        <rect x="70" y="70" width="180" height="45" rx="16" fill="#F5A623"/>
        <rect x="70" y="100" width="180" height="15" fill="#F5A623"/>
        <text x="160" y="97" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="sans-serif">MARS 2026</text>
        {["L","M","M","J","V","S","D"].map((d, i) => (
          <text key={i} x={95 + i * 24} y="130" textAnchor="middle" fill="#999" fontSize="10" fontFamily="sans-serif">{d}</text>
        ))}
        {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map((n, i) => (
          <text key={n} x={95 + (i % 7) * 24} y={150 + Math.floor(i / 7) * 22}
            textAnchor="middle" fill={n === 15 ? "white" : "#444"} fontSize="11" fontFamily="sans-serif">{n}</text>
        ))}
        <circle cx="95" cy="146" r="10" fill="#F5A623"/>
        <circle cx="230" cy="210" r="22" fill="#4CAF50"/>
        <polyline points="220,210 227,218 242,200" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <rect x="195" y="155" width="55" height="95" rx="10" fill="#333" opacity="0.85"/>
        <rect x="200" y="165" width="45" height="70" rx="6" fill="#F5A623" opacity="0.9"/>
        <circle cx="222" cy="240" r="4" fill="#555"/>
      </svg>
    ),
  },
  {
    id: 3,
    title: "Toutes vos institutions, en un seul endroit",
    subtitle: "Services publics et entreprises privées, accessibles directement depuis votre téléphone",
    illustration: (
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
        <circle cx="160" cy="130" r="110" fill="#FFF3CD" opacity="0.5"/>
        <circle cx="160" cy="130" r="32" fill="#F5A623"/>
        <circle cx="160" cy="130" r="22" fill="#FFD166"/>
        <circle cx="160" cy="130" r="10" fill="#F5A623"/>
        {[0,45,90,135,180,225,270,315].map((a, i) => (
          <line key={i}
            x1={160 + 13 * Math.cos(a * Math.PI/180)} y1={130 + 13 * Math.sin(a * Math.PI/180)}
            x2={160 + 19 * Math.cos(a * Math.PI/180)} y2={130 + 19 * Math.sin(a * Math.PI/180)}
            stroke="#C97A0E" strokeWidth="2" strokeLinecap="round"/>
        ))}
        {[[-90,-70],[90,-70],[90,70],[-90,70],[0,-95],[0,95]].map(([dx,dy],i) => (
          <line key={i} x1="160" y1="130" x2={160+dx} y2={130+dy}
            stroke="#F5A623" strokeWidth="2" strokeDasharray="5,4" opacity="0.6"/>
        ))}
        {[
          {x:70, y:60, emoji:"🏥", label:"Hôpital"},
          {x:250, y:60, emoji:"🏛️", label:"Mairie"},
          {x:250, y:200, emoji:"🏦", label:"Banque"},
          {x:70, y:200, emoji:"🏫", label:"École"},
          {x:160, y:35, emoji:"✈️", label:"Ambassade"},
          {x:160, y:225, emoji:"🏢", label:"Entreprise"},
        ].map(({x,y,emoji,label},i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="26" fill="white" stroke="#F5A623" strokeWidth="2"/>
            <text x={x} y={y+5} textAnchor="middle" fontSize="16">{emoji}</text>
            <text x={x} y={y+22} textAnchor="middle" fill="#C97A0E" fontSize="8" fontFamily="sans-serif" fontWeight="bold">{label}</text>
          </g>
        ))}
      </svg>
    ),
  },
  {
    id: 4,
    title: "Sécurisé et fiable",
    subtitle: "Vos données restent privées et protégées par un chiffrement de niveau bancaire, à chaque étape",
    illustration: (
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
        <circle cx="160" cy="130" r="110" fill="#FFF3CD" opacity="0.5"/>
        <path d="M160 50 L220 75 L220 145 C220 185 160 215 160 215 C160 215 100 185 100 145 L100 75 Z"
          fill="#F5A623" opacity="0.2" stroke="#F5A623" strokeWidth="3"/>
        <path d="M160 65 L210 86 L210 148 C210 180 160 205 160 205 C160 205 110 180 110 148 L110 86 Z"
          fill="#FFD166" opacity="0.5"/>
        <rect x="138" y="130" width="44" height="36" rx="8" fill="#F5A623"/>
        <path d="M148 130 L148 118 C148 107 172 107 172 118 L172 130" stroke="#C97A0E" strokeWidth="5" fill="none" strokeLinecap="round"/>
        <circle cx="160" cy="148" r="6" fill="white"/>
        <rect x="157" y="148" width="6" height="10" rx="3" fill="white"/>
        {[[85,85],[235,85],[85,175],[235,175],[160,230]].map(([x,y],i) => (
          <g key={i} transform={`translate(${x},${y})`}>
            <polygon points="0,-10 2.9,-4 9.5,-3.1 4.8,1.5 6.0,8.1 0,5 -6.0,8.1 -4.8,1.5 -9.5,-3.1 -2.9,-4"
              fill="#FFD166" opacity="0.8"/>
          </g>
        ))}
        <rect x="100" y="235" width="120" height="28" rx="14" fill="#F5A623" opacity="0.15"/>
        <text x="160" y="254" textAnchor="middle" fill="#C97A0E" fontSize="11" fontFamily="sans-serif" fontWeight="bold">Chiffrement AES-256</text>
      </svg>
    ),
  },
];

// ─── Permission popup ──────────────────────────────────────────────────────────
// Même famille visuelle que les bottom sheets du reste de l'app (mes-rdv,
// rdv/[id]) : fond C.cardBg, coin arrondi haut, poignée centrée, bouton
// principal or canonique #F5A623→#C8940A + texte #080812 (retour Bryan
// 29/08/2026 — l'onboarding utilisait jusqu'ici une nuance/texte différents
// de tout le reste de l'app).
function PermissionPopup({
  icon, title, description, buttonLabel, onAllow, onSkip
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onAllow: () => void;
  onSkip: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0 env(safe-area-inset-bottom)",
    }}>
      <div style={{
        width: "100%", maxWidth: "480px",
        backgroundColor: C.cardBg,
        borderRadius: "24px 24px 0 0",
        padding: "8px 0 0",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
        animation: "slideUp 0.3s ease",
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", backgroundColor: C.borderCard, margin: "0 auto 20px" }}/>
        <div style={{ padding: "0 24px 32px" }}>
          <div style={{
            width: "64px", height: "64px", borderRadius: "18px",
            background: "linear-gradient(135deg,#F5A623,#C8940A)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 18px",
            boxShadow: "0 6px 20px rgba(245,166,35,0.35)",
          }}>
            {icon}
          </div>
          <h2 style={{ textAlign: "center", fontSize: "18px", fontWeight: "900", color: C.text, margin: "0 0 8px" }}>
            {title}
          </h2>
          <p style={{ textAlign: "center", fontSize: "13px", color: C.textSubtle, lineHeight: 1.6, margin: "0 0 24px" }}>
            {description}
          </p>
          <button onClick={onAllow} className="tap" style={{
            width: "100%", padding: "15px",
            background: "linear-gradient(135deg,#F5A623,#C8940A)",
            color: "#080812", fontWeight: "800", fontSize: "15px",
            border: "none", borderRadius: "14px", cursor: "pointer",
            marginBottom: "8px",
          }}>
            {buttonLabel}
          </button>
          <button onClick={onSkip} className="tap" style={{
            width: "100%", padding: "13px",
            background: "transparent", color: C.textSubtle,
            fontWeight: "700", fontSize: "13px",
            border: "none", borderRadius: "14px", cursor: "pointer",
          }}>
            Pas maintenant
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";
  const [current, setCurrent]       = useState(0);
  const [showChoice, setShowChoice] = useState(false);
  const [animating, setAnimating]   = useState(false);
  const [permStep, setPermStep]     = useState<null | "location" | "notif" | "done">(null);

  const finishOnboarding = () => {
    try { localStorage.setItem("yelen224_onboarding_done", "1"); } catch {}
  };

  const handleCreerCompte = () => {
    finishOnboarding();
    router.push(ROUTES.citoyenInscription);
  };

  const handleSkipAccount = () => {
    finishOnboarding();
    router.push(ROUTES.home);
  };

  const handleAlreadyAccount = () => {
    finishOnboarding();
    router.push(ROUTES.citoyenConnexion);
  };

  const goNext = () => {
    if (current < slides.length - 1) {
      setAnimating(true);
      setTimeout(() => { setCurrent(current + 1); setAnimating(false); }, 300);
    } else {
      setPermStep("location");
    }
  };

  const goPrev = () => {
    if (current > 0) {
      setAnimating(true);
      setTimeout(() => { setCurrent(current - 1); setAnimating(false); }, 300);
    }
  };

  const requestLocation = () => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 8000 });
    }
    setPermStep("notif");
  };

  const requestNotifications = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try { await Notification.requestPermission(); } catch {}
    }
    setPermStep("done");
    setShowChoice(true);
  };

  const iconBg = isDark ? "rgba(245,166,35,0.12)" : "rgba(245,166,35,0.08)";

  // ─── Écran de choix du profil ────────────────────────────────────────────────
  if (showChoice) {
    return (
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
        <style>{`
          *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
          html,body{overflow-x:hidden;background:${C.pageBg}}
          .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
          .tap:active{opacity:.7;transform:scale(.97)}
        `}</style>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#F5A623,#C8940A)" }}>
            <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
              <circle cx="12" cy="12" r="4" fill="#080812"/>
              {[0,45,90,135,180,225,270,315].map((a,i)=>(
                <line key={i}
                  x1={12+5.5*Math.cos(a*Math.PI/180)} y1={12+5.5*Math.sin(a*Math.PI/180)}
                  x2={12+8*Math.cos(a*Math.PI/180)} y2={12+8*Math.sin(a*Math.PI/180)}
                  stroke="#080812" strokeWidth="1.8" strokeLinecap="round"/>
              ))}
            </svg>
          </div>
          <span style={{ fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", color: C.text }}>
            YELEN<span style={{ color: "#F5A623" }}>224</span>
          </span>
        </div>

        <h1 style={{ fontSize: "22px", fontWeight: "900", textAlign: "center", margin: "0 0 8px", color: C.text }}>
          Créez votre compte
        </h1>
        <p style={{ textAlign: "center", fontSize: "13px", margin: "0 0 36px", color: C.textSubtle }}>
          Prenez rendez-vous avec des institutions et services en quelques secondes
        </p>

        {/* Créer un compte — mobile réservé aux citoyens */}
        <button
          onClick={handleCreerCompte}
          className="tap"
          style={{ width: "100%", maxWidth: "400px", padding: "20px", borderRadius: "20px", border: "none", cursor: "pointer", textAlign: "left", background: "linear-gradient(135deg,#F5A623,#C8940A)", boxShadow: "0 8px 28px rgba(245,166,35,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", flexShrink: 0, background: "rgba(8,8,18,0.12)" }}>
              🧑🏾
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "16px", fontWeight: "900", marginBottom: "2px", color: "#080812" }}>Créer mon compte</div>
              <div style={{ fontSize: "12.5px", color: "rgba(8,8,18,0.65)" }}>Rendez-vous, démarches et suivi en un seul endroit</div>
            </div>
            <div style={{ fontSize: "20px", color: "#080812", flexShrink: 0 }}>→</div>
          </div>
        </button>

        {/* Séparateur */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", maxWidth: "400px", margin: "20px 0 16px" }}>
          <div style={{ flex: 1, height: "1px", background: C.borderCard }}/>
          <span style={{ color: C.textSubtle, fontSize: "12px" }}>ou</span>
          <div style={{ flex: 1, height: "1px", background: C.borderCard }}/>
        </div>

        {/* Continuer sans compte */}
        <button
          onClick={handleSkipAccount}
          className="tap"
          style={{ width: "100%", maxWidth: "400px", padding: "15px", borderRadius: "16px", cursor: "pointer", background: "transparent", border: `1.5px dashed ${C.borderCard}`, color: C.textSubtle, fontWeight: "700", fontSize: "14px" }}>
          Continuer sans compte →
        </button>
        <p style={{ textAlign: "center", marginTop: "8px", fontSize: "11px", color: C.textFaint }}>
          Vous pourrez créer un compte plus tard
        </p>

        {/* Déjà un compte */}
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <span style={{ color: C.textSubtle, fontSize: "13px" }}>Déjà un compte ? </span>
          <button
            onClick={handleAlreadyAccount}
            style={{ color: "#F5A623", fontSize: "13px", fontWeight: "700", background: "none", border: "none", cursor: "pointer", textDecoration: "none" }}>
            Se connecter
          </button>
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

      {/* Permission popups */}
      {permStep === "location" && (
        <PermissionPopup
          icon={
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          }
          title="Trouvez les services près de chez vous"
          description="Yelen224 utilise votre position pour vous montrer les institutions et services disponibles près de chez vous, et calculer les distances en temps réel."
          buttonLabel="Activer la localisation"
          onAllow={requestLocation}
          onSkip={() => setPermStep("notif")}
        />
      )}

      {permStep === "notif" && (
        <PermissionPopup
          icon={
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          }
          title="Ne manquez aucun rendez-vous"
          description="Recevez des rappels pour vos rendez-vous, des confirmations de réservation et des alertes importantes de vos institutions directement sur votre téléphone."
          buttonLabel="Activer les notifications"
          onAllow={requestNotifications}
          onSkip={() => { setPermStep("done"); setShowChoice(true); }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 20px) 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#F5A623,#C8940A)" }}>
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
              <circle cx="12" cy="12" r="4" fill="#080812"/>
              {[0,60,120,180,240,300].map((a,i)=>(
                <line key={i}
                  x1={12+5.5*Math.cos(a*Math.PI/180)} y1={12+5.5*Math.sin(a*Math.PI/180)}
                  x2={12+8*Math.cos(a*Math.PI/180)} y2={12+8*Math.sin(a*Math.PI/180)}
                  stroke="#080812" strokeWidth="1.8" strokeLinecap="round"/>
              ))}
            </svg>
          </div>
          <span style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "-0.3px", color: C.text }}>
            YELEN<span style={{ color: "#F5A623" }}>224</span>
          </span>
        </div>
        <button
          onClick={() => setPermStep("location")}
          className="tap"
          style={{ padding: "7px 14px", borderRadius: "20px", border: "none", cursor: "pointer", color: "#F5A623", background: iconBg, fontSize: "13px", fontWeight: "700" }}>
          Passer
        </button>
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
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px calc(env(safe-area-inset-bottom) + 24px)" }}>
        {current > 0 && (
          <button onClick={goPrev} className="tap" aria-label="Précédent"
            style={{ width: "52px", height: "52px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, background: iconBg, border: "none" }}>
            <span style={{ color: "#F5A623", fontSize: "18px" }}>←</span>
          </button>
        )}
        <button onClick={goNext} className="tap"
          style={{ flex: 1, height: "52px", borderRadius: "16px", border: "none", cursor: "pointer", fontWeight: "800", fontSize: "15px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812" }}>
          {current === slides.length - 1 ? "Commencer →" : "Suivant →"}
        </button>
      </div>
    </div>
  );
}
