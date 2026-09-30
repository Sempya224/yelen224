"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { searchArticles } from "@/lib/helpCenter/data";

// Client Component : la recherche en direct (suggestions pendant la frappe,
// façon DoorDash) exige du JS. Le formulaire reste un vrai GET natif en
// dessous (action="/guide-prestataire/recherche") — sans JS, Entrée/le
// bouton fonctionnent toujours, seule la liste de suggestions disparaît.
// searchArticles() opère sur ARTICLES (codé en dur, §4/§9 de l'architecture)
// — aucun appel réseau, cohérent avec "pas de service tiers".
export function SearchForm({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const tousLesResultats = useMemo(() => {
    const q = value.trim();
    return q ? searchArticles(q) : [];
  }, [value]);
  const suggestions = useMemo(() => tousLesResultats.slice(0, 6), [tousLesResultats]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const showDropdown = open && suggestions.length > 0;

  return (
    <div className="hc-search" ref={containerRef}>
      <form
        action="/guide-prestataire/recherche"
        method="GET"
        role="search"
        className="hc-search-form"
        onSubmit={(e) => {
          const q = value.trim();
          // Clic/Entrée conditionnel : une requête vide ne part jamais vers
          // la page de résultats.
          if (!q) { e.preventDefault(); return; }
          // Navigation côté client (pas de rechargement plein navigateur) —
          // repli natif conservé : sans JS, l'événement n'est jamais
          // intercepté et le <form action="..." method="GET"> fonctionne
          // normalement.
          e.preventDefault();
          setOpen(false);
          router.push(`/guide-prestataire/recherche?q=${encodeURIComponent(q)}`);
        }}
      >
        <label htmlFor="hc-search-q" style={{ position: "absolute", left: "-9999px" }}>
          Rechercher dans le centre d&apos;aide
        </label>

        {value && (
          <button
            type="button"
            className="hc-search-clear"
            aria-label="Effacer la recherche"
            onClick={() => setValue("")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        <input
          id="hc-search-q"
          name="q"
          type="search"
          placeholder="Rechercher une question, un mot-clé..."
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => { if (value.trim()) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          className="hc-search-input"
          autoComplete="off"
        />

        <button
          type="submit"
          className="hc-search-submit"
          aria-label="Lancer la recherche"
          disabled={!value.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </form>

      {showDropdown && (
        <div className="hc-search-suggestions" aria-live="polite">
          <p style={{ position: "absolute", left: "-9999px" }}>
            {suggestions.length} résultat{suggestions.length > 1 ? "s" : ""} pour « {value} »
          </p>
          <ul>
            {suggestions.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/guide-prestataire/${a.domaine}/${a.id}`}
                  className="hc-search-suggestion"
                  onClick={() => setOpen(false)}
                >
                  <span>{a.titre}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>

          {/* Seule porte d'entrée vers /recherche (page avec filtre par
              catégorie) depuis ce dropdown — sans ce lien, un clic sur une
              suggestion ouvre toujours l'article directement, la page de
              résultats/filtre n'est jamais atteinte (retour Bryan 23/09/2026). */}
          <Link
            href={`/guide-prestataire/recherche?q=${encodeURIComponent(value.trim())}`}
            className="hc-search-suggestions-footer"
            onClick={() => setOpen(false)}
          >
            Voir tous les résultats ({tousLesResultats.length}) pour « {value.trim()} »
          </Link>
        </div>
      )}
    </div>
  );
}
