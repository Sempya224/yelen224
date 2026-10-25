// Modèle de contenu de l'export du Rapport financier exécutif (24/10/2026). Fonctions
// pures. Le rapport est un agrégat, pas une liste : ses sections (KPI, top services,
// répartition par catégorie, évolution mensuelle, résumé) sont aplaties en lignes
// `{ section, ... }` ; ces lignes sont à la fois signées et présentes, cellule par
// cellule, dans les feuilles du fichier XLSX. Montants et pourcentages sont des
// nombres (null quand aucune comparaison n'est affichable).
//
// Périmètre du calcul (lib/rapportsAggregation.ts) : année en cours et année
// précédente, au plus LIMITE_RESERVATIONS_RAPPORT réservations (les plus récentes).
// Quand cette limite est atteinte, les chiffres sont sous-évalués : le document le
// dit et la limite est signée avec les filtres.
import type { RapportExecutif } from "@/lib/rapportsAggregation";
import { DEVISE_LABEL } from "@/lib/devise";
import { dateIsoUtc } from "./canonique";
import { neutraliserFormule, type ColonneExport, type LigneExport } from "./rendus";
import type { SectionPdf } from "./pdf/gabarit";
import { formaterMontantPdf } from "./transactionsLignes";

export const VERSION_GABARIT_RAPPORT = "rapport-financier-1";
export const TYPE_EXPORT_RAPPORT = "rapport_financier";
export const PERIMETRE_RAPPORT = "Rapport financier exécutif : année en cours et année précédente";

const PERIODES_KPI = [
  ["aujourdhui", "Aujourd'hui"], ["semaine", "Cette semaine"], ["mois", "Ce mois"], ["annee", "Cette année"],
] as const;

export type FeuilleRapport = {
  nom: string;
  colonnes: ColonneExport[];
  lignes: LigneExport[];
  // Phrases ajoutées sous le tableau (feuille « Résumé »), précédées d'une ligne vide
  // et du titre « Synthèse ».
  synthese?: string[];
};

export type ModeleRapport = {
  // Lignes SIGNÉES : toutes les sections, à plat.
  lignes: LigneExport[];
  feuilles: FeuilleRapport[];
};

