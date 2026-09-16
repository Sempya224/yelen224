"use client";

import { useRouter } from "next/navigation";
import { OnboardingChoixEcran } from "@/components/OnboardingChoixEcran";
import { OPTIONS_USAGE } from "@/lib/onboardingPhase2";
import { updateUsageIntentions } from "../actions";

// Étape 2/4 du parcours Onboarding Phase 2 (chantier 11/09/2026). Étapes
// 3-4 (Attentes/Acquisition) pas encore construites — inscription reste
// sur l'ancienne redirection tant que la chaîne n'est pas complète.
export default function PremiersPasUsagePage() {
  const router = useRouter();
  const suivant = () => router.push("/premiers-pas/attentes");
  return (
    <OnboardingChoixEcran
      titre="Quels sont vos objectifs ?"
      sousTitre="Sélectionnez toutes les options qui s'appliquent."
      options={OPTIONS_USAGE}
      onSauvegarder={updateUsageIntentions}
      onContinuer={suivant}
      onPasser={suivant}
    />
  );
}
