import type { Metadata } from "next";
import { CategoryNav } from "./components/CategoryNav";
import { SearchForm } from "./components/SearchForm";
import { SupportCallout } from "./components/SupportCallout";
import { InstitutionCta } from "./components/InstitutionCta";
import { PopularArticles } from "./components/PopularArticles";
import { CategoriesGrid } from "./components/CategoriesGrid";
import { getVisibleCategories, countArticles, QUICK_LINKS } from "@/lib/helpCenter/data";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Accueil",
};

export default function GuidePrestatairePage() {
  // Une catégorie sans article publié n'apparaît jamais ici (retour Bryan
  // 23/09/2026) — déjà triée par `ordre` (champ de tri manuel) via
  // `getVisibleCategories`.
  const categoriesVisibles = getVisibleCategories().map(c => ({ categorie: c, count: countArticles(c.id) }));

  return (
    <div className="hc-layout">
      <CategoryNav />

      <div className="hc-main">
        <section className="hc-hero">
          <p className="hc-hero-eyebrow">Centre d&apos;aide prestataires</p>
          <h1 className="hc-hero-title">Comment pouvons-nous vous aider ?</h1>
          <p className="hc-hero-sub">
            Réponses vérifiées pour gérer votre établissement sur Yelen224.
          </p>
          <SearchForm />
        </section>

        {/* "Que cherchez-vous ?" — raccourcis vers des catégories réelles
            uniquement, jamais une destination fictive (UX Lock 22/09/2026,
            §6). */}
        <div style={{ marginTop: "28px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--hc-text-muted)", margin: "0 0 12px" }}>
            Que cherchez-vous ?
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {QUICK_LINKS.map(q => (
              <Link
                key={q.domaine}
                href={`/guide-prestataire/${q.domaine}`}
                style={{ padding: "8px 14px", borderRadius: "999px", border: "1px solid var(--hc-border)", background: "var(--hc-surface)", color: "var(--hc-text)", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
              >
                {q.label}
              </Link>
            ))}
          </div>
        </div>

        {categoriesVisibles.length > 0 && (
          <>
            <h2 style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--hc-text-muted)", margin: "28px 0 12px" }}>
              Catégories
            </h2>
            <CategoriesGrid items={categoriesVisibles} />
          </>
        )}

        <PopularArticles />

        <SupportCallout />
        <InstitutionCta />
      </div>
    </div>
  );
}
