// Source unique de navigation du Centre légal Yelen (chantier Legal Yelen
// — architecture globale de navigation, 23/09/2026). Un seul tableau à
// étendre pour ajouter une future surface légale sans toucher au shell
// (LegalHeader/LegalSidebar/LegalFooter/LegalBreadcrumb le consomment
// tous). Volontairement statique — pas de lien vers un document qui
// n'existe pas encore.
export type LegalNavItem = { label: string; href: string };
export type LegalNavGroup = { titre: string; items: LegalNavItem[] };

export const LEGAL_OVERVIEW_HREF = "/legal";

// GAP 3 (audit Phase 4, corrigé 23/09/2026) : seuil desktop/mobile du Centre
// légal, jusqu'ici recopié en dur (899) dans app/(legal)/layout.tsx,
// LegalTableOfContents.tsx et la grille interne de chaque document migré au
// modèle A. Source unique désormais — un changement de seuil ne se fait
// qu'ici.
export const LEGAL_BREAKPOINT_PX = 899;

export const LEGAL_NAV_GROUPS: LegalNavGroup[] = [
  { titre: "Centre légal", items: [
    { label: "Vue d'ensemble", href: LEGAL_OVERVIEW_HREF },
  ]},
  { titre: "Documents généraux", items: [
    { label: "Conditions générales d'utilisation", href: "/cgu" },
    { label: "Politique de confidentialité", href: "/confidentialite" },
    { label: "Politique des cookies", href: "/politique-cookies" },
    { label: "Mentions légales", href: "/mentions-legales" },
  ]},
  { titre: "Documents professionnels", items: [
    { label: "Conditions Générales Prestataires", href: "/conditions-prestataires" },
  ]},
  { titre: "Offres & programmes", items: [
    { label: "Conditions des Offres Yelen", href: "/offres/conditions" },
  ]},
];

export function findLegalNavItem(pathname: string): LegalNavItem | undefined {
  return LEGAL_NAV_GROUPS.flatMap(g => g.items).find(i => i.href === pathname);
}

// Recherche du hero /legal (retour Bryan 23/09/2026, façon Help Center) —
// mêmes règles de normalisation que lib/helpCenter/data.ts::searchArticles
// (accents ignorés). Opère sur LEGAL_NAV_GROUPS uniquement : 6 documents
// réels codés en dur, pas de corpus séparé à maintenir en double.
function normaliser(valeur: string): string {
  const decompose = valeur.toLowerCase().normalize("NFD");
  let out = "";
  for (const ch of decompose) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    out += ch;
  }
  return out;
}

export function searchLegalDocuments(query: string): LegalNavItem[] {
  const q = normaliser(query.trim());
  if (!q) return [];
  return LEGAL_NAV_GROUPS
    .filter(g => g.titre !== "Centre légal")
    .flatMap(g => g.items)
    .filter(item => normaliser(item.label).includes(q));
}
