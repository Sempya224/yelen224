"use client";

// Points de pagination pour un carrousel à défilement horizontal
// (24/08/2026, retour Bryan) — extrait du pattern déjà en place sur
// "Pourquoi Yelen ?" (app/page.tsx) pour être réutilisé partout où il y a
// un scroll horizontal de plusieurs cartes, sans dupliquer la logique.
// La position active suit le défilement réel (scrollLeft), jamais un
// simple compteur fixe. N'affiche rien s'il n'y a qu'un seul élément
// (ou zéro) — jamais de pagination pour une seule carte.
import { useRef, useState } from "react";

export function useScrollDots(itemWidth: number, gap: number) {
  const [actif, setActif] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setActif(Math.round(el.scrollLeft / (itemWidth + gap)));
  }

  return { scrollRef, onScroll, actif };
}

export function ScrollDots({ count, actif, accent, inactif }: { count: number; actif: number; accent: string; inactif: string }) {
  if (count <= 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5px", marginTop: "10px" }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ width: i === actif ? "16px" : "6px", height: "6px", borderRadius: "3px", background: i === actif ? accent : inactif, transition: "width 0.2s ease, background 0.2s ease" }}/>
      ))}
    </div>
  );
}
