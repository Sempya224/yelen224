"use client";

// Gabarit de défilement des modales à en-tête et pied fixes (fiche « Détails
// du RDV », « Préparer la venue »). UN seul élément défile — celui-ci — et il
// s'étend sur toute la hauteur entre l'en-tête et le pied, la barre de
// défilement touchant le bord droit de la modale : aucun padding sur
// l'élément qui défile (le padding vit dans son contenu), aucun défilement
// imbriqué. Le parent doit être un conteneur flex en colonne, `overflow:
// hidden`, avec une hauteur maximale.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ThemeTokens } from "../theme";

// Verrouillage du défilement de la page derrière une modale. Compteur : deux
// modales empilées (fiche + « Préparer la venue ») ne se marchent pas dessus,
// la valeur d'origine n'est restaurée qu'à la fermeture de la dernière.
let verrous = 0;
let overflowPrecedent = "";
export function useVerrouillageDefilement(): void {
  useEffect(() => {
    if (verrous === 0) {
      overflowPrecedent = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    verrous++;
    return () => {
      verrous--;
      if (verrous === 0) document.body.style.overflow = overflowPrecedent;
    };
  }, []);
}

// Luminance approximative d'un « #RRGGBB » : sert uniquement à choisir la
// couleur du curseur (gray-300/400 en clair, équivalents translucides en sombre).
function estSombre(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map(x => parseInt(x, 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

export function ZoneDefilement({ C, label, children }: { C: ThemeTokens; label: string; children: ReactNode }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const contenuRef = useRef<HTMLDivElement>(null);
  const [indices, setIndices] = useState({ haut: false, bas: false });

  const mettreAJour = useCallback(() => {
    const z = zoneRef.current;
    if (!z) return;
    const haut = z.scrollTop > 0;
    const bas = z.scrollTop + z.clientHeight < z.scrollHeight - 1;
    setIndices(prev => (prev.haut === haut && prev.bas === bas ? prev : { haut, bas }));
  }, []);

  // ResizeObserver déclenche aussi un premier appel à l'observation, et à
  // chaque changement de taille de la zone (fenêtre, clavier mobile) ou du
  // contenu (historique chargé, texte déplié). Le rappel est asynchrone :
  // pas de setState synchrone dans l'effet.
  useEffect(() => {
    const z = zoneRef.current;
    const c = contenuRef.current;
    if (!z || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(mettreAJour);
    ro.observe(z);
    if (c) ro.observe(c);
    window.addEventListener("resize", mettreAJour);
    return () => { ro.disconnect(); window.removeEventListener("resize", mettreAJour); };
  }, [mettreAJour]);

  const sombre = estSombre(C.bgCard);
  const curseur = sombre ? "rgba(255,255,255,0.24)" : "#D1D5DB"; // gray-300
  const curseurSurvol = sombre ? "rgba(255,255,255,0.4)" : "#9CA3AF"; // gray-400
  const ombre = (sens: "haut" | "bas") => ({
    position: "absolute" as const, left: 0, right: "10px", height: "12px", pointerEvents: "none" as const,
    [sens === "haut" ? "top" : "bottom"]: 0,
    background: `linear-gradient(${sens === "haut" ? "to bottom" : "to top"}, ${C.bgCard}, transparent)`,
    opacity: sens === "haut" ? (indices.haut ? 1 : 0) : (indices.bas ? 1 : 0),
    transition: "opacity 0.15s ease", zIndex: 1,
  });

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <style>{`
        .yz-scroll{overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:${curseur} transparent}
        .yz-scroll::-webkit-scrollbar{width:10px}
        .yz-scroll::-webkit-scrollbar-track{background:transparent}
        .yz-scroll::-webkit-scrollbar-thumb{background:${curseur};border-radius:8px;border:2px solid transparent;background-clip:content-box}
        .yz-scroll::-webkit-scrollbar-thumb:hover{background:${curseurSurvol};background-clip:content-box}
        .yz-scroll:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      `}</style>
      <div ref={zoneRef} className="yz-scroll" role="region" aria-label={label} tabIndex={0} onScroll={mettreAJour} style={{ flex: 1, minHeight: 0 }}>
        <div ref={contenuRef}>{children}</div>
      </div>
      <div aria-hidden="true" style={ombre("haut")}/>
      <div aria-hidden="true" style={ombre("bas")}/>
    </div>
  );
}
