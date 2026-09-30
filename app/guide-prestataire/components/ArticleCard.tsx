import Link from "next/link";
import type { Article } from "@/lib/helpCenter/types";

// Rangée de liste dense (UX Lock 22/09/2026, §5) — remplace l'ancienne
// carte bordée indépendante par article : "le Help Center est un produit
// documentaire, l'information doit dominer la décoration". Le composant
// reste inchangé pour les 3 usages (liste de catégorie, résultats de
// recherche, articles associés). `compact` (retour Bryan 23/09/2026,
// inspiré DoorDash for Business) : panneau "Tous les articles" — juste la
// question, sans résumé ni chevron, pour rester une liste courte à scanner.
export function ArticleCard({ article, active, compact }: { article: Article; active?: boolean; compact?: boolean }) {
  return (
    <Link
      href={`/guide-prestataire/${article.domaine}/${article.id}`}
      className={compact ? "hc-article-row hc-article-row--compact" : "hc-article-row"}
      aria-current={active ? "page" : undefined}
    >
      <span className="hc-article-row-text">
        <span className="hc-article-row-title">{article.titre}</span>
        {!compact && <span className="hc-article-row-resume">{article.resume}</span>}
      </span>
      {!compact && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hc-article-row-chevron">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      )}
    </Link>
  );
}
