"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorBanner, PrimaryButton, SecondaryButton, StepHeading } from "../ui";
import { useSignupTheme } from "../theme";
import { SignupState } from "../types";

function humanizeVerifyError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "LOCKED": return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "INVALID_CODE": return "Ce code ne semble pas correspondre. Vérifiez les chiffres ou demandez un nouveau code.";
    default: return fallback || "Ce code ne semble pas correspondre. Vérifiez les chiffres ou demandez un nouveau code.";
  }
}

function maskPhone(phone: string): string {
  return phone.replace(/(\+224)(\d{2})(\d{3})(\d{4})/, "$1 $2•••$4");
}

export function VerificationStep({ state, updateState, onVerified, onEditPhone }: {
  state: SignupState;
  updateState: (patch: Partial<SignupState>) => void;
  onVerified: () => void;
  onEditPhone: () => void;
}) {
  const C = useSignupTheme();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(60);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer(v => Math.max(v - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  useEffect(() => { otpRefs.current[0]?.focus(); }, []);

  async function handleVerify(code: string) {
    if (code.length < 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/institution/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: state.phone, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(humanizeVerifyError(data.code, data.error));
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        setLoading(false);
        return;
      }

      // verify-otp ne supprime pas la ligne institution_otp en flux
      // inscription (correctif Lot 02) : /register refait la même
      // vérification plus tard avec le même code, potentiellement plusieurs
      // écrans après. Ne jamais changer ce comportement côté serveur.
      updateState({ phoneVerified: true, verifiedCode: code });
      onVerified();
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError("");
    try {
      const res = await fetch("/api/institution/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: state.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Un souci est survenu lors de l'envoi du code. Réessayez dans un instant.");
        setResending(false);
        return;
      }
      setResendTimer(60);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch {
      setError("Petit souci de connexion. Vérifiez votre réseau et réessayez.");
    }
    setResending(false);
  }

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...otp]; n[i] = val.slice(-1); setOtp(n);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
    if (n.every(d => d) && n.join("").length === 6) setTimeout(() => handleVerify(n.join("")), 150);
  };
  const handleOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  return (
    <div>
      <StepHeading
        title="Vérifiez votre numéro"
        subtitle={<>Nous avons envoyé un code à <strong style={{ color: C.dark }}>{maskPhone(state.phone)}</strong>.</>}
        C={C}
      />

      <div role="group" aria-label="Code de vérification à 6 chiffres" style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "20px" }}>
        {otp.map((d, i) => (
          <input key={i} ref={el => { otpRefs.current[i] = el; }}
            type="text" inputMode="numeric" maxLength={1} value={d}
            aria-label={`Chiffre ${i + 1} sur 6`}
            onChange={e => handleOtpChange(i, e.target.value)}
            onKeyDown={e => handleOtpKey(i, e)}
            style={{ width: "48px", height: "58px", textAlign: "center", fontSize: "22px", fontWeight: 800, backgroundColor: d ? C.goldBg2 : C.card, border: `2px solid ${d ? C.gold : C.border}`, borderRadius: "14px", color: C.dark, transition: "all 0.15s" }}
          />
        ))}
      </div>

      {error && <ErrorBanner msg={error} C={C}/>}

      <PrimaryButton onClick={() => handleVerify(otp.join(""))} disabled={otp.join("").length < 6} loading={loading} loadingLabel="Vérification…" C={C}>
        Continuer
      </PrimaryButton>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginTop: "16px" }}>
        {resendTimer > 0
          ? <span style={{ color: C.gray, fontSize: "13px" }}>Renvoyer dans {resendTimer}s</span>
          : <SecondaryButton onClick={handleResend} C={C}>{resending ? "Envoi…" : "Renvoyer le code"}</SecondaryButton>
        }
        <SecondaryButton onClick={onEditPhone} C={C}>Modifier le numéro</SecondaryButton>
      </div>
    </div>
  );
}
