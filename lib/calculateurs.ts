// Données et formules pour "Vos outils financiers" (app/menu/calculatrice)
// — chantier engagement du 25/07/2026. Paramètres issus de recherches
// Perplexity commandées par Bryan (Crédit Rural de Guinée, BCRG, BSIC
// Guinée, Guinéenews) — zéro taux ni frais inventé. Les formules
// elles-mêmes sont le calcul standard correspondant à ce que les sources
// décrivent (dégressif = amortissement sur capital restant dû ; épargne
// programmée rémunérée = valeur future d'une suite de versements) — pas
// une donnée en soi, juste l'application correcte des paramètres sourcés.

export const CREDIT = {
  // Crédit Rural de Guinée : 3%/mois (court terme, dégressif), 2,5%/mois
  // (moyen terme, dégressif), 2%/mois (crédit salarié). On propose la
  // fourchette réelle plutôt qu'un chiffre unique.
  tauxMensuelMin: 0.02,
  tauxMensuelMax: 0.035,
  tauxMensuelDefaut: 0.025,
  dureeMoisMin: 3,
  dureeMoisMax: 12,
  dureeMoisDefaut: 6,
  montantMin: 100_000,
  montantMax: 5_000_000,
  montantDefaut: 500_000,
  source: { label: "Crédit Rural de Guinée — Simulateur de crédit", url: "https://creditruralguinee.org/simulateur-de-credit/" },
  sourceDuree: { label: "Crédit Rural de Guinée — Taux et conditions", url: "https://creditruralguinee.org/taux-et-conditions/" },
  sourceFrais: { label: "Étude sur la microfinance en Guinée (base.socioeco.org)", url: "https://base.socioeco.org/docs/bah_apha_-_amadou.pdf" },
} as const;

// Mensualité d'un crédit dégressif (intérêts calculés sur le capital
// restant dû, comme au Crédit Rural de Guinée) — formule d'amortissement
// standard, pas un taux flat sur le montant initial.
export function mensualiteDegressif(montant: number, tauxMensuel: number, dureeMois: number): number {
  if (tauxMensuel === 0) return montant / dureeMois;
  const r = tauxMensuel;
  const facteur = Math.pow(1 + r, dureeMois);
  return (montant * r * facteur) / (facteur - 1);
}

export type ScenarioEpargneId = "tontine" | "omig" | "imf";

export const SCENARIOS_EPARGNE: {
  id: ScenarioEpargneId;
  label: string;
  tauxAnnuel: number;
  description: string;
  source?: { label: string; url: string };
}[] = [
  {
    id: "tontine",
    label: "Tontine",
    tauxAnnuel: 0,
    description: "Cotisation fixe entre membres, sans intérêt — le fonds tourne à tour de rôle.",
  },
  {
    id: "omig",
    label: "OMIG Tik Tak (Orange Money)",
    tauxAnnuel: 0.03,
    description: "Épargne à vue rémunérée à 3% l'an, dépôts de 10 000 à 50 000 000 GNF.",
    source: { label: "Guinéenews — Orange MicroFinances Guinée lance Tik Tak", url: "https://guineenews.org/2024/05/15/monnaie-electronique-orange-microfinances-guinee-lance-sa-solution-depargne-et-de-credit-100-digitale/" },
  },
  {
    id: "imf",
    label: "IMF type BSIC",
    tauxAnnuel: 0.0425,
    description: "Épargne rémunérée entre 4% et 4,5% l'an selon la tranche de dépôt.",
    source: { label: "BSIC Guinée — Épargner", url: "https://www.bsic-guinee.com/epargner/" },
  },
];

export type FrequenceEpargne = "hebdo" | "mensuel";

// Valeur future d'une suite de versements périodiques réguliers — formule
// standard de rente (annuité), appliquée au taux annoncé par la source du
// scénario choisi (0% pour une tontine, 3%/4,25% pour les produits
// d'épargne réels cités ci-dessus).
export function totalEpargne(contribution: number, tauxAnnuel: number, frequence: FrequenceEpargne, nombrePeriodes: number): number {
  if (tauxAnnuel === 0) return contribution * nombrePeriodes;
  const periodesParAn = frequence === "hebdo" ? 52 : 12;
  const tauxPeriodique = tauxAnnuel / periodesParAn;
  return contribution * ((Math.pow(1 + tauxPeriodique, nombrePeriodes) - 1) / tauxPeriodique);
}

export function formatGNF(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} GNF`;
}
