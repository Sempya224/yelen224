"use client";

import Link from "next/link";
import { useInstitutionAccount } from "./useInstitutionAccount";

// CTA acquisition (retour Bryan 23/09/2026) — toujours après SupportCallout :
// le visiteur voit d'abord la sortie "support humain", puis seulement
// ensuite l'invitation à rejoindre/se connecter à Yelen224. Réutilise les
// routes existantes (/institution/connexion, /institution/inscription) —
// aucun nouveau flux d'authentification créé ici.
//
// Masqué si institution déjà authentifiée (retour Bryan 19/10/2026) — ce
// CTA n'a aucun sens pour quelqu'un qui a déjà un compte et une session
// active ; même hook/même logique Guest/Authenticated que Header.tsx
// (role initial "invite" le temps de l'appel réseau, donc un visiteur
// authentifié peut voir le CTA une fraction de seconde avant qu'il
// disparaisse — comportement déjà accepté pour le header, pas un bug ici).
export function InstitutionCta() {
  const { role } = useInstitutionAccount();
  if (role === "institution") return null;

  return (
    <div className="hc-card hc-institution-cta" style={{ marginTop: "16px" }}>
      <div className="hc-institution-cta__body">
        <p className="hc-institution-cta__title">Nouveau sur Yelen224 ?</p>
        <p className="hc-institution-cta__text">
          Créez votre compte pour rejoindre la plateforme.
        </p>
      </div>
      <div className="hc-institution-cta__actions">
        <Link href="/institution/inscription" className="hc-institution-cta__btn hc-institution-cta__btn--primary">
          Créer un compte
        </Link>
        <Link href="/institution/connexion" className="hc-institution-cta__btn">
          J&apos;ai déjà un compte
        </Link>
      </div>
    </div>
  );
}
