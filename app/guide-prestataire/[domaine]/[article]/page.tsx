import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CategoryNav } from "../../components/CategoryNav";
import { SectionBlock } from "../../components/SectionBlock";
import { SupportCallout } from "../../components/SupportCallout";
import { InstitutionCta } from "../../components/InstitutionCta";
import { ArticleFeedback } from "../../components/ArticleFeedback";
import { AUTEUR_PAR_DEFAUT, estimerDureeLecture, getArticle, getArticlesByDomaine, getCategorie, getPublishedArticles, getRelatedArticles } from "@/lib/helpCenter/data";
import { Breadcrumb } from "../../components/Breadcrumb";
import { ArticleCard } from "../../components/ArticleCard";
import { CategoryArticlesExpander } from "../../components/CategoryArticlesExpander";
import { SearchForm } from "../../components/SearchForm";
import { ArticleToc } from "../../components/ArticleToc";

export function generateStaticParams() {
  // Seuls les articles "publie" reçoivent une route statique — un brouillon
  // n'est donc jamais atteignable, même par URL directe (UX Lock
  // 22/09/2026, §10). Reste correct dès qu'un nouvel article est publié,
  // sans changement de code.
  return getPublishedArticles().map(a => ({ domaine: a.domaine, article: a.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ domaine: string; article: string }> },
): Promise<Metadata> {
  const { domaine, article: articleId } = await params;
  const article = getArticle(domaine, articleId);
  if (!article) return {};
  return { title: article.titre, description: article.resume };
}

// `from`/`tab` sont un bonus de contextualisation optionnel (§6, §7 —
// un TabKey du dashboard peut être transmis en paramètre d'URL) : jamais
// requis pour que la page fonctionne, un visiteur direct/SEO voit la
// même page sans eux.
export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ domaine: string; article: string }>;
  searchParams: Promise<{ from?: string; tab?: string }>;
}) {
  const { domaine, article: articleId } = await params;
  const sp = await searchParams;
  const article = getArticle(domaine, articleId);
  if (!article) notFound();
  const categorie = getCategorie(article.domaine);
  const articlesDomaine = categorie ? getArticlesByDomaine(categorie.id) : [];
  const associes = getRelatedArticles(article);

  return (
    <div className="hc-layout">
      <CategoryNav active={article.domaine} />

      <div className="hc-main">
        <div className="hc-article-layout">
        <div className="hc-article-shell">
          {sp.from === "dashboard" && (
            <p style={{ marginBottom: "12px" }}>
              <Link href="#" style={{ fontSize: "13px", color: "var(--hc-text-muted)" }}>
                ← Retour au tableau de bord
              </Link>
            </p>
          )}

          <div className="hc-breadcrumb-row">
            <Breadcrumb
              items={[
                { label: "Centre d'aide prestataires", href: "/guide-prestataire" },
                categorie ? { label: categorie.titre, href: `/guide-prestataire/${categorie.id}` } : { label: article.domaine },
                { label: article.titre },
              ]}
            />
            {categorie && (
              <CategoryArticlesExpander
                categorie={categorie}
                articles={articlesDomaine}
                currentArticleId={article.id}
              />
            )}
          </div>

          <header className="hc-article-header">
            <h1 className="hc-article-title">{article.titre}</h1>

            {/* Recherche de repli, visible uniquement en dessous de 1024px
                (`.hc-search-inline-mobile`, help-center.css) — la recherche du
                header couvre déjà le desktop pour cette page (jamais 2
                recherches visibles en même temps, UX Lock 22/09/2026 §5). */}
            <div className="hc-search-inline-mobile" style={{ marginBottom: "16px" }}>
              <SearchForm />
            </div>

            <div className="hc-article-meta">
              <span className="hc-meta-pill">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                </svg>
                {estimerDureeLecture(article)} min de lecture
              </span>
              <span className="hc-meta-pill">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
                </svg>
                {article.auteur ?? AUTEUR_PAR_DEFAUT}
              </span>
            </div>

            {article.miseAJourAffichee && (
              <p style={{ fontSize: "12px", color: "var(--hc-text-muted)", margin: 0 }}>
                Mis à jour le {new Date(article.derniereVerification).toLocaleDateString("fr-FR")}
              </p>
            )}
          </header>

          <div className="hc-article-body">
            {article.sections.map((section, i) => (
              <SectionBlock key={i} section={section} />
            ))}
          </div>

          {associes.length > 0 && (
            <div className="hc-related">
              <h2>Articles associés</h2>
              {associes.slice(0, 5).map(a => <ArticleCard key={a.id} article={a} />)}
            </div>
          )}

          {categorie && (
            <Link href={`/guide-prestataire/${categorie.id}`} className="hc-back-link" style={{ marginTop: "20px" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Retour à {categorie.titre}
            </Link>
          )}

          <ArticleFeedback article={article} />

          <SupportCallout />
          <InstitutionCta />
        </div>

        <ArticleToc sections={article.sections} />
        </div>
      </div>
    </div>
  );
}
