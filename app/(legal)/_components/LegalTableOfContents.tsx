"use client";

// Sommaire partagé du modèle de lecture "prose continue" du Centre légal
// (chantier Legal & Confidentialité, contrat verrouillé 23/09/2026).
// Remplace le sommaire pagine bricolé dans Cookies/CGP (activeSection piloté
// uniquement au clic, sans media query) : ici l'état actif suit le scroll
// réel (IntersectionObserver), aucun clic n'est nécessaire pour qu'il se
// mette à jour, et aucune section n'est masquée — tout reste dans le DOM
// (recherche navigateur, impression, lecteur d'écran).
// Ne connaît que {id, numero, titre} : compatible aussi bien avec une
// section "texte" qu'un bloc "fait/valeur" (Mentions légales), la
// distinction de rendu appartient au document, pas à ce composant.
// Repli mobile identique à LegalSidebar (mêmes 899px, même patron bouton +
// panneau) plutôt qu'un 3e mécanisme de repli. Aucune pagination, aucune
// barre de progression (hors périmètre v1, voir contrat validé).
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { LEGAL_BREAKPOINT_PX } from "@/lib/legalNav";

export type LegalTocSection = { id: string; numero: string; titre: string };

// LegalHeader est sticky (~64px). Sans marge, scrollIntoView({block:"start"})
// cale le titre visé exactement sous lui. Appliqué en JS ici (jamais exigé
// du document appelant, voir vérification étape 2) pour que le contrat
// {id, numero, titre} reste inchangé.
const HEADER_OFFSET_PX = 84;

// Rend focusable une section qui ne l'est pas nativement (titre de
// paragraphe), le temps de recevoir le focus après un clic de sommaire —
// puis retire l'attribut au blur pour ne pas polluer l'ordre de tabulation
// du reste de la page.
function focusHeading(el: HTMLElement) {
  const hadTabIndex = el.hasAttribute("tabindex");
  if (!hadTabIndex) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  if (!hadTabIndex) {
    const onBlur = () => {
      el.removeAttribute("tabindex");
      el.removeEventListener("blur", onBlur);
    };
    el.addEventListener("blur", onBlur);
  }
}

// html { scroll-behavior: smooth } est global (app/globals.css) : passer
// behavior:"auto" à scrollIntoView ne suffit pas à obtenir un saut instantané,
// "auto" délègue au scroll-behavior CSS de l'élément scrollable. On bascule
// donc temporairement le html en scroll-behavior:auto le temps du saut, puis
// on restaure la valeur précédente une fois le scroll instantané terminé.
function scrollInstantly(el: HTMLElement) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  el.scrollIntoView({ behavior: "auto", block: "start" });
  requestAnimationFrame(() => {
    root.style.scrollBehavior = previous;
  });
}

export function LegalTableOfContents({ sections, minSectionsToShow = 4 }: {
  sections: LegalTocSection[];
  minSectionsToShow?: number;
}) {
  const { theme } = useTheme();
  const C = T[theme];
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const [mobileOuvert, setMobileOuvert] = useState(false);

  useEffect(() => {
    const headings = sections
      .map(s => ({ id: s.id, el: document.getElementById(s.id) }))
      .filter((h): h is { id: string; el: HTMLElement } => !!h.el);
    if (headings.length === 0) return;

    for (const h of headings) {
      if (!h.el.style.scrollMarginTop) h.el.style.scrollMarginTop = `${HEADER_OFFSET_PX}px`;
    }

    const visibles = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("id");
          if (!id) continue;
          if (entry.isIntersecting) visibles.add(id);
          else visibles.delete(id);
        }
        const first = headings.find(h => visibles.has(h.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 }
    );
    headings.forEach(h => observer.observe(h.el));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length < minSectionsToShow) return null;

  const activeSection = sections.find(s => s.id === activeId) ?? sections[0];

  function goToSection(id: string, e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      scrollInstantly(el);
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    focusHeading(el);
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
    setMobileOuvert(false);
  }

  function renderList() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {sections.map(s => {
          const active = s.id === activeId;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={active ? "legal-toc-link legal-toc-link-active" : "legal-toc-link"}
              aria-current={active ? "location" : undefined}
              onClick={(e) => goToSection(s.id, e)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: "8px",
                textDecoration: "none",
                color: active ? "#F5A623" : C.textSubtle,
                borderLeft: active ? "2px solid #F5A623" : "2px solid transparent",
              }}
            >
              <span className={active ? "legal-toc-numero legal-toc-numero-active" : "legal-toc-numero"} style={{
                width: "20px", height: "20px", borderRadius: "6px", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", fontWeight: 800,
                backgroundColor: active ? "rgba(245,166,35,0.15)" : C.borderSubtle,
              }}>{s.numero}</span>
              <span style={{ fontSize: "13px", fontWeight: active ? 700 : 500, lineHeight: 1.3 }}>{s.titre}</span>
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <style>{`
        .legal-toc-desktop { display: block; }
        .legal-toc-mobile { display: none; }
        @media (max-width: ${LEGAL_BREAKPOINT_PX}px) {
          .legal-toc-desktop { display: none !important; }
          .legal-toc-mobile { display: block; }
        }
        .legal-toc-link:focus-visible {
          outline: 3px solid rgba(245,166,35,0.45);
          outline-offset: 2px;
        }
        .legal-toc-link-active { border: 1px solid rgba(245,166,35,0.3); }
        .legal-toc-numero-active { color: #F5A623; }
        @media (max-width: ${LEGAL_BREAKPOINT_PX}px) {
          .legal-toc-link-active { border-color: transparent; }
          .legal-toc-numero-active { color: ${C.text}; }
        }
      `}</style>

      <nav
        aria-label="Sommaire du document"
        className="legal-toc-desktop"
        style={{
          width: "240px", flexShrink: 0, position: "sticky", top: "64px",
          alignSelf: "flex-start", maxHeight: "calc(100vh - 96px)", overflowY: "auto",
          backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px",
        }}
      >
        <p style={{ color: C.textFaint, fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", margin: "0 0 12px 4px" }}>Sommaire</p>
        {renderList()}
      </nav>

      <div className="legal-toc-mobile" style={{
        padding: "12px 0",
        position: "sticky", top: "64px", zIndex: 90,
        backgroundColor: C.cardBg,
      }}>
        <button
          type="button"
          onClick={() => setMobileOuvert(v => !v)}
          aria-expanded={mobileOuvert}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            padding: "11px 14px", borderRadius: "10px", border: `1px solid ${C.borderCard}`,
            backgroundColor: C.cardBg, color: C.text, fontSize: "13px", fontWeight: 600, cursor: "pointer",
          }}
        >
          {activeSection.titre}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSubtle} strokeWidth="2" strokeLinecap="round">
            <polyline points={mobileOuvert ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
          </svg>
        </button>
        {mobileOuvert && (
          <div style={{ marginTop: "8px", padding: "12px", borderRadius: "12px", border: `1px solid ${C.borderCard}`, backgroundColor: C.cardBg }}>
            {renderList()}
          </div>
        )}
      </div>
    </>
  );
}
