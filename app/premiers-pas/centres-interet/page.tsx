"use client";

import { useRouter } from "next/navigation";
import { InteretsClient } from "@/app/menu/interets/interets-client";

// Étape 1/4 du parcours Onboarding Phase 2/3 (chantier 11/09/2026),
// déclenché juste après inscription. Étapes 2-4 (Usage/Attentes/
// Acquisition) pas encore construites — app/inscription/page.tsx reste
// volontairement sur l'ancienne redirection jusqu'à ce que la chaîne
// complète soit prête.
export default function PremiersPasCentresInteretPage() {
  const router = useRouter();
  const suivant = () => router.push("/premiers-pas/usage");
  return <InteretsClient wizard={{ onContinuer: suivant, onPasser: suivant }} />;
}
