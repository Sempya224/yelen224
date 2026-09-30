// Yelen Provider Help Center — Couche publique (scaffolding, 22/09/2026).
// Types conformes à docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md §3.
// Distinct de app/[slug]/[id]/*Tab.tsx (aide contextuelle in-product,
// TabKey) — ce fichier ne doit jamais dépendre du dashboard.

import type { MembreRole } from "@/lib/institutionPermissions";

export type DomaineId = string;
export type ArticleId = string;

export type SectionType =
  | "text"
  | "warn"
  | "tip"
  | "info"
  | "danger"
  | "list"
  | "checklist"
  | "steps"
  | "screenshot";

/** Emplacement éditorial pour une future capture d'écran réelle — jamais une
 * image, jamais un contenu destiné au prestataire final (standard v2,
 * docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md). Uniquement pour
 * `Section.type === "screenshot"`. */
export type ScreenshotPlaceholder = {
  ecran: string;
  zone: string;
  montrer: string[];
};

export type Section = {
  titre?: string;
  contenu?: string;
  type: SectionType;
  items?: string[];
  /** Uniquement pour type "screenshot" (§2 du standard v2). */
  screenshot?: ScreenshotPlaceholder;
};

export type Categorie = {
  id: DomaineId;
  titre: string;
  ordre: number;
  /** Description courte sous le H1 de la page catégorie (UX Lock 22/09/2026, §7). */
  description?: string;
};

// Cycle de vie simplifié déjà verrouillé dans l'architecture (§9) : un
// article "brouillon" ne doit jamais apparaître en nav/compteurs/recherche/
// catégories/articles associés (UX Lock 22/09/2026, §10) — appliqué par les
// fonctions de lecture de lib/helpCenter/data.ts, pas par ce type lui-même.
export type ArticleStatus = "brouillon" | "publie" | "archive";

export type Article = {
  id: ArticleId;
  domaine: DomaineId;
  titre: string;
  /** Carte de liste + meta description SEO (generateMetadata). */
  resume: string;
  sections: Section[];
  /** Fichiers/routes réels cités — gouvernance interne, jamais rendu au lecteur (§3, §11.3). */
  sourceCode?: string[];
  /** Date ISO — interne par défaut (§3, §11.3). */
  derniereVerification: string;
  /** Décision éditoriale par article : afficher "Mis à jour le" au lecteur
   * uniquement quand ça apporte une vraie valeur — jamais automatique. */
  miseAJourAffichee?: boolean;
  /** Optionnel, absent = tous les rôles. */
  audiences?: MembreRole[];
  motsClefs?: string[];
  /** Absent = AUTEUR_PAR_DEFAUT (lib/helpCenter/data.ts) — aucun nom inventé. */
  auteur?: string;
  /** Champ requis (pas de défaut implicite) — chaque article déclare son état explicitement. */
  status: ArticleStatus;
  /** IDs réels d'articles liés — jamais une relation inventée ; une entrée
   * qui ne pointe vers aucun article publié existant n'est jamais rendue
   * (UX Lock 22/09/2026, §9). */
  relatedArticles?: ArticleId[];
};
