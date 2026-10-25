// Rendus génériques des exports (24/10/2026) : modèle de lignes, bloc d'informations,
// CSV, JSON et feuilles XLSX. Extraits de lib/export/journalLignes.ts pour servir
// aussi les Transactions et les Rapports ; la sortie du Journal est inchangée
// (vérifiée par les tests existants du Journal).
//
// Cellules du modèle : texte, nombre (entier ou décimal fini) ou vide. Le contenu
// signé est EXACTEMENT ce que contient le fichier, cellule par cellule.
import type ExcelJS from "exceljs";
import { dateHeureCourte } from "@/lib/heure";

export const MAX_LIGNES_EXPORT = 5000;

export type CelluleExport = string | number | null;
export type LigneExport = Record<string, CelluleExport>;
export type ColonneExport = { cle: string; entete: string };
export type ModeleExport = { colonnes: ColonneExport[]; lignes: LigneExport[] };

export type InfosDocument = {
  reference: string;
  etablissement: string;
  creeLe: string;            // ISO UTC
  auteur: string;
  role: string;              // libellé du rôle
  filtresLisibles: string;
  nbLignes: number;
  tronque: boolean;
  hash: string;
  versionGabarit: string;
  filtresSignes: Record<string, unknown>;
  // Texte affiché quand `tronque` est vrai ; par défaut MENTION_TRONCATURE (5000 lignes).
  mentionTroncature?: string;
  // Libellé du compteur (« Nombre de lignes » par défaut).
  libelleNombre?: string;
};

// Mention d'en-tête des PDF : le PDF n'est qu'une vue du jeu de données certifié.
export const MENTION_PDF_VUE = "Ce PDF est une vue du jeu de données certifié. L'annexe de données certifiées (à venir) permettra la vérification complète.";

export const MENTION_TRONCATURE =`Résultat limité aux ${MAX_LIGNES_EXPORT} entrées les plus récentes correspondant aux filtres : le nombre réel d'entrées peut être supérieur.`;

// Protection contre l'injection de formule tableur : une cellule texte qui commence
// par = + - @ (ou tabulation / retour chariot) est préfixée d'une apostrophe DANS le
// modèle, donc dans le fichier ET dans le contenu signé (le fichier ne diffère jamais
// de ce qui est signé).
const DEBUT_FORMULE = /^[=+\-@\t\r]/;
export function neutraliserFormule(v: string | null): string | null {
  if (v === null || v === "") return null;
  return DEBUT_FORMULE.test(v) ? `'${v}` : v;
}

// Les 7 lignes « Champ / Valeur » communes (bloc d'en-tête du CSV, feuille
// Informations du XLSX).
export function lignesInformations(d: InfosDocument): { champ: string; valeur: string }[] {
  return [
    { champ: "Référence", valeur: d.reference },
    { champ: "Établissement", valeur: d.etablissement },
    { champ: "Généré le (heure de Conakry)", valeur: dateHeureCourte(d.creeLe) },
    { champ: "Généré par", valeur: `${d.auteur} (${d.role})` },
    { champ: "Filtres appliqués", valeur: d.filtresLisibles },
    { champ: d.libelleNombre ?? "Nombre de lignes", valeur: `${d.nbLignes}${d.tronque ? ` — ${d.mentionTroncature ?? MENTION_TRONCATURE}` : ""}` },
    { champ: "Empreinte SHA-256", valeur: d.hash },
  ];
}

function celluleCsv(v: CelluleExport): string {
  if (typeof v === "number") return String(v);
  return `"${(v ?? "").replace(/"/g, '""')}"`;
}

// CSV : BOM UTF-8, séparateur point-virgule (Excel français), fins de ligne CRLF.
// Bloc de métadonnées de 7 lignes « Champ;Valeur », une ligne vide, puis le tableau.
// ⚠️ Le bloc d'en-tête est à ignorer pour une lecture mécanique (le tableau commence
// après la première ligne vide). Les nombres sont écrits sans guillemets.
export function genererCsv(modele: ModeleExport, infos: InfosDocument): string {
  const bloc = lignesInformations(infos).map(l => `${celluleCsv(l.champ)};${celluleCsv(l.valeur)}`);
  const entete = modele.colonnes.map(c => celluleCsv(c.entete)).join(";");
  const corps = modele.lignes.map(l => modele.colonnes.map(c => celluleCsv(l[c.cle] ?? null)).join(";"));
  return `﻿${[...bloc, "", entete, ...corps].join("\r\n")}\r\n`;
}

// JSON : objet { document, lignes }. `ligneEnStructure` permet à un export de
// restituer certaines cellules en objets (ex. détails du Journal).
export function genererJson(
  modele: ModeleExport, infos: InfosDocument, ligneEnStructure: (l: LigneExport) => Record<string, unknown> = l => ({ ...l }),
): string {
  return JSON.stringify({
    document: {
      reference: infos.reference, empreinte: infos.hash, cree_le: infos.creeLe, auteur: infos.auteur, role: infos.role,
      etablissement: infos.etablissement, filtres: infos.filtresSignes, nb_lignes: infos.nbLignes,
      version_gabarit: infos.versionGabarit, tronque: infos.tronque,
    },
    lignes: modele.lignes.map(ligneEnStructure),
  }, null, 2);
}

// ── Feuilles XLSX ──────────────────────────────────────────────────────────
export function ajouterFeuilleChampValeur(wb: ExcelJS.Workbook, nom: string, lignes: { champ: string; valeur: string }[]): void {
  const f = wb.addWorksheet(nom);
  f.columns = [{ header: "Champ", key: "champ", width: 30 }, { header: "Valeur", key: "valeur", width: 90 }];
  f.getRow(1).font = { bold: true };
  lignes.forEach(l => f.addRow(l));
  f.eachRow(r => { r.alignment = { vertical: "top", wrapText: true }; });
}

export function ajouterFeuilleTable(
  wb: ExcelJS.Workbook, nom: string, colonnes: ColonneExport[], lignes: LigneExport[],
  options: { largeurs?: Record<string, number>; figerEntete?: boolean } = {},
): ExcelJS.Worksheet {
  const f = wb.addWorksheet(nom);
  f.columns = colonnes.map(c => ({ header: c.entete, key: c.cle, width: options.largeurs?.[c.cle] ?? 18 }));
  f.getRow(1).font = { bold: true };
  if (options.figerEntete !== false) f.views = [{ state: "frozen", ySplit: 1 }];
  lignes.forEach(l => f.addRow(l));
  return f;
}
