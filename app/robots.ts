import type { MetadataRoute } from "next";

// Première introduction d'un robots.txt dans le projet (§5 de l'architecture
// Help Center public). Rien ne l'interdisait ni ne l'autorisait
// explicitement avant ce lot — autorise l'indexation générale, à
// l'exception des zones privées (dashboard, admin, API).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yelen224.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/clock", "/entree-admin"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
