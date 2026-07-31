export type NiveauSecurite = "faible" | "moyen" | "fort";

export type ScoreSecurite = {
  valeur: number; // 0-100
  niveau: NiveauSecurite;
  conseils: string[];
};

/**
 * Score de sécurité de l'écran Sécurité citoyen (Lot E, rééquilibré pour
 * la 2FA TOTP le 25/07/2026) — règles déterministes sur les facteurs
 * réellement mesurables aujourd'hui (PIN, biométrie, TOTP), même esprit
 * que scoreRisque() dans lib/journalTaxonomie.ts (Lot E du Journal
 * d'activité institution) : zéro appel LLM, zéro pondération inventée sur
 * des signaux qu'on n'a pas (pas de pénalité sur le nombre d'appareils
 * mémorisés — un citoyen peut légitimement en avoir plusieurs, et sans
 * détection d'anomalie réelle, le pénaliser serait arbitraire). Le TOTP
 * pèse le plus lourd des trois facteurs : contrairement au PIN et à la
 * biométrie (locaux à l'appareil), il résiste à un SIM-swap ou une
 * interception SMS visant l'OTP téléphone, qui reste le facteur principal.
 */
export function calculerScoreSecurite(params: {
  pinConfigure: boolean;
  biometrieActive: boolean;
  totpActive: boolean;
}): ScoreSecurite {
  let valeur = 15; // baseline : compte vérifié par téléphone (OTP) pour arriver jusqu'ici
  const conseils: string[] = [];

  if (params.pinConfigure) {
    valeur += 20;
  } else {
    conseils.push("Configurez un code PIN pour verrouiller l'accès à votre compte.");
  }

  if (params.biometrieActive) {
    valeur += 20;
  } else {
    conseils.push("Activez l'empreinte ou Face ID pour une connexion plus rapide et sécurisée.");
  }

  if (params.totpActive) {
    valeur += 30;
  } else {
    conseils.push("Activez la double authentification (TOTP) pour protéger votre compte même en cas de vol de votre numéro.");
  }

  const facteursActifs = [params.pinConfigure, params.biometrieActive, params.totpActive].filter(Boolean).length;
  if (facteursActifs >= 2) {
    valeur += 15; // bonus multi-facteurs
  }

  const niveau: NiveauSecurite = valeur >= 80 ? "fort" : valeur >= 40 ? "moyen" : "faible";

  return { valeur, niveau, conseils };
}
