// Modèle de lignes UNIQUE de l'export du Journal d'activité (24/10/2026).
//
// `construireLignesExport` produit la liste de lignes qui est À LA FOIS signée
// par enregistrerExport et écrite telle quelle dans les fichiers (CSV, JSON,
// XLSX, PDF). Chaque cellule est un texte (ou null) et ce que contient le
// fichier est exactement ce qui est signé : une cellule modifiée change
// l'empreinte. Fonctions pures, sans accès réseau ni base.
//
// Colonnes : l'adresse IP n'existe que pour les rôles qui y ont droit
// (journal.voir_ip) ; les autres rôles n'ont pas la colonne (elle n'est pas
// vide, elle est absente), donc elle n'est pas dans le contenu signé.
// Détails, valeur avant et valeur après sont la sérialisation canonique JSON
// de l'objet d'origine (clés triées).
//
// Les rendus génériques (CSV, JSON, feuilles XLSX), le bloc d'informations et la
// neutralisation des formules tableur vivent dans lib/export/rendus.ts, partagés
// avec les Transactions et les Rapports ; ils sont ré-exportés ici pour ne pas
// changer les imports existants.
import { dateIsoUtc, serialiserCanonique } from "./canonique";
import { dateHeureCourte, dateJourConakry } from "@/lib/heure";
import {
  libelleAction, libelleCategorie, libelleCible, libelleNiveau, libellePlateforme,
} from "@/lib/journalLibelles";
import type { FiltresJournal } from "@/lib/journalRequete";
import {
  MAX_LIGNES_EXPORT, MENTION_PDF_VUE, MENTION_TRONCATURE, genererCsv, genererJson, lignesInformations, neutraliserFormule,
  type ColonneExport, type LigneExport, type ModeleExport, type InfosDocument, type CelluleExport,
} from "./rendus";

export { MENTION_TRONCATURE, lignesInformations };
export type { CelluleExport, ColonneExport, InfosDocument, LigneExport, ModeleExport };

export const VERSION_GABARIT_JOURNAL = "journal-1";
export const MAX_LIGNES_JOURNAL = MAX_LIGNES_EXPORT;

export type EntreeExportJournal = {
  audit_id: string;
  membre_nom: string;
  action: string;
  categorie: string;
  niveau: string;
  cible_table: string;
  details: Record<string, unknown> | null;
  ancienne_valeur: Record<string, unknown> | null;
  nouvelle_valeur: Record<string, unknown> | null;
  ip: string | null;
  navigateur: string | null;
  os: string | null;
  plateforme: string;
  created_at: string;
};

const COLONNES_AVANT_IP: ColonneExport[] = [
  { cle: "reference", entete: "Référence" },
  { cle: "date", entete: "Date (heure de Conakry)" },
  { cle: "horodatage_utc", entete: "Horodatage (UTC)" },
  { cle: "membre", entete: "Membre" },
  { cle: "action", entete: "Action (code)" },
  { cle: "action_libelle", entete: "Action" },
  { cle: "categorie", entete: "Catégorie" },
  { cle: "niveau", entete: "Niveau" },
  { cle: "cible", entete: "Cible" },
  { cle: "details", entete: "Détails" },
  { cle: "avant", entete: "Valeur avant" },
  { cle: "apres", entete: "Valeur après" },
];
const COLONNE_IP: ColonneExport = { cle: "ip", entete: "Adresse IP" };
const COLONNES_APRES_IP: ColonneExport[] = [
  { cle: "navigateur", entete: "Navigateur" },
  { cle: "os", entete: "Système" },
  { cle: "plateforme", entete: "Plateforme" },
];

function jsonCanonique(v: Record<string, unknown> | null | undefined, videSiNul: boolean): CelluleExport {
  if (v === null || v === undefined) return videSiNul ? null : "{}";
  return serialiserCanonique(v);
}

