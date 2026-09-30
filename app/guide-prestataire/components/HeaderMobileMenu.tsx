"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCategories, countArticles } from "@/lib/helpCenter/data";

const CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hc-mobile-menu-chevron">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

// Menu catégories mobile (UX Lock 22/09/2026, §4) — remplace la sidebar
// desktop (`.hc-nav`, masquée <1024px par CSS) sur petit écran. Reprend la
// convention visuelle déjà établie par components/CitoyenMenu.tsx (overlay
// plein écran, fixed inset:0, bouton de fermeture, monté/démonté par un
// état local) MAIS ajoute ce que CitoyenMenu ne gère pas : piège de focus,
// fermeture Échap, retour du focus au déclencheur — l'accessibilité est une
// exigence explicite de ce lot (§12), pas un pattern à copier tel quel s'il
// est incomplet sur ce point précis.
export function HeaderMobileMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Chaque lien du menu appelle déjà `close()` dans son `onClick` (voir plus
  // bas) — pas besoin d'un effet séparé sur le pathname pour fermer au clic,
  // ce qui évite un setState synchrone dans un effet (règle React Compiler).

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const categories = getCategories();
  const pathname = usePathname();
  // Segment immédiatement après /guide-prestataire, ex. "rdv-clients" pour
  // /guide-prestataire/rdv-clients ou /guide-prestataire/rdv-clients/xyz.
  const activeDomaine = pathname
    ?.replace(/^\/guide-prestataire\/?/, "")
    .split("/")[0] || undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="hc-menu-trigger"
        aria-label="Ouvrir les catégories du centre d'aide"
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
        <span>Catégories</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Catégories du centre d'aide"
          className="hc-mobile-menu"
        >
          <div className="hc-mobile-menu-header">
            <span className="hc-mobile-menu-title">Catégories</span>
            <button ref={closeRef} type="button" onClick={close} aria-label="Fermer le menu" className="hc-mobile-menu-close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <nav aria-label="Catégories" className="hc-mobile-menu-list">
            <Link
              href="/guide-prestataire"
              className="hc-mobile-menu-link"
              aria-current={!activeDomaine ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <span>Accueil du centre d&apos;aide</span>
              {CHEVRON}
            </Link>
            {categories.map(c => {
              const n = countArticles(c.id);
              const isActive = activeDomaine === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/guide-prestataire/${c.id}`}
                  className="hc-mobile-menu-link"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span>
                    {c.titre}
                    {n > 0 && <span className="hc-mobile-menu-count"> ({n})</span>}
                  </span>
                  {CHEVRON}
                </Link>
              );
            })}
          </nav>

          <div className="hc-mobile-menu-footer">
            <Link href="/contact" className="hc-contact-link" onClick={() => setOpen(false)}>
              Contacter le support
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
