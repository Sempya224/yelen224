"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

// Bouton "Haut de page" du Centre légal (retour Bryan 23/09/2026, ajusté
// le même jour : apparaît dès le début du scroll, pas seulement en bas
// de page) — visible dès que la page est scrollée de quelques centaines
// de pixels. Masqué sur les pages trop courtes pour avoir un vrai
// scroll (rien à "remonter").
const SEUIL_SCROLL_PX = 200;
const HAUTEUR_SCROLLABLE_MIN_PX = 200;

export function LegalScrollToTop() {
  const { theme } = useTheme();
  const C = T[theme];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function calculer() {
      const hauteurScrollable = document.documentElement.scrollHeight - window.innerHeight;
      const aScrolle = hauteurScrollable > HAUTEUR_SCROLLABLE_MIN_PX
        && window.scrollY >= SEUIL_SCROLL_PX;
      setVisible(aScrolle);
    }
    calculer();
    window.addEventListener("scroll", calculer, { passive: true });
    window.addEventListener("resize", calculer);
    return () => {
      window.removeEventListener("scroll", calculer);
      window.removeEventListener("resize", calculer);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Retourner en haut de la page"
      style={{
        position: "fixed",
        right: "20px",
        bottom: "calc(20px + env(safe-area-inset-bottom))",
        zIndex: 90,
        width: "44px", height: "44px", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        cursor: "pointer",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </svg>
    </button>
  );
}
