import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryNav } from "../components/CategoryNav";
import { SearchForm } from "../components/SearchForm";
import { ArticleCard } from "../components/ArticleCard";
import { EmptyState } from "../components/EmptyState";
import { Breadcrumb } from "../components/Breadcrumb";
import { CATEGORIES, getCategorie, getArticlesByDomaine } from "@/lib/helpCenter/data";

export function generateStaticParams() {
  return CATEGORIES.map(c => ({ domaine: c.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ domaine: string }> },
): Promise<Metadata> {
  const { domaine } = await params;
  const categorie = getCategorie(domaine);
  if (!categorie) return {};
  return { title: categorie.titre };
}

export default async function DomainePage({ params }: { params: Promise<{ domaine: string }> }) {
  const { domaine } = await params;
  const categorie = getCategorie(domaine);
  if (!categorie) notFound();

  const articles = getArticlesByDomaine(categorie.id);

  return (
    <div className="hc-layout">
      <CategoryNav active={categorie.id} />

      <div className="hc-main">
        <Breadcrumb
          items={[
            { label: "Centre d'aide prestataires", href: "/guide-prestataire" },
            { label: categorie.titre },
          ]}
        />

        <h1 style={{ fontSize: "22px", fontWeight: 900, margin: "16px 0 6px" }}>{categorie.titre}</h1>
        {categorie.description && (
          <p style={{ fontSize: "14px", color: "var(--hc-text-muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
            {categorie.description}
          </p>
        )}

        {/* Recherche de repli mobile — le header couvre déjà le desktop
            pour cette page (UX Lock 22/09/2026 §5). */}
        <div className="hc-search-inline-mobile">
          <SearchForm />
        </div>

        <div style={{ marginTop: "20px" }}>
          {articles.length > 0 ? (
            articles.map(a => <ArticleCard key={a.id} article={a} />)
          ) : (
            <EmptyState
              titre="Cette catégorie n'a pas encore d'article publié"
              description="Le contenu de cette catégorie est en préparation. Contactez le support pour une réponse immédiate."
            />
          )}
        </div>
      </div>
    </div>
  );
}
