"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SignupShell } from "./SignupShell";
import { useSignupTheme } from "./theme";
import { loadSignupState, saveSignupState, clearSignupState } from "./storage";
import { CreatedInstitution, EMPTY_SIGNUP_STATE, SignupState, STEP_ORDER, StepId, furthestReachableStep, isStepReachable } from "./types";
import { IntroStep } from "./steps/IntroStep";
import { PhoneStep } from "./steps/PhoneStep";
import { VerificationStep } from "./steps/VerificationStep";
import { ResponsableStep } from "./steps/ResponsableStep";
import { ActiviteStep } from "./steps/ActiviteStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SuccessStep } from "./steps/SuccessStep";

function isValidStepId(v: string | null): v is StepId {
  return v !== null && (STEP_ORDER as string[]).includes(v);
}

// Orchestrateur du moteur d'inscription (Lot 03-B). Route et progression
// pilotées par ?step=... (section 15 du brief) mais jamais comme source de
// vérité : chaque étape n'est atteignable que si isStepReachable() le
// confirme à partir de l'état réel (téléphone vérifié, responsable rempli,
// etc.) — une URL modifiée à la main ne débloque rien côté client, et
// chaque contrat serveur (OTP, register) revalide de toute façon tout
// lui-même (section 24 du brief : le client orchestre, le serveur décide).
export function SignupEngine() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<SignupState>(EMPTY_SIGNUP_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [justResumed, setJustResumed] = useState(false);
  const [activiteFocusSubStep, setActiviteFocusSubStep] = useState<"categorie" | "activite" | "statut" | "presentation" | undefined>(undefined);

  // sessionStorage n'existe pas côté serveur — hydratation après montage
  // uniquement (évite tout mismatch d'hydratation React), voir storage.ts.
  // IIFE async (même convention que le useEffect de vérification "appareil
  // mémorisé" de app/institution/connexion/page.tsx) : évite l'avertissement
  // react-hooks/set-state-in-effect sur un setState synchrone en tête d'effet.
  useEffect(() => {
    (async () => {
      const loaded = loadSignupState();
      const hadProgress = loaded.otpSent || loaded.phoneVerified || loaded.responsable.prenom.trim() !== "";
      setState(loaded);
      setJustResumed(hadProgress);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSignupState(state);
  }, [hydrated, state]);

  function updateState(patch: Partial<SignupState>) {
    setState(prev => ({ ...prev, ...patch }));
  }

  function goToStep(step: StepId) {
    router.push(`${pathname}?step=${step}`);
  }

  const rawStep = searchParams.get("step");
  const requestedStep: StepId = isValidStepId(rawStep) ? rawStep : (hydrated ? furthestReachableStep(state) : "intro");
  // Une fois le compte créé, le parcours est terminal : un retour navigateur
  // ne doit plus jamais rouvrir Résumé (rejouerait /register sur un numéro
  // déjà enregistré) ni aucune étape antérieure — seul "success" reste valide.
  const currentStep: StepId = state.createdInstitution
    ? "success"
    : (isStepReachable(requestedStep, state) ? requestedStep : furthestReachableStep(state));

  // Corrige silencieusement l'URL si elle demande une étape non atteignable
  // (retour navigateur après un refresh qui a perdu l'avance, lien direct
  // trafiqué, etc.) — jamais un message d'erreur, juste la bonne étape.
  useEffect(() => {
    if (!hydrated) return;
    const target = `${pathname}?step=${currentStep}`;
    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (target !== current) router.replace(target);
  }, [hydrated, currentStep, pathname, router, searchParams]);

  function handleGoToDashboard() {
    if (!state.createdInstitution) return;
    clearSignupState();
    router.push(`/institution/${state.createdInstitution.id}/dashboard`);
  }

  function handleEditFromReview(step: "responsable" | "activite", activiteSubStep?: "categorie" | "activite" | "statut" | "presentation") {
    setJustResumed(false);
    if (step === "activite" && activiteSubStep) setActiviteFocusSubStep(activiteSubStep);
    goToStep(step);
  }

  function handleNav(step: StepId) {
    setJustResumed(false);
    goToStep(step);
  }

  const backTargets: Partial<Record<StepId, { onBack: () => void; label?: string }>> = {
    phone: { onBack: () => router.push("/institution/decouverte") },
    verification: { onBack: () => handleNav("phone") },
    responsable: { onBack: () => handleNav("verification") },
    activite: { onBack: () => handleNav("responsable") },
    review: { onBack: () => handleNav("activite") },
  };

  if (!hydrated) return null;

  // Carte élargie sur desktop (760px) pour les étapes au contenu plus riche
  // (grilles secteur/statut, blocs résumé) — les étapes formulaire simples
  // gardent 640px, même logique de proportion que connexion. "phone" ajoutée
  // (retour Bryan 07/09/2026) pour laisser la place à l'illustration réelle
  // dans sa colonne gauche (voir PhoneStep.tsx).
  const wideStep = currentStep === "activite" || currentStep === "review" || currentStep === "phone";

  return (
    <SignupShell onBack={backTargets[currentStep]?.onBack} backLabel={backTargets[currentStep]?.label} wide={wideStep} hideClose={currentStep === "success"}>
      <ResumeBanner visible={justResumed && currentStep !== "intro" && currentStep !== "success"}/>

      {currentStep === "intro" && (
        <IntroStep onStart={() => handleNav("phone")}/>
      )}

      {currentStep === "phone" && (
        <PhoneStep updateState={updateState} onVerified={() => goToStep("verification")}/>
      )}

      {currentStep === "verification" && (
        <VerificationStep state={state} updateState={updateState} onVerified={() => goToStep("responsable")} onEditPhone={() => handleNav("phone")}/>
      )}

      {currentStep === "responsable" && (
        <ResponsableStep state={state} updateState={updateState} onNext={() => goToStep("activite")}/>
      )}

      {currentStep === "activite" && (
        <ActiviteStep state={state} updateState={updateState} onNext={() => goToStep("review")} initialSubStep={activiteFocusSubStep}/>
      )}

      {currentStep === "review" && (
        <ReviewStep
          state={state}
          onEdit={handleEditFromReview}
          onRestartPhone={() => { setJustResumed(false); goToStep("phone"); }}
          onCreated={(institution: CreatedInstitution) => {
            setState(prev => ({ ...prev, createdInstitution: institution }));
            goToStep("success");
          }}
        />
      )}

      {currentStep === "success" && state.createdInstitution && (
        <SuccessStep institution={state.createdInstitution} onGoToDashboard={handleGoToDashboard}/>
      )}
    </SignupShell>
  );
}

function ResumeBanner({ visible }: { visible: boolean }) {
  const C = useSignupTheme();
  if (!visible) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 14px", backgroundColor: C.goldBg2, border: `1px solid ${C.border}`, borderRadius: "12px", marginBottom: "20px" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
      <span style={{ color: C.dark, fontSize: "12.5px", fontWeight: 700 }}>Bon retour — vous reprenez là où vous en étiez.</span>
    </div>
  );
}
