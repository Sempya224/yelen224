"use client";

import { useEffect, useState } from "react";
import { YelenLogo } from "@/components/YelenLogo";

// Écran de lancement — couvre le flash constaté à l'ouverture de l'app
// (avant que globals.css/l'hydratation React ne posent le fond réel).
// Fond doré de marque (retour Bryan 27/07/2026 : "branding Yelen jaune
// fond") — fixe, indépendant du thème clair/sombre choisi par
// l'utilisateur (un splash de marque ne doit pas dépendre d'un état pas
// encore résolu à ce stade, ThemeProvider n'a pas encore lu localStorage).
// Doré plat #F5A623 (09/08/2026, retour Bryan) — plus de dégradé, cohérent
// avec l'aplatissement des CTA fait le même jour ailleurs dans l'app.
// ⚠️ Le doré n'est plus dupliqué sur html/body (app/layout.tsx) — retiré le
// 29/07/2026, cette duplication débordait en bas de plusieurs écrans une
// fois l'app pleinement chargée (viewport dynamique iOS plus grand que le
// contenu). Ce composant, seul, couvre déjà tout l'écran (position:fixed,
// inset:0) pendant la fenêtre de chargement — suffisant pour éviter le
// flash d'une autre couleur avant hydratation.
// Logo fixe (YelenLogo, pas d'animation) + petit indicateur de chargement
// distinct en bas (retour Bryan 02/10/2026) — identité ≠ état technique.
// ⚠️ Exception volontaire à la règle "un seul loader dans toute l'app, le
// soleil qui tourne" (décision CEO 26/07/2026, voir YelenLoader.tsx) :
// cette règle reste valable partout ailleurs, seul ce splash s'en écarte.
// Rendu côté serveur avec opacité 1 dès le HTML initial (composant client
// mais toujours SSR par défaut) : aucune fenêtre où une autre couleur
// peut passer, contrairement à un overlay monté uniquement après
// hydratation.
export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const startFade = setTimeout(() => setFading(true), 700);
    const unmount = setTimeout(() => setVisible(false), 1050);
    return () => { clearTimeout(startFade); clearTimeout(unmount); };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#F5A623",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.35s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLogo size={76} color="#080812" strokeWidth={2.4} />
      </div>
      <div style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: "6px" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="yelen-splash-dot"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#080812",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        .yelen-splash-dot { animation: yelenSplashDot 1s ease-in-out infinite; }
        @keyframes yelenSplashDot {
          0%, 80%, 100% { opacity: 0.25; }
          40% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .yelen-splash-dot { animation: none !important; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
