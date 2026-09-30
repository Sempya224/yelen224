"use client";

import { useRouter } from "next/navigation";

// Bouton retour icône seule (retour Bryan 23/09/2026, page Recherche) —
// renvoie à l'écran précédent (historique navigateur), pas à une
// destination fixe : nécessite un Client Component, `router.back()`
// n'existe pas côté serveur.
export function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="hc-back-icon-button"
      onClick={() => router.back()}
      aria-label="Retour à l'écran précédent"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}