export function construireLignesExport(entrees: EntreeExportJournal[], opts: { voirIp: boolean }): ModeleExport {
  const colonnes = [...COLONNES_AVANT_IP, ...(opts.voirIp ? [COLONNE_IP] : []), ...COLONNES_APRES_IP];
  const lignes = entrees.map((e): LigneExport => {
    const ligne: LigneExport = {
      reference: neutraliserFormule(e.audit_id),
      date: dateHeureCourte(e.created_at),
      horodatage_utc: dateIsoUtc(e.created_at),
      membre: neutraliserFormule(e.membre_nom),
      action: neutraliserFormule(e.action),
      action_libelle: neutraliserFormule(libelleAction(e.action, e.details)),
      categorie: neutraliserFormule(libelleCategorie(e.categorie)),
      niveau: neutraliserFormule(libelleNiveau(e.niveau)),
      cible: neutraliserFormule(e.cible_table ? libelleCible(e.cible_table).texte : null),
      details: jsonCanonique(e.details, false),
      avant: jsonCanonique(e.ancienne_valeur, true),
      apres: jsonCanonique(e.nouvelle_valeur, true),
    };
    if (opts.voirIp) ligne.ip = neutraliserFormule(e.ip);
    ligne.navigateur = neutraliserFormule(e.navigateur);
    ligne.os = neutraliserFormule(e.os);
    ligne.plateforme = neutraliserFormule(libellePlateforme(e.plateforme));
    return ligne;
  });
  return { colonnes, lignes };
}

// Filtres tels que signés et stockés : tous les paramètres de la requête, plus
// la limite et la troncature (un document ne peut pas passer pour complet
// quand il est tronqué).
export function construireFiltresSignes(f: FiltresJournal, tronque: boolean): Record<string, unknown> {
  return {
    action: f.action, membre_id: f.membreId, date_from: f.dateFrom, date_to: f.dateTo, cible_ids: f.cibleIds,
    q: f.q, categorie: f.categorie, niveau: f.niveau, plateforme: f.plateforme, role: f.role,
    limite_lignes: MAX_LIGNES_JOURNAL, tronque,
  };
}

// Périmètre en français pour les en-têtes des fichiers lisibles.
export function resumerFiltresLisibles(f: FiltresJournal): string {
  const p: string[] = [];
  if (f.dateFrom || f.dateTo) {
    p.push(`Période : ${f.dateFrom ? dateJourConakry(f.dateFrom) : "…"} au ${f.dateTo ? dateJourConakry(f.dateTo) : "…"}`);
  }
  if (f.categorie) p.push(`Catégorie : ${libelleCategorie(f.categorie)}`);
  if (f.niveau) p.push(`Niveau : ${libelleNiveau(f.niveau)}`);
  if (f.plateforme) p.push(`Plateforme : ${libellePlateforme(f.plateforme)}`);
  if (f.role) p.push(`Rôle : ${f.role}`);
  if (f.membreId) p.push(`Personne : ${f.membreId}`);
  if (f.action) p.push(`Action : ${libelleAction(f.action)}`);
  if (f.q) p.push(`Recherche : « ${f.q} »`);
  return p.length ? p.join(" — ") : "Aucun filtre (toutes les entrées)";
}

export const MENTION_PDF = MENTION_PDF_VUE;

// CSV du Journal : rendu générique (bloc de 7 lignes, ligne vide, tableau).
export function genererCsvJournal(modele: ModeleExport, infos: InfosDocument): string {
  return genererCsv(modele, infos);
}

// Cellules détails / avant / après : objets dans le fichier JSON. Valeur
// signée = serialiserCanonique(objet) (le vérificateur re-sérialise).
const CLES_JSON = new Set(["details", "avant", "apres"]);
export function ligneEnStructureJson(ligne: LigneExport): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(ligne)) {
    if (CLES_JSON.has(cle) && typeof valeur === "string") {
      try { sortie[cle] = JSON.parse(valeur); continue; } catch { /* conservé tel quel */ }
    }
    sortie[cle] = valeur;
  }
  return sortie;
}

export function genererJsonJournal(modele: ModeleExport, infos: InfosDocument): string {
  return genererJson(modele, infos, ligneEnStructureJson);
}
