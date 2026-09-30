import type { Section } from "./types";

// Types de section réellement rendus en <h2> par SectionBlock.tsx — jamais
// les callouts (info/tip/warn/danger, titre affiché dans un encart, pas un
// <h2>) ni les emplacements de capture (screenshot). Garder cette liste
// synchronisée avec SectionBlock.tsx : c'est elle qui garantit qu'un lien
// du sommaire pointe toujours vers une ancre qui existe réellement.
const HEADING_TYPES = new Set<Section["type"]>(["text", "list", "checklist", "steps"]);

// Filtrage par plage de code point plutôt qu'une regex de marques
// combinantes (0x0300-0x036f) — même technique que normalise() dans
// lib/helpCenter/data.ts, pour éviter tout caractère spécial ambigu dans le
// code source.
export function slugifyTitre(titre: string): string {
  const decomposed = titre.toLowerCase().normalize("NFD");
  let sansAccents = "";
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    sansAccents += ch;
  }
  return sansAccents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export type ArticleHeading = { id: string; titre: string };

export function getArticleHeadings(sections: Section[]): ArticleHeading[] {
  return sections
    .filter((s): s is Section & { titre: string } => HEADING_TYPES.has(s.type) && !!s.titre)
    .map(s => ({ id: slugifyTitre(s.titre), titre: s.titre }));
}
