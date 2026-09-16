"use client";

// Yelen Security Activation (16/09/2026, décision Bryan) — après le sas de
// confiance de première connexion, l'utilisateur découvre d'abord son
// dashboard ; l'activation d'une protection MFA (TOTP OU Passkey, au choix)
// devient obligatoire 24h après cette première connexion. `bloquant=true` =
// écran plein écran non fermable (délai dépassé) ; `bloquant=false` = simple
// rappel dismissible (avant l'échéance), même composant, juste une porte de
// sortie en plus. Réutilise TotpSection/PasskeySection tels quels (self-scope,
// fonctionnent pour n'importe quel rôle).
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";
import { TotpSection } from "./TotpSection";
import { PasskeySection } from "./PasskeySection";

export function SecurityActivationGate({ bloquant, deadline, onToast, onActive, onFermer }: {
  bloquant: boolean;
  deadline: string | null;
  onToast: (msg: string, color?: string) => void;
  onActive: () => void;
  onFermer?: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [methode, setMethode] = useState<"choix" | "totp" | "passkey">("choix");
  const [verification, setVerification] = useState(false);

  async function verifierActivation() {
    setVerification(true);
    try {
      const res = await fetch("/api/institution/auth/security-activation-status");
      const j = await res.json().catch(() => null);
      if (res.ok && !j?.requise) { onActive(); return; }
      onToast("Pas encore activé — terminez la configuration ci-dessus.", C.orange);
    } finally {
      setVerification(false);
    }
  }

  const heuresRestantes = deadline ? Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 3600000)) : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: C.bg, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={bloquant ? C.red : C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>{bloquant ? <><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></> : <polyline points="9 12 11 14 15 10"/>}</svg>
          </div>
          <h1 style={{ color: C.t1, fontSize: "19px", fontWeight: 800, marginBottom: "6px" }}>
            {bloquant ? "Accès temporairement suspendu" : "Protégez votre compte Yelen"}
          </h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>
            {bloquant
              ? "Le délai de 24h pour sécuriser votre compte est dépassé. Activez une protection ci-dessous pour retrouver votre espace."
              : heuresRestantes !== null
                ? `Votre espace est prêt et déjà utilisable. Il vous reste ${heuresRestantes}h pour ajouter une protection à votre compte — une étape simple, mais essentielle pour garder votre accès en toute sécurité. Passé ce délai, votre accès à Yelen ne sera plus valable tant que cette protection n'aura pas été activée.`
                : "Votre espace est prêt et déjà utilisable. Il ne vous reste qu'une petite étape pour protéger durablement votre compte — sans elle, votre accès à Yelen finira par ne plus être valable."}
          </p>
        </div>

        {methode === "choix" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
            <button onClick={() => setMethode("totp")} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left", padding: "14px 16px", borderRadius: "14px", border: `1px solid ${C.border2}`, background: C.bgCard, cursor: "pointer" }}>
              <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 700 }}>Application d&apos;authentification</div>
                <div style={{ color: C.t3, fontSize: "11.5px" }}>Google Authenticator, Authy…</div>
              </div>
            </button>
            <button onClick={() => setMethode("passkey")} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left", padding: "14px 16px", borderRadius: "14px", border: `1px solid ${C.border2}`, background: C.bgCard, cursor: "pointer" }}>
              <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"><path d="M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/><path d="M11 11l-4 4-2-2M17 17l3 3"/></svg>
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 700 }}>Clé d&apos;accès (Passkey)</div>
                <div style={{ color: C.t3, fontSize: "11.5px" }}>Empreinte, visage ou code de l&apos;appareil</div>
              </div>
            </button>
          </div>
        )}

        {methode !== "choix" && (
          <>
            <button onClick={() => setMethode("choix")} style={{ background: "none", border: "none", color: C.t3, fontSize: "12px", fontWeight: 700, cursor: "pointer", marginBottom: "12px", padding: 0 }}>← Choisir une autre méthode</button>
            <div style={{ marginBottom: "14px" }}>
              {methode === "totp" ? <TotpSection onToast={onToast} onChange={onActive} /> : <PasskeySection onToast={onToast} />}
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth loading={verification} onClick={verifierActivation}>
              {verification ? <YelenLoader size={16}/> : "J'ai terminé — vérifier mon activation"}
            </Button>
          </>
        )}

        {!bloquant && onFermer && methode === "choix" && (
          <button onClick={onFermer} style={{ display: "block", width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: "10px", marginTop: "4px" }}>
            Plus tard
          </button>
        )}
      </div>
    </div>
  );
}
