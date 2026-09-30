"use client";

import { useEffect, useState } from "react";

export type InstitutionAccount = {
  role: "invite" | "institution";
  nomCompte: string | null;
  dashboardHref: string | null;
};

// Détection session institution pour le Centre d'aide prestataires (retour
// Bryan 30/09/2026 : "pareil pour Help Center côté institution" — même
// traitement Guest/Authenticated que app/(legal)/_components/LegalHeader.tsx).
// Cette surface est 100% prestataire (contrairement au Centre légal, jamais
// de branche citoyen ici). Session JWT custom (cookie httpOnly, invisible
// en localStorage), d'où cet appel réseau plutôt qu'une simple lecture
// synchrone — 401 silencieux = vrai visiteur, pas une erreur à logger.
// Partagé par HeaderBrand.tsx et HeaderAccountAction.tsx pour ne jamais
// dupliquer cet appel dans le header.
export function useInstitutionAccount(): InstitutionAccount {
  const [role, setRole] = useState<"invite" | "institution">("invite");
  const [nomCompte, setNomCompte] = useState<string | null>(null);
  const [dashboardHref, setDashboardHref] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/institution/auth/me");
        if (!res.ok) return;
        const json = await res.json();
        setRole("institution");
        setNomCompte(json.name || null);
        if (json.slug && json.institutionId) setDashboardHref(`/${json.slug}/${json.institutionId}`);
      } catch {}
    })();
  }, []);

  return { role, nomCompte, dashboardHref };
}
