"use client";

import { PrimaryButton, StepHeading } from "../ui";
import { useSignupTheme } from "../theme";

const BESOINS = [
  "Votre numéro de téléphone",
  "Quelques informations sur votre activité",
  "Les informations du responsable",
  "Vos informations professionnelles",
];

function CheckIcon({ color }: { color: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function ClockIcon({ color }: { color: string }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
}

export function IntroStep({ onStart }: { onStart: () => void }) {
  const C = useSignupTheme();

  return (
    <div>
      <StepHeading title="Créez votre espace professionnel" subtitle="Nous allons vous guider en quelques étapes pour présenter votre activité sur Yelen." C={C}/>

      <div style={{ marginBottom: "20px" }}>
        <div style={{ color: C.dark2, fontSize: "11px", fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "12px" }}>Vous aurez besoin de</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {BESOINS.map(b => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ flexShrink: 0, width: "26px", height: "26px", borderRadius: "8px", backgroundColor: C.goldBg2, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckIcon color={C.gold}/>
              </div>
              <span style={{ color: C.dark2, fontSize: "13.5px", fontWeight: 600 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "13px 16px", backgroundColor: C.goldBg2, border: `1.5px solid ${C.border}`, borderRadius: "14px", marginBottom: "24px" }}>
        <ClockIcon color={C.gold}/>
        <div>
          <div style={{ color: C.dark, fontSize: "12.5px", fontWeight: 800 }}>Temps estimé</div>
          <div style={{ color: C.gray, fontSize: "12px" }}>Quelques minutes</div>
        </div>
      </div>

      <PrimaryButton onClick={onStart} C={C}>Commencer</PrimaryButton>
    </div>
  );
}
