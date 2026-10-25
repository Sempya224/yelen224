import Link from "next/link";
import { getCategories, countArticles } from "@/lib/helpCenter/data";
import type { DomaineId } from "@/lib/helpCenter/types";

// Icônes outline 24x24 (même convention que ArticleCard.tsx : stroke="currentColor",
// strokeWidth 2.2, strokeLinecap/join "round") — une par catégorie, pour que la
// sidebar se scanne visuellement comme un vrai centre d'aide (Stripe/Linear/Zendesk),
// pas une pile de texte brut. Jamais d'emoji (CLAUDE.md /regles-ux-ui).
const ICONES: Record<DomaineId, React.ReactNode> = {
  "commencer": (
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  ),
  "accueil-configuration": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  "rdv-clients": (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  "services": (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  "partenariat": (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  "communication-reputation": (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  "equipe-organisation": (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "securite-conformite": (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  ),
  "finance": (
    <>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </>
  ),
  "yelen-business": (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
};

const ICONE_ACCUEIL = (
  <>
    <path d="M3 12l9-9 9 9" />
    <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  </>
);

function Icone({ children }: { children: React.ReactNode }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// Server Component — aucune détection de route côté client nécessaire,
// chaque page connaît déjà son propre domaine actif via ses props.
export function CategoryNav({ active }: { active?: DomaineId }) {
  const categories = getCategories();

  return (
    <nav className="hc-nav" aria-label="Catégories du centre d'aide">
      <Link
        href="/guide-prestataire"
        className="hc-nav-link hc-nav-link--accueil"
        aria-current={!active ? "page" : undefined}
      >
        <span className="hc-nav-link-icon"><Icone>{ICONE_ACCUEIL}</Icone></span>
        <span className="hc-nav-link-text">Accueil du centre d&apos;aide</span>
      </Link>

      <div className="hc-nav__divider" />

      <div className="hc-nav__label">Catégories</div>
      <div className="hc-nav__list">
        {categories.map(c => {
          const n = countArticles(c.id);
          return (
            <Link
              key={c.id}
              href={`/guide-prestataire/${c.id}`}
              className="hc-nav-link"
              aria-current={active === c.id ? "page" : undefined}
            >
              <span className="hc-nav-link-icon"><Icone>{ICONES[c.id]}</Icone></span>
              <span className="hc-nav-link-text">{c.titre}</span>
              {/* Compte affiché uniquement s'il y a au moins un article publié
                  — un "(0)" n'a aucune valeur UX démontrée (UX Lock
                  22/09/2026, §11). */}
              {n > 0 && <span className="hc-nav-link-count">{n}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
