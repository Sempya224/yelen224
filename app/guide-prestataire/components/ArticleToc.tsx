import type { Section } from "@/lib/helpCenter/types";
import { getArticleHeadings } from "@/lib/helpCenter/toc";

// Sommaire de l'article (retour Bryan 25/09/2026) — desktop uniquement,
// masqué en dessous de 1024px par .hc-toc dans help-center.css (mobile n'a
// pas la place, et la navigation mobile passe déjà par le fil d'Ariane +
// le "+" de CategoryArticlesExpander). Server Component : uniquement des
// ancres <a href="#...">, aucune interactivité requise.
export function ArticleToc({ sections }: { sections: Section[] }) {
  const headings = getArticleHeadings(sections);

  // Un sommaire à 0 ou 1 entrée n'apporte rien — jamais affiché pour
  // remplir une case.
  if (headings.length < 2) return null;

  return (
    <nav className="hc-toc" aria-label="Sommaire de l'article">
      <div className="hc-toc__label">Dans cet article</div>
      <ul>
        {headings.map(h => (
          <li key={h.id}>
            <a href={`#${h.id}`}>{h.titre}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
