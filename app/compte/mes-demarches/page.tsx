import { Suspense } from "react";
import { MesDemarchesClient } from "./mes-demarches-client";

// Suspense requis dès que MesDemarchesClient lit useSearchParams() (deep
// link ?id= depuis la carte "Vos démarches en cours" de l'accueil,
// 24/08/2026) — piège déjà rencontré ailleurs dans le projet : sans ce
// wrapper, le build Netlify casse au prerendering (invisible à tsc).
export default function Page() {
  return (
    <Suspense>
      <MesDemarchesClient />
    </Suspense>
  );
}
