"use client";

import { Suspense } from "react";
import { YelenLoader } from "@/components/YelenLoader";
import { SignupEngine } from "./engine/SignupEngine";

// Nouveau moteur d'inscription (Lot 03-B, bascule validée par Bryan le
// 15/08/2026) — remplace l'ancien formulaire monolithique à étapes fixes.
// Le parcours réel vit dans ./engine/ (SignupEngine + steps/), construit et
// validé sur l'ancienne route temporaire /institution/inscription-preview
// (retirée à cette bascule). useSearchParams() dans SignupEngine exige
// cette frontière Suspense (piège déjà documenté dans le projet).
export default function InstitutionInscriptionPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={36}/>
      </div>
    }>
      <SignupEngine/>
    </Suspense>
  );
}
