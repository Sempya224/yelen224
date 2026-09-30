import { getPopularArticles } from "@/lib/helpCenter/data";
import { ArticleCard } from "./ArticleCard";

// Composant préparé structurellement (UX Lock 22/09/2026, §6) — ne
// s'affiche jamais tant qu'aucune mesure d'usage réelle n'existe
// (getPopularArticles() reste vide en V1, §11.4 de l'architecture). Pas de
// classement fabriqué : mieux vaut une section absente qu'une section
// mensongère.
export function PopularArticles() {
  const articles = getPopularArticles();
  if (articles.length === 0) return null;

  return (
    <div style={{ marginTop: "28px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 12px" }}>Articles populaires</h2>
      {articles.map(a => <ArticleCard key={a.id} article={a} />)}
    </div>
  );
}
