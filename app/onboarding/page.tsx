"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════
// ROUTES — adapter selon l'arborescence réelle du projet
// ═══════════════════════════════════════════════════════════
const ROUTES = {
  // Citoyen
  citoyenInscription: "/inscription",   // ← app/inscription/citoyen/page.tsx
  citoyenConnexion:   "/login",      // ← app/connexion/citoyen/page.tsx (ou /login si différent)

  // Institution
  institutionInscription: "/institution/inscription",  // ✅ existe déjà
  institutionConnexion:   "/institution/connexion",    // ✅ existe déjà

  // Accueil sans compte
  home: "/",
};

const slides = [
  {
    id: 1,
    title: "Bienvenue sur Yelen224",
    subtitle: "La plateforme officielle de la République de Guinée pour vos démarches en ligne",
    illustration: (
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
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
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
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
    title: "Connecté aux institutions",
    subtitle: "Accédez aux services de l'État et aux entreprises privées depuis votre téléphone",
    illustration: (
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
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
    title: "Sécurisé & Fiable",
    subtitle: "Vos données sont protégées. Rejoignez des milliers de Guinéens qui font confiance à Yelen224",
    illustration: (
      <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
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
        <text x="160" y="254" textAnchor="middle" fill="#C97A0E" fontSize="11" fontFamily="sans-serif" fontWeight="bold">+10 000 utilisateurs</text>
      </svg>
    ),
  },
];

// ─── Permission popup ──────────────────────────────────────────────────────────
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
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0 env(safe-area-inset-bottom)",
    }}>
      <div style={{
        width: "100%", maxWidth: "480px",
        backgroundColor: "#fff",
        borderRadius: "28px 28px 0 0",
        padding: "12px 0 0",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
        animation: "slideUp 0.35s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", backgroundColor: "rgba(0,0,0,0.12)", margin: "0 auto 24px" }}/>
        <div style={{ padding: "0 28px 36px" }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "22px",
            background: "linear-gradient(135deg,#F5A623,#FFB300)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 28px rgba(245,166,35,0.4)",
          }}>
            {icon}
          </div>
          <h2 style={{ textAlign: "center", fontSize: "20px", fontWeight: "900", color: "#1a1a1a", marginBottom: "10px", lineHeight: 1.2 }}>
            {title}
          </h2>
          <p style={{ textAlign: "center", fontSize: "14px", color: "#666", lineHeight: 1.6, marginBottom: "28px" }}>
            {description}
          </p>
          <button onClick={onAllow} style={{
            width: "100%", padding: "16px",
            background: "linear-gradient(135deg,#F5A623,#FFB300)",
            color: "#33271A", fontWeight: "800", fontSize: "16px",
            border: "none", borderRadius: "16px", cursor: "pointer",
            marginBottom: "10px",
            boxShadow: "0 6px 24px rgba(245,166,35,0.45)",
          }}>
            {buttonLabel}
          </button>
          <button onClick={onSkip} style={{
            width: "100%", padding: "14px",
            background: "transparent", color: "#999",
            fontWeight: "600", fontSize: "14px",
            border: "none", borderRadius: "16px", cursor: "pointer",
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
  const [current, setCurrent]       = useState(0);
  const [showChoice, setShowChoice] = useState(false);
  const [animating, setAnimating]   = useState(false);
  const [permStep, setPermStep]     = useState<null | "location" | "notif" | "done">(null);

  const finishOnboarding = () => {
    try { localStorage.setItem("yelen224_onboarding_done", "1"); } catch {}
  };

  // ── Navigation profil ── chaque type → sa propre route ──────────────────────
  const handleChoice = (type: "citoyen" | "institution") => {
    finishOnboarding();
    router.push(type === "citoyen" ? ROUTES.citoyenInscription : ROUTES.institutionInscription);
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

  // ─── Écran de choix du profil ────────────────────────────────────────────────
  if (showChoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10"
        style={{ background: "linear-gradient(160deg, #FFF8E7 0%, #FFF0C0 50%, #FFE082 100%)" }}>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg, #F5A623, #FFD166)" }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
              <circle cx="12" cy="12" r="4" fill="#33271A"/>
              {[0,45,90,135,180,225,270,315].map((a,i)=>(
                <line key={i}
                  x1={12+5.5*Math.cos(a*Math.PI/180)} y1={12+5.5*Math.sin(a*Math.PI/180)}
                  x2={12+8*Math.cos(a*Math.PI/180)} y2={12+8*Math.sin(a*Math.PI/180)}
                  stroke="#33271A" strokeWidth="1.8" strokeLinecap="round"/>
              ))}
            </svg>
          </div>
          <span className="text-2xl font-black tracking-tight" style={{ color: "#33271A", fontFamily: "Georgia, serif" }}>
            YELEN<span style={{ color: "#F5A623" }}>224</span>
          </span>
        </div>

        <h1 className="text-2xl font-black text-center mb-2" style={{ color: "#33271A", fontFamily: "Georgia, serif" }}>
          Qui êtes-vous ?
        </h1>
        <p className="text-center text-sm mb-10" style={{ color: "#8B6914" }}>
          Choisissez votre profil pour personnaliser votre expérience
        </p>

        {/* Citoyen */}
        <button
          onClick={() => handleChoice("citoyen")}
          className="w-full max-w-sm mb-4 p-6 rounded-3xl text-left transition-all duration-200 active:scale-95"
          style={{ background: "white", boxShadow: "0 8px 32px rgba(245,166,35,0.25)", border: "2px solid transparent" }}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #FFF3CD, #FFD166)" }}>
              🧑🏾
            </div>
            <div>
              <div className="font-black text-lg mb-1" style={{ color: "#33271A", fontFamily: "Georgia, serif" }}>Citoyen</div>
              <div className="text-sm" style={{ color: "#8B6914" }}>Je veux prendre des rendez-vous avec des institutions et services</div>
            </div>
            <div className="ml-auto text-2xl" style={{ color: "#F5A623" }}>→</div>
          </div>
        </button>

        {/* Institution */}
        <button
          onClick={() => handleChoice("institution")}
          className="w-full max-w-sm p-6 rounded-3xl text-left transition-all duration-200 active:scale-95"
          style={{ background: "linear-gradient(135deg, #F5A623, #FFB300)", boxShadow: "0 8px 32px rgba(245,166,35,0.4)" }}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.3)" }}>
              🏢
            </div>
            <div>
              <div className="font-black text-lg mb-1" style={{ color: "#33271A", fontFamily: "Georgia, serif" }}>Institution</div>
              <div className="text-sm" style={{ color: "#6B4A00" }}>Je représente une institution ou entreprise et je gère des rendez-vous</div>
            </div>
            <div className="ml-auto text-2xl" style={{ color: "white" }}>→</div>
          </div>
        </button>

        {/* Séparateur */}
        <div className="flex items-center gap-3 w-full max-w-sm mt-6 mb-4">
          <div className="flex-1 h-px" style={{ background: "rgba(139,105,20,0.3)" }}/>
          <span style={{ color: "#8B6914", fontSize: "12px" }}>ou</span>
          <div className="flex-1 h-px" style={{ background: "rgba(139,105,20,0.3)" }}/>
        </div>

        {/* Continuer sans compte */}
        <button
          onClick={handleSkipAccount}
          className="w-full max-w-sm py-4 rounded-2xl font-bold text-sm transition-all duration-200 active:scale-95"
          style={{
            background: "transparent",
            border: "2px dashed rgba(245,166,35,0.6)",
            color: "#8B6914",
            fontFamily: "Georgia, serif",
            fontSize: "15px",
          }}>
          Continuer sans compte →
        </button>
        <p className="text-center mt-2" style={{ fontSize: "11px", color: "#B8941A" }}>
          Vous pourrez créer un compte plus tard
        </p>

        {/* Déjà un compte */}
        <div className="mt-6 text-center">
          <span style={{ color: "#8B6914", fontSize: "14px" }}>Déjà un compte ? </span>
          <button
            onClick={handleAlreadyAccount}
            style={{ color: "#C97A0E", fontSize: "14px", fontWeight: "700", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Se connecter
          </button>
        </div>
      </div>
    );
  }














  // ─── Slides ────────────────────────────────────────────────────────────────
  const slide = slides[current];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #FFF8E7 0%, #FFF0C0 50%, #FFE082 100%)" }}>

      {/* Permission popups */}
      {permStep === "location" && (
        <PermissionPopup
          icon={
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#33271A" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          }
          title="Activer la localisation"
          description="Yelen224 utilise votre position pour vous montrer les institutions et services disponibles près de chez vous, et calculer les distances en temps réel."
          buttonLabel="📍 Activer la localisation"
          onAllow={requestLocation}
          onSkip={() => setPermStep("notif")}
        />
      )}

      {permStep === "notif" && (
        <PermissionPopup
          icon={
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#33271A" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          }
          title="Activer les notifications"
          description="Recevez des rappels pour vos rendez-vous, des confirmations de réservation et des alertes importantes de vos institutions directement sur votre téléphone."
          buttonLabel="🔔 Activer les notifications"
          onAllow={requestNotifications}
          onSkip={() => { setPermStep("done"); setShowChoice(true); }}
        />
      )}

      {/* Blobs décoratifs */}
      <div className="absolute top-[-60px] right-[-60px] w-56 h-56 rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, #FFD166, transparent)" }}/>
      <div className="absolute bottom-[120px] left-[-40px] w-40 h-40 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #F5A623, transparent)" }}/>

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-8 pb-2 z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #F5A623, #FFD166)" }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <circle cx="12" cy="12" r="4" fill="#33271A"/>
              {[0,60,120,180,240,300].map((a,i)=>(
                <line key={i}
                  x1={12+5.5*Math.cos(a*Math.PI/180)} y1={12+5.5*Math.sin(a*Math.PI/180)}
                  x2={12+8*Math.cos(a*Math.PI/180)} y2={12+8*Math.sin(a*Math.PI/180)}
                  stroke="#33271A" strokeWidth="1.8" strokeLinecap="round"/>
              ))}
            </svg>
          </div>
          <span className="font-black text-base tracking-tight" style={{ color: "#33271A", fontFamily: "Georgia, serif" }}>
            YELEN<span style={{ color: "#F5A623" }}>224</span>
          </span>
        </div>
        <button
          onClick={() => setPermStep("location")}
          className="text-sm font-semibold px-4 py-1.5 rounded-full"
          style={{ color: "#8B6914", background: "rgba(245,166,35,0.15)" }}>
          Passer
        </button>
      </div>

      {/* Indicateurs de progression */}
      <div className="flex justify-center gap-2 py-3 z-10">
        {slides.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === current ? "28px" : "8px",
              height: "8px",
              background: i === current ? "#F5A623" : "rgba(245,166,35,0.35)",
            }}/>
        ))}
      </div>

      {/* Illustration */}
      <div
        className="flex-1 flex items-center justify-center px-8 transition-all duration-300"
        style={{ opacity: animating ? 0 : 1, transform: animating ? "translateX(30px)" : "translateX(0)" }}>
        <div className="w-full max-w-xs h-64">{slide.illustration}</div>
      </div>

      {/* Texte */}
      <div className="px-8 pb-4 z-10 transition-all duration-300" style={{ opacity: animating ? 0 : 1 }}>
        <h1 className="text-3xl font-black text-center leading-tight mb-3"
          style={{ color: "#33271A", fontFamily: "Georgia, serif" }}>
          {slide.title}
        </h1>
        <p className="text-center text-base leading-relaxed" style={{ color: "#8B6914" }}>
          {slide.subtitle}
        </p>
      </div>

      {/* Navigation */}
      <div className="px-6 pb-10 pt-4 flex items-center gap-3 z-10">
        {current > 0 && (
          <button onClick={goPrev}
            className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-95"
            style={{ background: "rgba(245,166,35,0.2)", border: "2px solid rgba(245,166,35,0.4)" }}>
            <span style={{ color: "#F5A623", fontSize: "20px" }}>←</span>
          </button>
        )}
        <button onClick={goNext}
          className="flex-1 h-14 rounded-2xl font-bold text-base transition-all active:scale-95 shadow-lg"
          style={{
            background: "linear-gradient(135deg, #F5A623, #FFB300)",
            color: "#33271A",
            boxShadow: "0 6px 24px rgba(245,166,35,0.5)",
            fontFamily: "Georgia, serif",
          }}>
          {current === slides.length - 1 ? "Commencer →" : "Suivant →"}
        </button>
      </div>
    </div>
  );
}