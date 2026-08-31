"use client";

import { useEffect, useState } from "react";
import { YelenLoader } from "@/components/YelenLoader";

// Écran de lancement façon Meta ("from Meta" sous le logo Instagram/WhatsApp
// au démarrage, épinglé en bas d'écran plutôt que collé au logo) — couvre
// le flash constaté à l'ouverture de l'app (avant que globals.css/
// l'hydratation React ne posent le fond réel).
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
// Logo = YelenLoader (le soleil qui tourne, indicateur de marque unique
// du projet) plutôt que l'icône PNG statique — cohérent avec "on charge",
// jamais un second indicateur de chargement inventé pour cet écran.
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
        <YelenLoader size={76} color="#080812" />
      </div>
      <div style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
        <span style={{ color: "#080812", fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em" }}>from</span>
        <span style={{ color: "#C81E3A", fontSize: "14px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>SemPya224</span>
      </div>
    </div>
  );
}
