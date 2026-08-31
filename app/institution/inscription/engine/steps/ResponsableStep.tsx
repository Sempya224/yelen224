"use client";

import { useState } from "react";
import { ErrorBanner, PrimaryButton, StepHeading, fieldLabelStyle, textInputStyle } from "../ui";
import { useSignupTheme } from "../theme";
import { SignupState } from "../types";

export function ResponsableStep({ state, updateState, onNext }: {
  state: SignupState;
  updateState: (patch: Partial<SignupState>) => void;
  onNext: () => void;
}) {
  const C = useSignupTheme();
  const [error, setError] = useState("");

  function handleNext() {
    setError("");
    if (!state.responsable.prenom.trim()) { setError("Le prénom est requis."); return; }
    if (!state.responsable.nom.trim()) { setError("Le nom est requis."); return; }
    onNext();
  }

  return (
    <div className="signup-split">
      <div className="signup-split-side">
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <StepHeading title="Qui sera responsable de cet espace ?" subtitle="Ces informations nous permettent de savoir avec qui Yelen échange au sujet de votre activité." C={C}/>
      </div>

      <div className="signup-split-body">
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
        <div>
          <label htmlFor="signup-resp-prenom" style={fieldLabelStyle(C)}>Prénom</label>
          <input id="signup-resp-prenom" type="text" placeholder="Ex : Mamadou" autoFocus
            value={state.responsable.prenom}
            onChange={e => updateState({ responsable: { ...state.responsable, prenom: e.target.value } })}
            style={textInputStyle(C)}
          />
        </div>
        <div>
          <label htmlFor="signup-resp-nom" style={fieldLabelStyle(C)}>Nom</label>
          <input id="signup-resp-nom" type="text" placeholder="Ex : Diallo"
            value={state.responsable.nom}
            onChange={e => updateState({ responsable: { ...state.responsable, nom: e.target.value } })}
            style={textInputStyle(C)}
          />
        </div>
        <div>
          <label htmlFor="signup-resp-role" style={fieldLabelStyle(C)}>Votre rôle (optionnel)</label>
          <input id="signup-resp-role" type="text" placeholder="Ex : Directeur, Gérant, Responsable accueil…"
            value={state.responsable.role}
            onChange={e => updateState({ responsable: { ...state.responsable, role: e.target.value } })}
            style={textInputStyle(C)}
          />
        </div>
      </div>

      {error && <ErrorBanner msg={error} C={C}/>}

      <PrimaryButton onClick={handleNext} C={C}>Continuer</PrimaryButton>
      </div>
    </div>
  );
}
