// Messages contextuels du bandeau "Mon Assistant" (écran Accueil citoyen).
// Règles déterministes par seuil de temps — même esprit que
// lib/reputationScore.ts / scoreRisque() dans lib/journalTaxonomie.ts :
// zéro appel LLM, isomorphe client/serveur (aucun import next/server ni
// supabase-js). Les seuils sont des hypothèses produit ajustables, pas une
// vérité absolue — à affiner avec Bryan après un premier usage réel.

export type ProchainRdvInfo = {
  dateRdv: string;   // "YYYY-MM-DD"
  heureRdv: string;  // "HH:MM" ou "HH:MM:SS"
  institutionNom: string;
};

export type AssistantEtat = "aucun_rdv" | "lointain" | "aujourdhui" | "imminent" | "en_cours" | "passe_non_confirme";

export function calculerMinutesAvantRdv(rdv: ProchainRdvInfo, maintenant: Date = new Date()): number {
  const dateHeure = new Date(`${rdv.dateRdv}T${rdv.heureRdv.slice(0, 5)}:00`);
  return Math.round((dateHeure.getTime() - maintenant.getTime()) / 60000);
}

/**
 * Détermine l'état du bandeau à partir du delta de minutes avant le RDV le
 * plus proche. Fenêtres :
 *  - < -60min (RDV passé depuis plus d'1h, pas de présence confirmée) : passe_non_confirme
 *  - -60min à 0 : en_cours (l'heure est passée mais on reste dans la fenêtre du RDV)
 *  - 0 à 120min : imminent
 *  - 120min à fin de journée (même date) : aujourdhui
 *  - au-delà : lointain
 */
export function determinerEtat(minutesAvant: number, memeJour: boolean): AssistantEtat {
  if (minutesAvant < -60) return "passe_non_confirme";
  if (minutesAvant < 0) return "en_cours";
  if (minutesAvant <= 120) return "imminent";
  if (memeJour) return "aujourdhui";
  return "lointain";
}

/**
 * Message humain affiché en position réduite du bandeau, selon la
 * proximité du prochain RDV. `dateRdvStr` déjà formatée par l'appelant
 * (ex. "demain", "20 juil.") pour ne pas dupliquer la logique de formatage
 * de date déjà présente dans app/page.tsx.
 */
export function messageProchainRdv(etat: AssistantEtat, rdv: ProchainRdvInfo, dateRdvStr: string): string {
  switch (etat) {
    case "en_cours":
      return `Votre RDV chez ${rdv.institutionNom} est en cours.`;
    case "imminent":
      return `C'est bientôt l'heure — ${rdv.institutionNom} vous attend à ${rdv.heureRdv.slice(0, 5)}.`;
    case "aujourdhui":
      return `Votre RDV chez ${rdv.institutionNom} est aujourd'hui à ${rdv.heureRdv.slice(0, 5)}. Préparez-vous.`;
    case "passe_non_confirme":
      return `Votre RDV chez ${rdv.institutionNom} est passé — pensez à vérifier son statut.`;
    case "lointain":
    default:
      return `Prochain RDV : ${rdv.institutionNom} le ${dateRdvStr} à ${rdv.heureRdv.slice(0, 5)}.`;
  }
}

export const MESSAGE_AVIS_ATTENTE = (n: number) =>
  n === 1 ? "Vous avez un avis à laisser." : `Vous avez ${n} avis à laisser.`;

export const MESSAGE_ANNONCE = (n: number) =>
  n === 1 ? "1 nouvelle annonce d'un établissement." : `${n} nouvelles annonces d'établissements.`;

// Ajoutés le 22/07/2026 (plan rétention v2, item 5) — démarches et
// documents en attente, mêmes règles déterministes que le reste du fichier.
export const MESSAGE_DOCUMENT_ATTENTE = (n: number) =>
  n === 1 ? "Un établissement attend un document de votre part." : `${n} établissements attendent un document de votre part.`;

export const MESSAGE_DEMARCHE_RETARD = (n: number) =>
  n === 1 ? "Une démarche est en retard." : `${n} démarches sont en retard.`;

export const MESSAGE_DEMARCHE_ECHEANCE = (n: number) =>
  n === 1 ? "Une démarche arrive à échéance cette semaine." : `${n} démarches arrivent à échéance cette semaine.`;

export const MESSAGE_VIDE = "Mon Assistant vous accompagne avant, pendant et après vos rendez-vous.";
