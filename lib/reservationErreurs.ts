// Messages français pour les contrôles posés en base sur paid_bookings
// (trigger paid_bookings_figer_montant, migration 20261025000001/2) qui
// remontent via les RPC de réservation. Le texte brut de l'erreur Postgres ne
// doit jamais atteindre le citoyen. Renvoie null si le code n'est pas reconnu
// (l'appelant garde alors son message générique).
const MESSAGES: [code: string, message: string][] = [
  ["INSTITUTION_INDISPONIBLE", "Cet établissement n'accepte pas de réservation pour le moment."],
  ["DATE_PASSEE", "Cette date n'est plus valide. Merci de choisir une date à venir."],
  ["DATES_INVALIDES", "Les dates choisies sont invalides : la date de départ doit être après la date d'arrivée."],
  ["PRIX_INVALIDE", "Le tarif de ce service est indisponible pour le moment. Merci de réessayer plus tard."],
];

export function messageControleBase(messageErreur: string | null | undefined): string | null {
  if (!messageErreur) return null;
  for (const [code, message] of MESSAGES) {
    if (messageErreur.includes(code)) return message;
  }
  return null;
}
