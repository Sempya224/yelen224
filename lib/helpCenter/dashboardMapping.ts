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
// (vue par écran) recoupée avec les articles réellement "publie" dans
// lib/helpCenter/data.ts (6 au 17/10/2026) — à étendre au même rythme que de
// nouveaux articles sont publiés, jamais par anticipation. Reprise du
// chantier le 17/10/2026 : traitement écran par écran de la liste de
// priorité verrouillée dans YELEN_PUBLIC_HELP_CENTER_CORPUS_V1.md §9, voir
// le registre de suivi pour l'état d'avancement à jour.

import type { TabKey } from "@/lib/institutionPermissions";
import type { Article, ArticleId } from "./types";
import { getPublishedArticles } from "./data";

export const DASHBOARD_ARTICLE_MAP: Partial<Record<TabKey, ArticleId[]>> = {
  accueil: ["centre-de-configuration-avant-tableau-de-bord", "compte-suspendu-que-faire"],
  "profil-entreprise": ["profil-entreprise-responsable-administration-securite", "pourquoi-statut-juridique-avant-documents", "horaires-publics-vs-creneaux-reservables"],
  documents: ["pourquoi-statut-juridique-avant-documents"],
  "valider-rdv": ["annuler-validation-vs-annuler-reservation"],
  "documents-clients": ["statuts-document-demande-client"],
  rdv: ["difference-rdv-vs-rdv-passes"],
  "rdv-historique": ["difference-rdv-vs-rdv-passes"],
  "mes-offres": ["pourquoi-offres-partenaires-moderees", "statuts-offre-partenaire-suspendre-vs-archiver"],
  partenariat: ["devenir-partenaire-yelen"],
  "communaute-pro": ["rejoindre-yelen-community"],
  "profil-responsable": ["profil-entreprise-responsable-administration-securite"],
  profil: ["profil-entreprise-responsable-administration-securite"],
  "parametres-securite": ["profil-entreprise-responsable-administration-securite", "proteger-compte-pin-passkey-2fa"],
  disponibilites: ["horaires-publics-vs-creneaux-reservables"],
  "avis-reputation": ["comment-est-calcule-score-reputation", "quel-canal-pour-communiquer-avec-vos-clients"],
  journal: ["comment-est-determine-niveau-risque-journal"],
  equipe: ["roles-equipe-et-permissions", "3-codes-qr-yelen"],
  codeqr: ["3-codes-qr-yelen", "que-mesure-compteur-qr"],
  paiements: ["pourquoi-admin-ne-peut-pas-rembourser"],
  facturation: ["difference-facturation-clients-facturation-yelen"],
  "yelen-facturation": ["difference-facturation-clients-facturation-yelen", "pourquoi-yelen-business-bientot-disponible"],
  "yelen-compte": ["pourquoi-yelen-business-bientot-disponible"],
  "yelen-contrat": ["pourquoi-yelen-business-bientot-disponible"],
  "yelen-forfait": ["pourquoi-yelen-business-bientot-disponible"],
  "yelen-paiements": ["pourquoi-yelen-business-bientot-disponible"],
  "yelen-transactions": ["pourquoi-yelen-business-bientot-disponible"],
  "yelen-frais-commissions": ["pourquoi-yelen-business-bientot-disponible"],
  "yelen-reconciliation": ["pourquoi-yelen-business-bientot-disponible"],
  "yelen-documents": ["pourquoi-yelen-business-bientot-disponible"],
  "questions-clients": ["quel-canal-pour-communiquer-avec-vos-clients"],
  messagerie: ["quel-canal-pour-communiquer-avec-vos-clients"],
  signalements: ["quel-canal-pour-communiquer-avec-vos-clients", "signalement-recu-contre-votre-etablissement", "comment-signaler-un-citoyen", "statuts-signalement"],
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
