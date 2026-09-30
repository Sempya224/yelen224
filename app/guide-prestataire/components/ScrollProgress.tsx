"use client";

import { useEffect, useRef, useState } from "react";

// Repère de scroll vertical (retour Bryan 23/09/2026, revu même jour sur
// retour visuel DoorDash) — un vrai "pouce" de scrollbar (taille
// proportionnelle à la portion de page visible, position proportionnelle
// au défilement), pas une barre qui se remplit de 0 à 100%. Fixe et
// toujours visible sur PC ; sur mobile, s'efface après une courte
// inactivité et réapparaît au moindre scroll (économie d'espace/attention
// sur petit écran, cohérent avec le comportement natif des scrollbars
// overlay mobiles).
const DELAI_MASQUAGE_MOBILE_MS = 1200;

export function ScrollProgress() {
  const [thumb, setThumb] = useState({ top: 0, height: 100 });
  const [visible, setVisible] = useState(true);
  const masquageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function estDesktop() {
      return window.matchMedia("(min-width: 1024px)").matches;
    }

    function calculer() {
      const hauteurDoc = document.documentElement.scrollHeight;
      const hauteurVue = window.innerHeight;
      const hauteurDisponible = hauteurDoc - hauteurVue;

      if (hauteurDisponible <= 0) {
        setThumb({ top: 0, height: 100 });
      } else {
        const hauteurPct = Math.max(10, (hauteurVue / hauteurDoc) * 100);
        const progression = Math.min(1, Math.max(0, window.scrollY / hauteurDisponible));
        const topPct = progression * (100 - hauteurPct);
        setThumb({ top: topPct, height: hauteurPct });
      }

      if (estDesktop()) {
        setVisible(true);
        if (masquageTimer.current) clearTimeout(masquageTimer.current);
        return;
      }

      setVisible(true);
      if (masquageTimer.current) clearTimeout(masquageTimer.current);
      masquageTimer.current = setTimeout(() => setVisible(false), DELAI_MASQUAGE_MOBILE_MS);
    }

    calculer();
    window.addEventListener("scroll", calculer, { passive: true });
    window.addEventListener("resize", calculer);
    return () => {
      window.removeEventListener("scroll", calculer);
      window.removeEventListener("resize", calculer);
      if (masquageTimer.current) clearTimeout(masquageTimer.current);
    };
  }, []);

  return (
    <div
      className={`hc-scroll-progress${visible ? "" : " hc-scroll-progress--masquee"}`}
      aria-hidden="true"
    >
      <div
        className="hc-scroll-progress__fill"
        style={{ top: `${thumb.top}%`, height: `${thumb.height}%` }}
      />
    </div>
  );
}
