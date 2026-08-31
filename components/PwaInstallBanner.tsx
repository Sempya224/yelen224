"use client";

import { useEffect, useState } from "react";

// ============================================================
// Bandeau "Installer l'app" — onglet Accueil uniquement.
// Yelen224 n'a pas d'app native (App Store/Play Store) — décision Bryan
// 01/08/2026 : ce CTA déclenche une vraie installation PWA (beforeinstallprompt
// Android/Chrome, instructions manuelles iOS Safari), jamais un lien vers un
// store inexistant (ce pattern non fonctionnel avait déjà été retiré le
// 24/07/2026, voir CLAUDE.md). Se masque lui-même (retourne null) sur toute
// plateforme où il n'y a rien de réel à proposer (desktop, Firefox mobile,
// navigateurs iOS autres que Safari, déjà installé).
// ============================================================

export const PWA_BANNER_HEIGHT = 44; // px, hors safe-area-inset-top

// Pas de type DOM natif pour cet évènement.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "yelen224_pwa_install_dismissed";

const Ic = {
  Device: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  X:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

export function PwaInstallBanner({ t1, t2, card, brd, onEligibleChange }: {
  t1: string; t2: string; card: string; brd: string;
  onEligibleChange: (visible: boolean) => void;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosInstructionsOpen, setIosInstructionsOpen] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch { setDismissed(false); }

    const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standaloneMedia || iosStandalone);

    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    setIsIosSafari(isIOSDevice && !isOtherIosBrowser);

    // Enregistrement inconditionnel : souscrirePush() (lib/pushClient.ts)
    // n'enregistre /sw.js qu'après acceptation de la permission push, et
    // seulement pour les utilisateurs connectés — un visiteur non connecté
    // n'aurait donc jamais de service worker, condition d'installabilité
    // PWA manquante. Idempotent, sans danger si déjà enregistré ailleurs.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onBip(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    }
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const eligiblePlatform = !!deferredPrompt || isIosSafari;
  const shouldShow = dismissed === false && isStandalone === false && !installed && eligiblePlatform;

  useEffect(() => { onEligibleChange(shouldShow); }, [shouldShow, onEligibleChange]);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
      }
    } else if (isIosSafari) {
      setIosInstructionsOpen((o) => !o);
    }
  }

  function handleDismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  }

  if (!shouldShow) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 101, paddingTop: "env(safe-area-inset-top)", background: card, borderBottom: `1px solid ${brd}` }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      <div style={{ height: `${PWA_BANNER_HEIGHT}px`, padding: "0 14px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ color: "#F5A623", flexShrink: 0, display: "flex" }}>{Ic.Device()}</span>
        <div style={{ flex: 1, minWidth: 0, color: t1, fontSize: "12.5px", fontWeight: 700, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Installez Yelen224 sur votre écran d&apos;accueil
        </div>
        <button onClick={handleInstall} className="tap" style={{ background: "#F5A623", color: "#080812", border: "none", borderRadius: "20px", padding: "7px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          Installer
        </button>
        <button onClick={handleDismiss} aria-label="Fermer" className="tap" style={{ background: "none", border: "none", padding: "4px", cursor: "pointer", color: t2, flexShrink: 0 }}>
          {Ic.X()}
        </button>
      </div>
      {isIosSafari && iosInstructionsOpen && (
        <div style={{ padding: "0 14px 10px 42px", color: t2, fontSize: "11.5px", lineHeight: 1.4 }}>
          Appuyez sur <strong style={{ color: t1 }}>Partager</strong> (icône carrée avec une flèche) puis <strong style={{ color: t1 }}>&quot;Sur l&apos;écran d&apos;accueil&quot;</strong>.
        </div>
      )}
    </div>
  );
}
