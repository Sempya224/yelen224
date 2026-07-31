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

// Un RDV cesse d'être "en retard" une fois que la situation est réglée côté
// établissement : soit marqué "absent" explicitement (presence_status),
// soit sa journée est entièrement passée sans confirmation de présence
// (presence === false) et sans avoir été annulé/refusé — même règle que
// app/mes-rdv/page.tsx::isAbsentRdv(), reprise ici pour que le Hero et
// l'onglet RDV de app/page.tsx cessent aussi de signaler "en retard"/
// "manqué à traiter" une fois l'absence actée (retour Bryan 29/07/2026 :
// avant ce correctif, ces deux écrans ignoraient presence/presence_status
// et restaient bloqués sur "en retard" indéfiniment).
export function rdvEstAbsent(dateRdv: string, statut: string, presence: boolean | null | undefined, presenceStatus: string | null | undefined): boolean {
  if (presenceStatus === "absent") return true;
  if (statut === "annule" || statut === "refuse") return false;
  return presence === false && rdvJourneeDejaPassee(dateRdv);
}

// Une journée de RDV est "passée" une fois 23:59:59 dépassé — même règle que
// app/mes-rdv/page.tsx::isPasse(), reprise ici pour que le filtre "RDV à
// venir" de l'onglet RDV de app/page.tsx exclue aussi les dates passées.
// Avant ce correctif, ce filtre ne vérifiait que le statut (en_attente/
// confirme), jamais la date — un RDV ancien jamais traité par l'établissement
// pouvait donc s'afficher comme "Prochain rendez-vous" à la place du vrai
// prochain RDV (retour Bryan 29/07/2026, incohérent avec l'écran /mes-rdv).
export function rdvJourneeDejaPassee(dateRdv: string, maintenant: Date = new Date()): boolean {
  const [y, m, d] = dateRdv.split("-").map(Number);
  if (!y || !m || !d) return false;
  const finJournee = new Date(y, m - 1, d, 23, 59, 59, 999);
  return finJournee < maintenant;
}

export const RDV_HORS_CRENEAU_MESSAGE = {
  titre: "Impossible de prendre ce rendez-vous en charge",
  message:
    "Pour garantir la sécurité des citoyens, des établissements et de la plateforme Yelen, la confirmation de présence est uniquement autorisée le jour du rendez-vous et à partir de 10 minutes avant l'heure prévue.\n\n" +
    "Cette mesure évite les validations anticipées, les erreurs de manipulation et protège l'intégrité des statistiques, des paiements et de l'historique des rendez-vous.\n\n" +
    "Veuillez patienter jusqu'au créneau autorisé.",
};
