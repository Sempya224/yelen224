"use client";

// Footer du Centre légal Yelen — refonte (brief structuré Bryan,
// 23/09/2026). Deux zones sur desktop (marque + liens généraux vs
// documents légaux), une colonne empilée sur mobile. Distinct de la
// section "Documents légaux associés" que certaines pages affichent
// juste avant (ex. mentions-legales-client.tsx) : cette dernière ne
// montre que les documents liés à la page en cours, avec un style
// accentué (liens dorés + flèches) — ce footer est la navigation
// juridique globale, toujours complète, volontairement plus sobre pour
// ne pas dupliquer visuellement la même logique. Pas de lien "Centre
// légal" ici : l'utilisateur s'y trouve déjà. Pas de mention
// "Sempya224" dans le copyright tant que ce nom n'est pas confirmé
// comme entité/marque devant apparaître dans les documents publics.
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { LEGAL_LAST_UPDATED } from "@/lib/legalVersions";
import { LEGAL_NAV_GROUPS } from "@/lib/legalNav";
import { LegalLanguageSwitcher } from "./LegalLanguageSwitcher";

// P0-1 (23/09/2026) : dérivé de lib/legalNav.ts, la même source unique que
// LegalSidebar/LegalBreadcrumb/LegalSearchForm, au lieu d'une liste propre
// qui avait déjà pris du retard (Offres absente). "Centre légal" exclu
// (lien "Vue d'ensemble", pas un document) — même filtre que
// app/(legal)/legal/page.tsx.
const DOCUMENTS = LEGAL_NAV_GROUPS
  .filter(g => g.titre !== "Centre légal")
  .flatMap(g => g.items);

export function LegalFooter() {
  const { theme } = useTheme();
  const C = T[theme];
  // Accordéon "Documents légaux" façon DoorDash (retour Bryan 23/09/2026,
  // référence visuelle footer mobile DoorDash) — mobile uniquement : sur
  // desktop, `.legal-footer__nav--collapsed` n'est stylée que sous
  // 768px, donc la nav reste toujours visible en grille peu importe cet
  // état. Fermé par défaut, comme les sections DoorDash à l'ouverture.
  const [documentsOuvert, setDocumentsOuvert] = useState(false);

  const cssVars = {
    // Même blanc que le bandeau langue (retour Bryan 23/09/2026) — plus de
    // teinte propre au footer (C.footerBg) ni même C.pageBg (légèrement
    // grisé) : tout l'écran partage exactement C.cardBg.
    "--lf-bg": C.cardBg,
    "--lf-border": C.border,
    "--lf-border-soft": C.borderSubtle,
    "--lf-fg": C.textSubtle,
    "--lf-fg-muted": C.textFaint,
    "--lf-heading": C.textFaint,
    "--lf-brand": C.text,
  } as CSSProperties;

  return (
    <footer className="legal-footer" style={cssVars}>
      <style>{`
        .legal-footer {
          background: var(--lf-bg);
          border-top: 1px solid var(--lf-border);
          color: var(--lf-fg);
        }
        .legal-footer__container {
          max-width: 1120px;
          margin: 0 auto;
          padding: 56px 24px 24px;
        }
        .legal-footer__content {
          display: flex;
          flex-direction: column;
          gap: 36px;
        }
        @media (min-width: 768px) {
          .legal-footer__content {
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr);
            gap: 72px;
          }
        }
        .legal-footer h2 {
          margin: 0 0 18px;
          color: var(--lf-heading);
          font-size: 12px;
          font-weight: 750;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .legal-footer__accordion-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: none;
          border: none;
          padding: 0;
          margin: 0 0 18px;
          color: var(--lf-heading);
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: default;
        }
        .legal-footer__accordion-chevron { display: none; }
        @media (max-width: 767px) {
          .legal-footer__documents {
            border-top: 1px solid var(--lf-border-soft);
            padding-top: 20px;
          }
          .legal-footer__accordion-trigger {
            cursor: pointer;
            padding: 4px 0;
          }
          .legal-footer__accordion-chevron {
            display: block;
            flex-shrink: 0;
            transition: transform 0.2s ease;
          }
          .legal-footer__accordion-chevron--open { transform: rotate(180deg); }
          .legal-footer__nav--collapsed { display: none; }
        }
        .legal-footer__brand-link {
          display: inline-flex;
          text-decoration: none;
        }
        .legal-footer__brand-name {
          color: var(--lf-brand);
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .legal-footer__brand p {
          max-width: 360px;
          margin: 12px 0 20px;
          color: var(--lf-fg-muted);
          font-size: 15px;
          line-height: 1.55;
        }
        .legal-footer__brand nav {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
        @media (min-width: 768px) {
          .legal-footer__brand nav {
            flex-direction: row;
            align-items: center;
            gap: 20px;
          }
        }
        .legal-footer__documents nav {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          font-size: 15px;
          line-height: 1.45;
        }
        .legal-footer a {
          color: var(--lf-fg);
          text-decoration: none;
        }
        .legal-footer a:hover {
          color: #F5A623;
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .legal-footer a:focus-visible {
          outline: 3px solid rgba(245, 166, 35, 0.45);
          outline-offset: 3px;
          border-radius: 4px;
        }
        .legal-footer__bottom {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 24px;
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid var(--lf-border-soft);
          color: var(--lf-fg-muted);
          font-size: 13px;
          line-height: 1.5;
        }
        @media (max-width: 767px) {
          .legal-footer__container { padding: 40px 24px 28px; }
          .legal-footer__bottom { flex-direction: column; gap: 6px; margin-top: 36px; }
          .legal-footer__documents nav a,
          .legal-footer__brand nav a {
            display: flex;
            align-items: center;
            min-height: 44px;
          }
        }
      `}</style>

      <div className="legal-footer__container">
        <div className="legal-footer__content">
          <section className="legal-footer__brand">
            <Link href="/" className="legal-footer__brand-link" aria-label="Retour à l'accueil Yelen224">
              <span className="legal-footer__brand-name">YELEN224</span>
            </Link>
            <p>La plateforme numérique de rendez-vous de la République de Guinée.</p>
            <nav aria-label="Liens généraux">
              <Link href="/contact">Contacter Yelen</Link>
            </nav>
          </section>

          <section className="legal-footer__documents">
            <h2 style={{ margin: 0 }}>
              <button
                type="button"
                className="legal-footer__accordion-trigger"
                onClick={() => setDocumentsOuvert(v => !v)}
                aria-expanded={documentsOuvert}
                aria-controls="legal-footer-documents-nav"
              >
                Documents légaux
                <svg className={`legal-footer__accordion-chevron${documentsOuvert ? " legal-footer__accordion-chevron--open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </h2>
            <nav
              id="legal-footer-documents-nav"
              aria-label="Documents légaux"
              className={documentsOuvert ? "" : "legal-footer__nav--collapsed"}
            >
              {DOCUMENTS.map(doc => (
                <Link key={doc.href} href={doc.href}>{doc.label}</Link>
              ))}
            </nav>
          </section>
        </div>

        <div style={{ maxWidth: "320px", marginTop: "32px" }}>
          <LegalLanguageSwitcher variant="block" />
        </div>

        <div className="legal-footer__bottom">
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} Yelen224. Tous droits réservés.</p>
          <p style={{ margin: 0 }}>Dernière mise à jour des documents : {LEGAL_LAST_UPDATED}</p>
        </div>
      </div>
    </footer>
  );
}
