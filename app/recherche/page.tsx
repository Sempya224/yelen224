"use client";

import { Suspense } from "react";
import { YelenLoader } from "@/components/YelenLoader";
import { RechercheInner } from "./RechercheInner";

// Route standalone /recherche — reste le point d'entrée réel pour tous les
// liens existants (barre "Trouver un professionnel", QuickActions, grille
// Services, CTA divers). La logique elle-même vit désormais dans
// RechercheInner.tsx (extraite le 09/08/2026 pour être réutilisable comme
// onglet embarqué dans app/page.tsx — Next.js interdit les exports nommés
// supplémentaires depuis un fichier page.tsx, d'où l'extraction plutôt
// qu'un export direct depuis ce fichier). embedded=false par défaut :
// comportement 100% inchangé ici.
export default function RecherchePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100svh", backgroundColor: "#07071a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={36}/>
      </div>
    }>
      <RechercheInner/>
    </Suspense>
  );
}
