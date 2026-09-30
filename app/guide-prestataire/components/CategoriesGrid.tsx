"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Categorie } from "@/lib/helpCenter/types";

const VISIBLES_INITIALEMENT = 10;

// Grille "Catégories" de l'accueil (retour Bryan 23/09/2026, brief
// "organisation de la page d'accueil du Help Center") — Client Component
// réservé à l'interactivité Voir plus/Voir moins uniquement (CLAUDE.md
// /stack-specifique : Client Component pour l'interactivité, jamais pour
// les données) ; la liste déjà filtrée (0 article exclu, voir
// `getVisibleCategories`) et triée (`ordre`, champ de tri manuel) est
// calculée côté serveur dans page.tsx et reçue en props.
export function CategoriesGrid({ items }: { items: { categorie: Categorie; count: number }[] }) {
  const [toutAfficher, setToutAfficher] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const visibles = toutAfficher ? items : items.slice(0, VISIBLES_INITIALEMENT);
  const restantes = items.length - VISIBLES_INITIALEMENT;

  return (
    <>
      <div ref={gridRef} className="hc-categories-grid">
        {visibles.map(({ categorie: c, count: n }) => (
          <Link key={c.id} href={`/guide-prestataire/${c.id}`} className="hc-category-card">
            <span className="hc-category-card-text">
              <span className="hc-category-card-title">{c.titre}</span>
              <span className="hc-category-card-count">
                {n} article{n !== 1 ? "s" : ""}
              </span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hc-category-card-chevron">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </Link>
        ))}
      </div>

      {restantes > 0 && (
        <button
          type="button"
          className="hc-categories-more"
          aria-expanded={toutAfficher}
          onClick={() => {
            if (toutAfficher) {
              setToutAfficher(false);
              gridRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
            } else {
              setToutAfficher(true);
            }
          }}
        >
          {toutAfficher ? "Voir moins" : `Voir les ${restantes} autres catégories`}
        </button>
      )}
    </>
  );
}
