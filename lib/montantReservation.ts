// Montant d'une réservation payante — source unique du calcul INITIAL
// (Lot 1a, API Services). Module PUR : aucun accès base, aucun React.
//
// Un service hôtel (chambre) est tarifé à la nuit : paid_bookings porte
// date_rdv (arrivée) et date_depart (départ), le montant dû est
// prix × nombre de nuits. Tout autre service (date_depart absent) vaut un
// seul prix. À n'appeler QU'à la figeage de paid_bookings.montant_paye
// (declarer-paiement, valider) : jamais en lecture, jamais sur un
// montant_paye déjà renseigné (il serait multiplié une seconde fois).

export type MontantReservation =
  | { ok: true; montant: number; nuits: number }
  | { ok: false; code: "PRIX_INVALIDE" | "DATES_INVALIDES" };

const JOUR_MS = 24 * 60 * 60 * 1000;

// Jour calendaire (UTC, sans heure) d'une date "YYYY-MM-DD" — l'éventuelle
// partie heure est ignorée, aucun décalage de fuseau ni d'heure d'été ne
// peut donc fausser le nombre de nuits.
function jourCalendaire(valeur: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
  if (!m) return null;
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const t = Date.UTC(Number(m[1]), mois - 1, jour);
  return Number.isNaN(t) ? null : t;
}

export function calculerMontantReservation(params: {
  prix: number;
  dateRdv: string;
  dateDepart: string | null | undefined;
}): MontantReservation {
  const { prix, dateRdv, dateDepart } = params;
  if (typeof prix !== "number" || !Number.isFinite(prix) || prix < 0) {
    return { ok: false, code: "PRIX_INVALIDE" };
  }
  if (dateDepart === null || dateDepart === undefined || dateDepart === "") {
    return { ok: true, montant: prix, nuits: 1 };
  }
  const arrivee = jourCalendaire(dateRdv);
  const depart = jourCalendaire(dateDepart);
  if (arrivee === null || depart === null) return { ok: false, code: "DATES_INVALIDES" };
  const nuits = Math.round((depart - arrivee) / JOUR_MS);
  if (nuits <= 0) return { ok: false, code: "DATES_INVALIDES" };
  return { ok: true, montant: prix * nuits, nuits };
}
