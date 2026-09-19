"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { OnboardingChoixEcran } from "@/components/OnboardingChoixEcran";
import { OPTIONS_ACQUISITION } from "@/lib/onboardingPhase2";
import { updateAcquisitionCanal, marquerOnboardingTermine } from "../actions";

// Étape 4/4 (dernière) du parcours Onboarding Phase 2 (chantier
// 11/09/2026) — que cette étape soit remplie ou passée, elle marque la fin
// du parcours (users.onboarding_complete) pour ne jamais le re-montrer, et
// renvoie vers l'écran de bienvenue existant (?welcome=1).
export default function PremiersPasAcquisitionPage() {
  const router = useRouter();

  async function terminer() {
    try {
      const id = localStorage.getItem(YELEN224_USER_ID_KEY);
      const { data: { session } } = await supabase.auth.getSession();
      if (id && session?.access_token) await marquerOnboardingTermine(id, session.access_token);
    } catch {}
    router.push("/?welcome=1");
  }

  return (
    <OnboardingChoixEcran
      titre="Comment nous avez-vous connus ?"
      sousTitre="Champ facultatif mais ça nous aide à améliorer notre visibilité."
      options={OPTIONS_ACQUISITION}
      onSauvegarder={updateAcquisitionCanal}
      onContinuer={terminer}
      onPasser={terminer}
    />
  );
}
