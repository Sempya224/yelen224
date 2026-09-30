import type { Metadata } from "next";
import { CategoryNav } from "../components/CategoryNav";
import { SearchForm } from "../components/SearchForm";
import { EmptyState } from "../components/EmptyState";
import { BackButton } from "../components/BackButton";
import { SearchResultsFiltered } from "../components/SearchResultsFiltered";
import { getCategorie, searchArticles } from "@/lib/helpCenter/data";

export const metadata: Metadata = {
  title: "Recherche",
};

// Server Component recevant `searchParams` en prop — pas de useSearchParams()
// côté client, donc pas de Suspense requis ici (piège documenté du projet,
// spécifique au hook client, absent de ce pattern serveur).
export default async function RecherchePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const sp = await searchParams;
  const query = sp.q ?? "";
  const resultats = query ? searchArticles(query) : [];

  // Filtre par catégorie (retour Bryan 23/09/2026) — uniquement les
  // catégories qui ont au moins un résultat pour CETTE recherche, jamais
  // une liste fixe : chaque résultat de `searchArticles` est déjà un
  // article publié (voir `getPublishedArticles`), donc "publiquement
  // accessible" est déjà garanti ici, pas besoin d'un filtre en plus.
  const comptesParCategorie = new Map<string, number>();
  for (const a of resultats) {
    comptesParCategorie.set(a.domaine, (comptesParCategorie.get(a.domaine) ?? 0) + 1);
  }
  const filtresCategories = [...comptesParCategorie.entries()]
    .map(([domaine, count]) => {
      const categorie = getCategorie(domaine);
      return categorie ? { id: categorie.id, titre: categorie.titre, count } : null;
    })
    .filter((f): f is { id: string; titre: string; count: number } => Boolean(f))
    .sort((a, b) => b.count - a.count);

  // Slug de catégorie validé côté serveur — un `category` invalide, absent
  // ou sans résultat retombe automatiquement sur "toutes" (jamais une
  // catégorie fictive dans l'URL).
  const categorieInitiale = sp.category && filtresCategories.some(f => f.id === sp.category)
    ? sp.category
    : "toutes";

  return (
    <div className="hc-layout">
      <CategoryNav />

      <div className="hc-main">
        <div style={{ marginBottom: "12px" }}>
          <BackButton />
        </div>

        <h1 style={{ fontSize: "22px", fontWeight: 900, margin: "0 0 16px" }}>Recherche</h1>

        <SearchForm defaultValue={query} />

        <div style={{ marginTop: "20px" }}>
          {!query ? (
            <p style={{ color: "var(--hc-text-muted)", fontSize: "13.5px" }}>
              Entrez un mot-clé pour rechercher dans le centre d&apos;aide.
            </p>
          ) : resultats.length > 0 ? (
            <>
              <p style={{ color: "var(--hc-text-muted)", fontSize: "13px", margin: "0 0 12px" }}>
                {resultats.length} résultat{resultats.length !== 1 ? "s" : ""} pour « {query} »
              </p>
              <SearchResultsFiltered
                query={query}
                resultats={resultats}
                filtresCategories={filtresCategories}
                categorieInitiale={categorieInitiale}
              />
            </>
          ) : (
            <EmptyState
              titre={`Aucun résultat pour « ${query} »`}
              description="Essayez un autre mot-clé, ou contactez le support pour une réponse immédiate."
            />
          )}
        </div>
      </div>
    </div>
  );
}
