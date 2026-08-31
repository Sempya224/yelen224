"use client";

// Flux de déconnexion citoyen — remplace les 4 implémentations locales
// divergentes (app/page.tsx, app/dashboard/dashboard-client.tsx,
// app/profil/profil-client.tsx, app/compte/informations-personnelles/
// informations-client.tsx) par une seule mécanique : confirmation →
// transition → succès → redirection, avec un état dédié en cas de coupure
// réseau. Écran plein écran, mobile only (comme BiometrieModal dans
// app/page.tsx dont ce composant reprend la recette visuelle), jamais de
// scission desktop puisque le côté citoyen n'existe qu'en mobile.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { logoutCitoyenStrict } from "@/lib/auth/logoutCitoyen";
import { YelenLoader } from "@/components/YelenLoader";
import type { LogoutFlowCopy } from "@/lib/logoutFlowTypes";

export const CITOYEN_LOGOUT_COPY: LogoutFlowCopy = {
  confirmTitle: "Quitter votre espace Yelen ?",
  confirmBody: "Vous allez fermer votre session sur cet appareil. Toutes vos données restent disponibles lors de votre prochaine connexion.",
  confirmCancelLabel: "Continuer ma session",
  confirmConfirmLabel: "Se déconnecter",
  transitioningTitle: "Déconnexion en cours…",
  transitioningSubtitle: "Nous sécurisons votre session avant de fermer votre espace.",
  successTitle: "Déconnexion réussie",
  successSubtitle: "Votre session a été fermée en toute sécurité. Merci d'avoir utilisé Yelen aujourd'hui.",
  networkErrorTitle: "Impossible de terminer la déconnexion",
  networkErrorBody: "Vérifiez votre connexion Internet puis réessayez.",
};

type Step = "confirm" | "transitioning" | "success" | "error-network";

const MIN_TRANSITION_MS = 600;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// Le parent monte ce composant conditionnellement ({logoutOpen && <LogoutFlow .../>})
// plutôt que de lui passer un booléen `open` — un montage frais réinitialise
// naturellement `step` à "confirm" via useState, sans effet de synchronisation.
export function LogoutFlow({ onClose, redirectTo, copy }: {
  onClose: () => void;
  redirectTo: string;
  copy: LogoutFlowCopy;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = T[theme];
  const [step, setStep] = useState<Step>("confirm");

  async function runLogout() {
    setStep("transitioning");
    try {
      await Promise.all([logoutCitoyenStrict(), delay(MIN_TRANSITION_MS)]);
      setStep("success");
      setTimeout(() => router.replace(redirectTo), 1000);
    } catch {
      setStep("error-network");
    }
  }

  const card = t.cardBg;
  const t1 = t.text;
  const t2 = t.textMuted;
  const brd = t.border;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9600, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0" }}>
      <style>{`@keyframes logoutProgress{from{width:8%}to{width:92%}} @keyframes logoutSheetUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ backgroundColor: card, borderRadius: "28px 28px 0 0", padding: "16px 28px calc(28px + env(safe-area-inset-bottom))", maxWidth: "480px", width: "100%", textAlign: "center", border: `1px solid ${brd}`, borderBottom: "none", animation: "logoutSheetUp 0.22s ease" }}>
        <div style={{ width: "40px", height: "4px", background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)", borderRadius: "2px", margin: "0 auto 20px" }}/>

        {step === "confirm" && (
          <>
            <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(8,8,18,0.05)", border: `2px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9.5 12.5l1.8 1.8 3.2-3.6"/>
              </svg>
            </div>
            <div style={{ color: t1, fontSize: "19px", fontWeight: "900", marginBottom: "10px" }}>{copy.confirmTitle}</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "28px" }}>{copy.confirmBody}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={runLogout} style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15.5px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer" }}>
                {copy.confirmConfirmLabel}
              </button>
              <button onClick={onClose} style={{ width: "100%", background: "none", border: `1px solid ${brd}`, color: t2, fontWeight: "700", fontSize: "14.5px", padding: "14px", borderRadius: "16px", cursor: "pointer" }}>
                {copy.confirmCancelLabel}
              </button>
            </div>
          </>
        )}

        {step === "transitioning" && (
          <>
            <div style={{ display: "flex", justifyContent: "center", margin: "0 auto 22px" }}><YelenLoader size={56}/></div>
            <div style={{ color: t1, fontSize: "18px", fontWeight: "800", marginBottom: "8px" }}>{copy.transitioningTitle}</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "22px" }}>{copy.transitioningSubtitle}</div>
            <div style={{ height: "4px", borderRadius: "2px", backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "2px", background: "linear-gradient(135deg,#F5A623,#C8940A)", animation: "logoutProgress 1.4s ease forwards" }}/>
            </div>
          </>
        )}

        {step === "success" && (
          <>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg,#22c55e,#16a34a)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: "0 0 40px rgba(34,197,94,0.4)" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ color: t1, fontSize: "19px", fontWeight: "900", marginBottom: "8px" }}>{copy.successTitle}</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6 }}>{copy.successSubtitle}</div>
          </>
        )}

        {step === "error-network" && (
          <>
            <div style={{ width: "64px", height: "64px", borderRadius: "20px", backgroundColor: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style={{ color: t1, fontSize: "18px", fontWeight: "900", marginBottom: "10px" }}>{copy.networkErrorTitle}</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "24px" }}>{copy.networkErrorBody}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={runLogout} style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer" }}>
                Réessayer
              </button>
              <button onClick={onClose} style={{ width: "100%", background: "none", border: `1px solid ${brd}`, color: t2, fontWeight: "700", fontSize: "14px", padding: "13px", borderRadius: "16px", cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
