"use client";

// Flux de déconnexion institution — remplace deconnexion() (page.tsx, header
// "...") et handleLogout() (ParametresTab.tsx, ParametresDangerZone), deux
// implémentations divergentes sans confirmation ni écran de transition/succès.
// Même mécanique que components/LogoutFlow.tsx côté citoyen (contrat
// LogoutFlowCopy partagé), mais utilisé aussi sur desktop — l'étape de
// confirmation suit donc le schéma responsive déjà établi par
// MesClientsTab.tsx (.client-fiche-overlay/panel/grip/close-x, renommé ici
// .logout-confirm-*) : bottom-sheet mobile, dialogue centré ≥1024px.
// Les étapes transition/succès n'ont pas cette scission (prise de contrôle
// plein écran sans action de fermeture), même traitement que l'écran de
// suppression de compte déjà présent dans ParametresDangerZone.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import type { LogoutFlowCopy } from "@/lib/logoutFlowTypes";
import { YelenLoader } from "@/components/YelenLoader";

export const INSTITUTION_LOGOUT_COPY: LogoutFlowCopy = {
  confirmTitle: "Quitter votre espace Yelen ?",
  confirmBody: "Vous allez fermer la session de votre établissement sur cet appareil. Toutes les données déjà enregistrées restent disponibles à votre prochaine connexion.",
  confirmCancelLabel: "Continuer ma session",
  confirmConfirmLabel: "Se déconnecter",
  transitioningTitle: "Déconnexion en cours…",
  transitioningSubtitle: "Nous sécurisons votre session avant de fermer votre espace de travail.",
  successTitle: "Déconnexion réussie",
  successSubtitle: "Votre session a été fermée en toute sécurité. À bientôt sur Yelen224.",
  networkErrorTitle: "Impossible de terminer la déconnexion",
  networkErrorBody: "Vérifiez votre connexion Internet puis réessayez.",
};

type Step = "confirm" | "transitioning" | "success" | "error-network";

const MIN_TRANSITION_MS = 600;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function logoutInstitutionStrict(): Promise<void> {
  const res = await fetch("/api/institution/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error("logout_failed");
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
  const C = T[theme] as ThemeTokens;
  const [step, setStep] = useState<Step>("confirm");

  async function runLogout() {
    setStep("transitioning");
    try {
      await Promise.all([logoutInstitutionStrict(), delay(MIN_TRANSITION_MS)]);
      setStep("success");
      setTimeout(() => router.push(redirectTo), 1000);
    } catch {
      setStep("error-network");
    }
  }

  if (step === "confirm") {
    return (
      <div
        className="logout-confirm-overlay"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}
      >
        <style>{`
          @media(min-width:1024px){
            .logout-confirm-overlay{align-items:center!important}
            .logout-confirm-panel{max-width:440px!important;border-radius:20px!important}
            .logout-confirm-grip{display:none!important}
            .logout-confirm-close-x{display:flex!important}
          }
        `}</style>
        <div onClick={e => e.stopPropagation()} className="logout-confirm-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 24px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
          <div className="logout-confirm-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
          <button onClick={onClose} className="logout-confirm-close-x tap" aria-label="Fermer" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `${C.gold}20`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9.5 12.5l1.8 1.8 3.2-3.6"/>
            </svg>
          </div>
          <div style={{ color: C.t1, fontSize: "18px", fontWeight: "800", textAlign: "center", marginBottom: "8px" }}>{copy.confirmTitle}</div>
          <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, textAlign: "center", marginBottom: "24px" }}>{copy.confirmBody}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "10px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onClose}>{copy.confirmCancelLabel}</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={runLogout}>{copy.confirmConfirmLabel}</Button>
          </div>
        </div>
      </div>
    );
  }

  // transitioning / success / error-network — prise de contrôle plein écran,
  // même convention que l'écran de suppression de ParametresDangerZone.
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <style>{`@keyframes logoutProgress{from{width:8%}to{width:92%}}`}</style>
      <div style={{ maxWidth: "360px", width: "100%", textAlign: "center" }}>
        {step === "transitioning" && (
          <>
            <div style={{ display: "flex", justifyContent: "center", margin: "0 auto 22px" }}><YelenLoader size={56} color={C.gold}/></div>
            <div style={{ color: C.t1, fontSize: "19px", fontWeight: "800", marginBottom: "8px" }}>{copy.transitioningTitle}</div>
            <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "24px" }}>{copy.transitioningSubtitle}</div>
            <div style={{ height: "4px", borderRadius: "2px", backgroundColor: C.bg3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "2px", backgroundColor: C.gold, animation: "logoutProgress 1.4s ease forwards" }}/>
            </div>
          </>
        )}
        {step === "success" && (
          <>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: C.green, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", marginBottom: "8px" }}>{copy.successTitle}</div>
            <div style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.6 }}>{copy.successSubtitle}</div>
          </>
        )}
        {step === "error-network" && (
          <>
            <div style={{ width: "64px", height: "64px", borderRadius: "16px", backgroundColor: C.redL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style={{ color: C.t1, fontSize: "18px", fontWeight: "800", marginBottom: "10px" }}>{copy.networkErrorTitle}</div>
            <div style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "24px" }}>{copy.networkErrorBody}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={runLogout}>Réessayer</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={onClose}>Annuler</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
