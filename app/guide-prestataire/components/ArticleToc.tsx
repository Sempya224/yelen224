"use client";

import { useEffect, useMemo, useState } from "react";
import type { Section } from "@/lib/helpCenter/types";
import { getArticleHeadings } from "@/lib/helpCenter/toc";

// Sommaire de l'article (retour Bryan 25/09/2026) — desktop uniquement,
// masqué en dessous de 1024px par .hc-toc dans help-center.css (mobile n'a
// pas la place, et la navigation mobile passe déjà par le fil d'Ariane +
// le "+" de CategoryArticlesExpander).
//
// Scroll-spy (retour Bryan 19/10/2026) : la ligne verticale dorée ne doit
// plus dépendre du survol — elle doit suivre la section réellement visible
// à l'écran pendant le défilement, comme un vrai sommaire de doc (Stripe/
// Linear). Client Component pour l'IntersectionObserver uniquement
// (CLAUDE.md /stack-specifique) ; les données (`headings`) restent dérivées
// de la même fonction pure que côté serveur, aucune logique métier ajoutée.
export function ArticleToc({ sections }: { sections: Section[] }) {
  const headings = useMemo(() => getArticleHeadings(sections), [sections]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const elements = headings
      .map(h => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    // Ligne de déclenchement juste sous le header sticky (même décalage que
    // `scroll-margin-top` sur les <h2>, SectionBlock.tsx) : une section
    // devient "active" dès qu'elle franchit cette ligne, et le reste de la
    // marge basse (-70%) privilégie toujours la section la plus haute
    // actuellement visible plutôt que la dernière à apparaître en bas d'écran.
    const observer = new IntersectionObserver(
      entries => {
        const visibles = entries.filter(e => e.isIntersecting);
        if (visibles.length === 0) return;
        const plusHaute = visibles.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveId(plusHaute.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  // Un sommaire à 0 ou 1 entrée n'apporte rien — jamais affiché pour
  // remplir une case.
  if (headings.length < 2) return null;

  return (
    <nav className="hc-toc" aria-label="Sommaire de l'article">
      <div className="hc-toc__label">Dans cet article</div>
      <ul>
        {headings.map(h => (
          <li key={h.id}>
            <a href={`#${h.id}`} aria-current={activeId === h.id ? "location" : undefined}>
              {h.titre}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
