"use client";

import { PrimaryButton } from "../ui";
import { useSignupTheme } from "../theme";
import { CreatedInstitution } from "../types";

export function SuccessStep({ institution, onGoToDashboard }: { institution: CreatedInstitution; onGoToDashboard: () => void }) {
  const C = useSignupTheme();

  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: `0 16px 40px ${C.gold}45`, animation: "signupSuccessPop 0.5s ease" }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>

      <h1 style={{ color: C.dark, fontSize: "24px", fontWeight: 900, letterSpacing: "-0.5px", marginBottom: "12px" }}>
        Votre espace Yelen est créé.
      </h1>
      <p style={{ color: C.gray, fontSize: "14.5px", lineHeight: 1.6, marginBottom: "8px" }}>
        Bienvenue, {institution.name}.
      </p>
      <p style={{ color: C.gray, fontSize: "14.5px", lineHeight: 1.6, marginBottom: "32px" }}>
        Nous allons maintenant vous accompagner pour le préparer avant son activation.
      </p>

      <PrimaryButton onClick={onGoToDashboard} C={C}>Préparer mon espace</PrimaryButton>

      <style>{`@keyframes signupSuccessPop{0%{transform:scale(0.8)}60%{transform:scale(1.08)}100%{transform:scale(1)}}`}</style>
    </div>
  );
}
