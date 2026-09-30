"use client";

import { useState } from "react";
import { ArticleCard } from "./ArticleCard";
import type { Article } from "@/lib/helpCenter/types";

type FiltreCategorie = { id: string; titre: string; count: number };

// Filtre par catégorie des résultats de recherche (retour Bryan
// 23/09/2026) — Client Component réservé à l'interactivité : ne relance
// jamais `searchArticles`, filtre uniquement la liste déjà calculée côté
// serveur (`resultats`), jamais un second appel réseau. L'URL est
// synchronisée via `history.replaceState` (pas `router.push`) pour ne
// jamais déclencher un nouveau rendu serveur de la page au changement de
// filtre — seul le paramètre `category` bouge, `q` reste piloté par
// SearchForm (recherche elle-même non touchée).
export function SearchResultsFiltered({
  query,
  resultats,
  filtresCategories,
  categorieInitiale,
}: {
  query: string;
  resultats: Article[];
  filtresCategories: FiltreCategorie[];
  categorieInitiale: string;
}) {
  const [selection, setSelection] = useState(categorieInitiale);

  function selectionner(id: string) {
    setSelection(id);
    const params = new URLSearchParams({ q: query });
    if (id !== "toutes") params.set("category", id);
    window.history.replaceState(null, "", `/guide-prestataire/recherche?${params.toString()}`);
  }

  const filtres = selection === "toutes" ? resultats : resultats.filter(a => a.domaine === selection);

  return (
    <>
      <div className="hc-search-filters" role="group" aria-label="Filtrer les résultats par catégorie">
        <button
          type="button"
          className="hc-search-filter-chip"
          data-active={selection === "toutes"}
          aria-pressed={selection === "toutes"}
          onClick={() => selectionner("toutes")}
        >
          Toutes ({resultats.length})
        </button>
        {filtresCategories.map(f => (
          <button
            key={f.id}
            type="button"
            className="hc-search-filter-chip"
            data-active={selection === f.id}
            aria-pressed={selection === f.id}
            onClick={() => selectionner(f.id)}
          >
            {f.titre} ({f.count})
          </button>
        ))}
      </div>

      {filtres.length > 0 ? (
        filtres.map(a => <ArticleCard key={a.id} article={a} />)
      ) : (
        <div className="hc-search-filter-empty">
          <p>Aucun article ne correspond à cette recherche dans cette catégorie.</p>
          <button type="button" className="hc-search-filter-reset" onClick={() => selectionner("toutes")}>
            Afficher tous les résultats
          </button>
        </div>
      )}
    </>
  );
}