export function libelleVariation(delta: number | null): string {
  return delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta}%`;
}

function avecSection(section: string, lignes: LigneExport[]): LigneExport[] {
  return lignes.map(l => ({ section, ...l }));
}

export function construireModeleRapport(r: RapportExecutif): ModeleRapport {
  const kpi: LigneExport[] = PERIODES_KPI.map(([cle, label]) => ({
    periode: label, montant: r.kpi[cle].montant, ventes: r.kpi[cle].nb, variation_pct: r.kpi[cle].delta,
  }));
  const services: LigneExport[] = r.top_services.map(s => ({
    service: neutraliserFormule(s.nom), categorie: neutraliserFormule(s.categorie), ventes: s.nb, montant: s.montant,
    variation_pct: s.delta, part_ca_pct: s.partCA, duree_min: s.dureeMinutes,
  }));
  const categories: LigneExport[] = r.repartition_categories.map(c => ({
    categorie: neutraliserFormule(c.categorie), montant: c.montant, part_pct: c.pct,
  }));
  const evolution: LigneExport[] = r.evolution.annee.map(p => ({ mois: neutraliserFormule(p.label), montant: p.montant, ventes: p.ventes }));
  const resume: LigneExport[] = r.resume.map(phrase => ({ phrase: neutraliserFormule(phrase) }));

  const feuilles: FeuilleRapport[] = [
    {
      nom: "Résumé",
      colonnes: [
        { cle: "periode", entete: "Période" }, { cle: "montant", entete: `Montant (${DEVISE_LABEL})` },
        { cle: "ventes", entete: "Ventes" }, { cle: "variation_pct", entete: "Évolution vs période précédente (%)" },
      ],
      lignes: kpi, synthese: r.resume,
    },
    {
      nom: "Top services",
      colonnes: [
        { cle: "service", entete: "Service" }, { cle: "categorie", entete: "Catégorie" }, { cle: "ventes", entete: "Ventes" },
        { cle: "montant", entete: `CA (${DEVISE_LABEL})` }, { cle: "variation_pct", entete: "Évolution vs an. préc. (%)" },
        { cle: "part_ca_pct", entete: "Part du CA (%)" }, { cle: "duree_min", entete: "Durée (min)" },
      ],
      lignes: services,
    },
    {
      nom: "Répartition catégories",
      colonnes: [
        { cle: "categorie", entete: "Catégorie" }, { cle: "montant", entete: `Montant (${DEVISE_LABEL})` }, { cle: "part_pct", entete: "Part du CA (%)" },
      ],
      lignes: categories,
    },
    {
      nom: "Évolution mensuelle",
      colonnes: [{ cle: "mois", entete: "Mois" }, { cle: "montant", entete: `Montant (${DEVISE_LABEL})` }, { cle: "ventes", entete: "Ventes" }],
      lignes: evolution,
    },
  ];

  const lignes: LigneExport[] = [
    { section: "meta", genere_le: dateIsoUtc(r.genere_le) },
    ...avecSection("kpi", kpi),
    ...avecSection("top_services", services),
    ...avecSection("repartition_categories", categories),
    ...avecSection("evolution_mensuelle", evolution),
    ...avecSection("resume", resume),
  ];
  return { lignes, feuilles };
}

// Filtres signés : le périmètre ; la limite de lecture n'y figure QUE si elle est atteinte.
export function construireFiltresRapportSignes(limiteAtteinte: boolean, limite: number): Record<string, unknown> {
  return {
    perimetre: "annee_en_cours_et_precedente",
    ...(limiteAtteinte ? { limite_reservations: limite, limite_atteinte: true } : {}),
  };
}

export function mentionLimiteRapport(limite: number): string {
  return `Chiffres calculés sur les ${limite} réservations les plus récentes.`;
}

// Corps du PDF (portrait) : cartes KPI, résumé, top services, répartition par catégorie.
export function sectionsPdfRapport(r: RapportExecutif): SectionPdf[] {
  return [
    {
      type: "kpis",
      items: PERIODES_KPI.map(([cle, label]) => {
        const k = r.kpi[cle];
        return {
          label, valeur: formaterMontantPdf(k.montant),
          detail: `${libelleVariation(k.delta)} · ${k.nb} vente${k.nb > 1 ? "s" : ""}`,
          ton: k.delta === null ? "neutre" as const : k.delta >= 0 ? "positif" as const : "negatif" as const,
        };
      }),
    },
    { type: "liste", titre: "Résumé", items: r.resume },
    {
      type: "tableau", titre: "Top services (cette année)", vide: "Aucune donnée pour le moment.",
      colonnes: [
        { cle: "service", entete: "Service", fraction: 0.28 }, { cle: "categorie", entete: "Catégorie", fraction: 0.18 },
        { cle: "ventes", entete: "Ventes", fraction: 0.10, align: "right" }, { cle: "montant", entete: "CA", fraction: 0.18, align: "right" },
        { cle: "variation", entete: "Évolution", fraction: 0.13, align: "right" }, { cle: "part", entete: "Part du CA", fraction: 0.13, align: "right" },
      ],
      lignes: r.top_services.map(s => ({
        service: s.nom, categorie: s.categorie, ventes: s.nb, montant: formaterMontantPdf(s.montant),
        variation: libelleVariation(s.delta), part: `${s.partCA}%`,
      })),
    },
    {
      type: "tableau", titre: "Répartition des revenus par catégorie", vide: "Aucune donnée pour le moment.",
      colonnes: [
        { cle: "categorie", entete: "Catégorie", fraction: 0.55 }, { cle: "montant", entete: "Montant", fraction: 0.30, align: "right" },
        { cle: "part", entete: "Part", fraction: 0.15, align: "right" },
      ],
      lignes: r.repartition_categories.map(c => ({ categorie: c.categorie, montant: formaterMontantPdf(c.montant), part: `${c.pct}%` })),
    },
  ];
}
