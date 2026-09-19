"use client";

import { useRouter } from "next/navigation";
import { OnboardingChoixEcran } from "@/components/OnboardingChoixEcran";
import { OPTIONS_ATTENTES } from "@/lib/onboardingPhase2";
import { updateAttentes } from "../actions";

// Étape 3/4 du parcours Onboarding Phase 2 (chantier 11/09/2026).
export default function PremiersPasAttentesPage() {
  const router = useRouter();
  const suivant = () => router.push("/premiers-pas/acquisition");
  return (
    <OnboardingChoixEcran
      titre="Comment Yelen peut vous aider ?"
      sousTitre="Sélectionnez les avantages que vous recherchez en priorité."
      options={OPTIONS_ATTENTES}
      onSauvegarder={updateAttentes}
      onContinuer={suivant}
      onPasser={suivant}
    />
  );
}
