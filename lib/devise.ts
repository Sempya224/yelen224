// Devise unique du produit — source de vérité centrale (décision CEO
// 06/08/2026). "FCFA" était utilisé partout dans le code jusqu'ici, par
// erreur : le FCFA est la monnaie de la zone UEMOA/CEMAC (Sénégal, Côte
// d'Ivoire, etc.), PAS celle de la République de Guinée, marché exclusif
// de Yelen224 (voir CLAUDE.md) — la vraie monnaie est le Franc Guinéen
// (GNF). Centralisé ici pour qu'un futur pays avec une autre devise ne
// nécessite qu'un changement à un seul endroit (ou une résolution par
// pays/institution le jour venu) plutôt qu'un nouveau remplacement massif
// dans tout le code, comme celui qui vient d'être fait pour GNF.
export const DEVISE_CODE = "GNF";
export const DEVISE_LABEL = "GNF";

export function formatMontant(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " " + DEVISE_LABEL;
}
