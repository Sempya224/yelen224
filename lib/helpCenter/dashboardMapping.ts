// Yelen — Mapping dashboard ↔ Help Center public (scaffolding, 24/09/2026).
// Source unique TabKey → ArticleId[], décision verrouillée
// docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md §12. Ce fichier est
// importé PAR le dashboard (app/[slug]/[id]/*) — jamais l'inverse, la couche
// publique (app/guide-prestataire/*) ne dépend jamais du dashboard (principe
// 9 de l'architecture).
//
// Granularité : pas de rebuild "1 écran = 1 guide" (voir §12) — un TabKey
// référence les guides déjà publiés dans lib/helpCenter/data.ts dont ce
// même écran est la source (colonne "Écran/route" du Corpus V1). Un TabKey
// absent de la table ci-dessous n'a simplement aucun guide publié pour
// l'instant — jamais un guide fabriqué pour remplir une case (§11.2).
//
// Table dérivée exclusivement de docs/product/YELEN_PUBLIC_HELP_CENTER_REGISTRE_SUIVI.md
// (vue par écran) recoupée avec les 5 articles réellement "publie" dans
// lib/helpCenter/data.ts au 24/09/2026 — à étendre au même rythme que de
// nouveaux articles sont publiés, jamais par anticipation.

import type { TabKey } from "@/lib/institutionPermissions";
import type { Article, ArticleId } from "./types";
import { getPublishedArticles } from "./data";

export const DASHBOARD_ARTICLE_MAP: Partial<Record<TabKey, ArticleId[]>> = {
  "profil-entreprise": ["horaires-publics-vs-creneaux-reservables"],
  disponibilites: ["horaires-publics-vs-creneaux-reservables"],
  "avis-reputation": ["comment-est-calcule-score-reputation"],
  journal: ["comment-est-determine-niveau-risque-journal"],
  paiements: ["pourquoi-admin-ne-peut-pas-rembourser"],
  facturation: ["difference-facturation-clients-facturation-yelen"],
  "yelen-facturation": ["difference-facturation-clients-facturation-yelen"],
};

// Un ID orphelin (article renommé/dépublié/repassé "brouillon") n'est
// jamais rendu — même discipline que getRelatedArticles (lib/helpCenter/data.ts).
export function getGuidesForTab(tab: TabKey): Article[] {
  const ids = DASHBOARD_ARTICLE_MAP[tab];
  if (!ids?.length) return [];
  const published = getPublishedArticles();
  return ids
    .map(id => published.find(a => a.id === id))
    .filter((a): a is Article => Boolean(a));
}

export function hasGuide(tab: TabKey): boolean {
  return getGuidesForTab(tab).length > 0;
}
