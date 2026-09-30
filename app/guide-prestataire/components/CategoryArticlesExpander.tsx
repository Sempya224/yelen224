"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArticleCard } from "./ArticleCard";
import type { Article, Categorie } from "@/lib/helpCenter/types";

// Retour Bryan 23/09/2026 (inspiré DoorDash for Business Help Center) —
// depuis une page article, un "+" à côté du fil d'Ariane déplie la liste
// des articles de la même catégorie sans quitter la page.
// ⚠️ Garde-fou "≥2 articles" temporairement retirée (23/09/2026, demande
// explicite de Bryan) pour prévisualiser le rendu malgré le corpus V1 où
// chaque catégorie n'a qu'un seul article publié — à remettre
// (`if (articles.length <= 1) return null;`) une fois la prévisualisation
// faite, sinon le "+" reste visible même sans rien d'autre à montrer.
// Panneau en popover flottant (retour Bryan 23/09/2026) — position absolue
// ancrée au déclencheur, jamais dans le flux normal : la liste ne doit pas
// pousser le reste de la page vers le bas. Fermeture au clic extérieur.
export function CategoryArticlesExpander({
  categorie,
  articles,
  currentArticleId,
}: {
  categorie: Categorie;
  articles: Article[];
  currentArticleId: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (articles.length === 0) return null;

  return (
    <div ref={rootRef} className="hc-cat-expander">
      <button
        type="button"
        className="hc-cat-expander-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          {!open && <line x1="5" y1="12" x2="19" y2="12" />}
        </svg>
        {open ? "Masquer" : "Tous les articles"}
      </button>

      {open && (
        <div id={panelId} className="hc-cat-expander-panel">
          <p className="hc-cat-expander-label">{categorie.titre}</p>
          {articles.map(a => (
            <ArticleCard key={a.id} article={a} active={a.id === currentArticleId} compact />
          ))}
        </div>
      )}
    </div>
  );
}
