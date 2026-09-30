import type { Section, SectionType } from "@/lib/helpCenter/types";
import { ArticleCallout, type CalloutVariant } from "./ArticleCallout";
import { GuideScreenshotPlaceholder } from "./GuideScreenshotPlaceholder";
import { slugifyTitre } from "@/lib/helpCenter/toc";

// Correspondance figée entre le type de contenu (données) et la variante
// visuelle du callout (présentation) — "tip"/"warn" restent les noms de
// données historiques, seul le rendu change de vocabulaire (refonte
// lecture 23/09/2026, remplace les anciennes cartes `.hc-section`).
const CALLOUT_VARIANT: Partial<Record<SectionType, CalloutVariant>> = {
  info: "info",
  tip: "success",
  warn: "warning",
  danger: "danger",
};

// Rendu sémantique d'une section d'article. Les sections éditoriales
// normales (text/list/checklist/steps) s'affichent directement dans le
// flux de lecture, sans carte — seules info/tip/warn/danger utilisent un
// encadré à fond coloré (ArticleCallout). Titre de section en <h2>
// (jamais <h3>) : il n'existe aucun <h2> intermédiaire entre le H1 de la
// page et ces titres (verrouillé par l'audit UX/UI 22/09/2026, §12).
export function SectionBlock({ section }: { section: Section }) {
  if (section.type === "screenshot" && section.screenshot) {
    return <GuideScreenshotPlaceholder {...section.screenshot} />;
  }

  const variant = CALLOUT_VARIANT[section.type];

  if (variant) {
    return (
      <ArticleCallout variant={variant}>
        {section.titre && <p className="hc-callout__lead">{section.titre}</p>}
        {section.contenu && <p className="hc-pre-line">{section.contenu}</p>}
      </ArticleCallout>
    );
  }

  return (
    <div>
      {section.titre && <h2 id={slugifyTitre(section.titre)} style={{ scrollMarginTop: "calc(var(--hc-header-h) + 16px)" }}>{section.titre}</h2>}

      {section.contenu && section.type === "text" && (
        <p className="hc-pre-line">{section.contenu}</p>
      )}

      {section.items && section.type === "list" && (
        <ul>
          {section.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}

      {section.items && section.type === "checklist" && (
        <ul className="hc-checklist">
          {section.items.map((item, i) => (
            <li key={i}>
              <span aria-hidden="true" className="hc-checklist-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}

      {section.items && section.type === "steps" && (
        <ol className="hc-steps">
          {section.items.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      )}
    </div>
  );
}
