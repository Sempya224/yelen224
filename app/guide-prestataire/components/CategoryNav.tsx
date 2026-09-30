import Link from "next/link";
import { getCategories, countArticles } from "@/lib/helpCenter/data";
import type { DomaineId } from "@/lib/helpCenter/types";

// Server Component — aucune détection de route côté client nécessaire,
// chaque page connaît déjà son propre domaine actif via ses props.
export function CategoryNav({ active }: { active?: DomaineId }) {
  const categories = getCategories();

  return (
    <nav className="hc-nav" aria-label="Catégories du centre d'aide">
      <div className="hc-nav__label">Catégories</div>
      <Link href="/guide-prestataire" className="hc-nav-link" aria-current={!active ? "page" : undefined}>
        Accueil du centre d&apos;aide
      </Link>
      {categories.map(c => {
        const n = countArticles(c.id);
        return (
          <Link
            key={c.id}
            href={`/guide-prestataire/${c.id}`}
            className="hc-nav-link"
            aria-current={active === c.id ? "page" : undefined}
          >
            {c.titre}
            {/* Compte affiché uniquement s'il y a au moins un article publié
                — un "(0)" n'a aucune valeur UX démontrée (UX Lock
                22/09/2026, §11). */}
            {n > 0 && <span style={{ color: "var(--hc-text-muted)", fontWeight: 500 }}> ({n})</span>}
          </Link>
        );
      })}
    </nav>
  );
}
