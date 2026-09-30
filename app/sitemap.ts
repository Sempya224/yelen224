import type { MetadataRoute } from "next";
import { CATEGORIES, getPublishedArticles } from "@/lib/helpCenter/data";

// Première introduction d'un sitemap dans le projet (§5 de l'architecture
// Help Center public) — scope volontairement limité à /guide-prestataire
// pour ce lot. Étendre au reste du site public est une décision séparée,
// non tranchée ici.
//
// Domaine de production pas encore décidé (voir mémoire du projet —
// déploiement actuel encore sur *.netlify.app, yelen224.com pas encore le
// domaine live) : NEXT_PUBLIC_SITE_URL doit être posé par Bryan avant que
// ce sitemap soit exact en production.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yelen224.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/guide-prestataire`, lastModified: now },
    ...CATEGORIES.map(c => ({
      url: `${SITE_URL}/guide-prestataire/${c.id}`,
      lastModified: now,
    })),
    ...getPublishedArticles().map(a => ({
      url: `${SITE_URL}/guide-prestataire/${a.domaine}/${a.id}`,
      lastModified: new Date(a.derniereVerification),
    })),
  ];

  return routes;
}
