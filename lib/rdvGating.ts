// Lot A (refonte cycle de vie RDV, décision CEO 16/07/2026) — un rendez-vous
// ne peut être pris en charge (confirmation de présence, quel que soit le
// canal : scan QR gratuit ou validation paiement payant) que le jour même,
// à partir de 10 minutes avant l'heure prévue. Fonction partagée pour que
// les deux canaux appliquent EXACTEMENT la même règle, côté serveur — jamais
// uniquement côté client, qui ne fait qu'anticiper le message d'erreur.
const MINUTES_AVANT_AUTORISE = 10;

export function creneauEstOuvert(dateRdv: string, heureRdv: string, maintenant: Date = new Date()): boolean {
  const [y, m, d] = dateRdv.split("-").map(Number);
  const [hh, mm] = (heureRdv || "00:00").split(":").map(Number);
  if (!y || !m || !d) return false;
  const seuil = new Date(y, m - 1, d, hh, mm - MINUTES_AVANT_AUTORISE, 0, 0);
  const finJournee = new Date(y, m - 1, d, 23, 59, 59, 999);
  return maintenant >= seuil && maintenant <= finJournee;
}

// Un rdv est "en retard" dès que son date_rdv+heure_rdv est dans le passé —
// indépendant de creneauEstOuvert() (qui reste ouvert jusqu'à minuit) : sert
// uniquement à signaler l'urgence (bandeau, badge, bouton "Absent"), jamais à
// bloquer une action. Factorisé le 19/07/2026 (chantier "RDV en retard") —
// remplace 3 calculs identiques dupliqués dans le dashboard institution.
export function rdvEstEnRetard(dateRdv: string, heureRdv: string, maintenant: Date = new Date()): boolean {
  if (!dateRdv || !heureRdv) return false;
  const [y, m, d] = dateRdv.split("-").map(Number);
  const [hh, mm] = heureRdv.split(":").map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d, hh, mm || 0, 0, 0) < maintenant;
}

export const RDV_HORS_CRENEAU_MESSAGE = {
  titre: "Impossible de prendre ce rendez-vous en charge",
  message:
    "Pour garantir la sécurité des citoyens, des établissements et de la plateforme Yelen, la confirmation de présence est uniquement autorisée le jour du rendez-vous et à partir de 10 minutes avant l'heure prévue.\n\n" +
    "Cette mesure évite les validations anticipées, les erreurs de manipulation et protège l'intégrité des statistiques, des paiements et de l'historique des rendez-vous.\n\n" +
    "Veuillez patienter jusqu'au créneau autorisé.",
};
