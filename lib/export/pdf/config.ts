// Configuration du gabarit PDF commun des exports (24/10/2026).

// Couleurs de la marque (mêmes valeurs que lib/recuPdf.ts et lib/rapportsPdf.ts) :
// or Yelen en aplat (jamais de dégradé), texte, texte atténué, bordure.
export const COULEURS_PDF = {
  or: "#F5A623",
  texte: "#111111",
  attenue: "#6C6C70",
  bordure: "#E5E5EA",
  // Fond de l'en-tête de colonnes et zébrage du tableau (gris très léger).
  enteteTableau: "#F2F2F5",
  zebre: "#F8F8FA",
  // Tons des cartes KPI du mode « sections » (mêmes valeurs que lib/rapportsPdf.ts).
  positif: "#1DAA61",
  negatif: "#D64545",
} as const;

// ⚠️ Textes fournis par Yelen (rédaction et validation juridiques hors du code).
// Vides par défaut : un texte vide n'affiche RIEN dans le PDF, ni ligne ni titre.
// Aucune valeur n'est écrite ici par le développement.
export const MENTION_CONFIDENTIALITE_EXPORT = "";
export const TEXTE_JURIDIQUE_EXPORT = "";

// Polices embarquées. null = polices standard pdfkit (Helvetica, encodage
// WinAnsi). Pour brancher Plus Jakarta Sans plus tard : déposer les fichiers dans
// le dépôt, renseigner leurs chemins (relatifs à la racine du projet), et déclarer
// ces fichiers dans `outputFileTracingIncludes` de next.config.ts (pdfkit lit ses
// fichiers sur disque à l'exécution). En cas de fichier manquant, le gabarit
// retombe sur Helvetica sans échouer.
export type FichiersPolices = { regulier: string; gras: string; italique: string };
export const FICHIERS_POLICES: FichiersPolices | null = null;

// Verrouillage du PDF (permissions, mot de passe propriétaire) : NON IMPLÉMENTÉ,
// volontairement désactivé. Un PDF chiffré peut gêner la future vérification par
// téléversement et l'accessibilité ; de plus ce n'est qu'une dissuasion
// (contournable). Le paramètre existe pour ne pas refondre le gabarit plus tard.
export const VERROUILLAGE_PDF_PAR_DEFAUT = false;

export const LANGUE_PDF = "fr-FR";

// Plafond de lignes d'un PDF (les plus récentes). Le rendu de pdfkit est lent
// (environ 5 ms par ligne de 7 colonnes sur la machine de mesure du 24/10/2026 :
// 5000 lignes ≈ 34 s, 1000 lignes ≈ 5 s) et un export trop long risque de
// dépasser le délai d'une fonction serverless. Les formats tableur contiennent
// l'ensemble des lignes ; le PDF est une vue partielle.
export const PDF_MAX_LIGNES = 1000;
