export type NiveauSecurite = "faible" | "moyen" | "fort";

export type ScoreSecurite = {
  valeur: number; // 0-100
  niveau: NiveauSecurite;
  conseils: string[];
};

/**
 * Score de sécurité de l'écran Sécurité citoyen (Lot E) — règles
 * déterministes sur les facteurs réellement mesurables aujourd'hui (PIN,
 * biométrie), même esprit que scoreRisque() dans lib/journalTaxonomie.ts
 * (Lot E du Journal d'activité institution) : zéro appel LLM, zéro
 * pondération inventée sur des signaux qu'on n'a pas (pas de pénalité sur
 * le nombre d'appareils mémorisés — un citoyen peut légitimement en avoir
 * plusieurs, et sans détection d'anomalie réelle, le pénaliser serait
 * arbitraire).
 */
export function calculerScoreSecurite(params: {
  pinConfigure: boolean;
  biometrieActive: boolean;
}): ScoreSecurite {
  let valeur = 20; // baseline : compte vérifié par téléphone (OTP) pour arriver jusqu'ici
  const conseils: string[] = [];

  if (params.pinConfigure) {
    valeur += 30;
  } else {
    conseils.push("Configurez un code PIN pour verrouiller l'accès à votre compte.");
  }

  if (params.biometrieActive) {
    valeur += 30;
  } else {
    conseils.push("Activez l'empreinte ou Face ID pour une connexion plus rapide et sécurisée.");
  }

  if (params.pinConfigure && params.biometrieActive) {
    valeur += 20; // bonus double-facteur local
  }

  const niveau: NiveauSecurite = valeur >= 80 ? "fort" : valeur >= 40 ? "moyen" : "faible";

  return { valeur, niveau, conseils };
}
