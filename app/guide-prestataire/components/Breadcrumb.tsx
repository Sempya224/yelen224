import Link from "next/link";

export type Crumb = { label: string; href?: string };

// UX Lock 22/09/2026 (§3, §7) — navigation secondaire, jamais un
// remplacement du menu principal (CategoryNav). Server Component : aucune
// interactivité, juste des <Link>. Deux rendus coexistent (contrôlés par
// CSS, jamais du JS) : le fil complet (`.hc-breadcrumb-full`, ≥640px) et un
// simple retour au niveau précédent (`.hc-breadcrumb-back`, <640px) — "ne
// jamais créer 2 lignes de breadcrumb sur mobile, conserver au minimum un
// retour vers le niveau précédent".
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  const parent = items.length >= 2 ? items[items.length - 2] : null;

  return (
    <nav aria-label="Fil d'Ariane" className="hc-breadcrumb">
      <ol className="hc-breadcrumb-full">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i}>
              {item.href && !isLast ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
              {!isLast && <span aria-hidden="true" className="hc-breadcrumb-sep">/</span>}
            </li>
          );
        })}
      </ol>

      {parent?.href && (
        <div className="hc-breadcrumb-back-wrap">
          <span className="hc-breadcrumb-back-label">Retour à</span>
          <Link href={parent.href} className="hc-breadcrumb-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {parent.label}
          </Link>
        </div>
      )}
    </nav>
  );
}
