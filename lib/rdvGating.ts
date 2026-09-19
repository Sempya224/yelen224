// Lot A (refonte cycle de vie RDV, décision CEO 16/07/2026) — un rendez-vous
// ne peut être pris en charge (confirmation de présence, quel que soit le
// canal : scan QR gratuit ou validation paiement payant) que le jour même,
// à partir de 10 minutes avant l'heure prévue. Fonction partagée pour que
// les deux canaux appliquent EXACTEMENT la même règle, côté serveur — jamais
// uniquement côté client, qui ne fait qu'anticiper le message d'erreur.
export const MINUTES_AVANT_AUTORISE = 10;

// Extrait de creneauEstOuvert (modernisation modal "confirmation de
// présence indisponible", décision CEO 06/09/2026) pour que le nouvel
// endpoint de statut serveur (app/api/institution/rdv/checkin-status) et
// l'ancien contrôle d'ouverture de créneau partagent le même calcul de
// seuil — jamais deux formules qui pourraient un jour diverger.
export function calculerCheckInAvailableAt(dateRdv: string, heureRdv: string): Date | null {
  const [y, m, d] = dateRdv.split("-").map(Number);
  const [hh, mm] = (heureRdv || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh, mm - MINUTES_AVANT_AUTORISE, 0, 0);
}

export function creneauEstOuvert(dateRdv: string, heureRdv: string, maintenant: Date = new Date()): boolean {
  const seuil = calculerCheckInAvailableAt(dateRdv, heureRdv);
  if (!seuil) return false;
  const [y, m, d] = dateRdv.split("-").map(Number);
  const finJournee = new Date(y, m - 1, d, 23, 59, 59, 999);
  return maintenant >= seuil && maintenant <= finJournee;
}

// Statut nommé (jamais un booléen brut) pour l'endpoint serveur — même
// règle exacte que creneauEstOuvert ci-dessus, jamais recalculée
// différemment (voir /pieges-techniques-connus CLAUDE.md sur le drift
// institutions.moyenne_avis : une seule formule, plusieurs lecteurs).
// CHECK_IN_EXPIRED distingue "la journée du RDV est terminée" de
// "pas encore ouvert" (bug trouvé 08/09/2026 : un seuil déjà passé
// était affiché comme "Aujourd'hui" par CheckInUnavailableDialog faute
// d'un statut dédié — creneauEstOuvert() lui-même reste inchangé).
export type CheckInStatus = "CHECK_IN_NOT_YET_AVAILABLE" | "CHECK_IN_AVAILABLE" | "CHECK_IN_EXPIRED";

export function calculerCheckInStatus(dateRdv: string, heureRdv: string, maintenant: Date = new Date()): CheckInStatus {
  if (creneauEstOuvert(dateRdv, heureRdv, maintenant)) return "CHECK_IN_AVAILABLE";
  const [y, m, d] = dateRdv.split("-").map(Number);
  if (!y || !m || !d) return "CHECK_IN_NOT_YET_AVAILABLE";
  const finJournee = new Date(y, m - 1, d, 23, 59, 59, 999);
  return maintenant > finJournee ? "CHECK_IN_EXPIRED" : "CHECK_IN_NOT_YET_AVAILABLE";
}

// Une institution ne peut jamais déclarer un citoyen "absent" avant que la
// fenêtre de confirmation de présence elle-même ait ouvert (même seuil bas
// que creneauEstOuvert) — sinon rien n'empêchait de constater une absence
// avant même que le citoyen ait eu la moindre chance de se présenter (trou
// trouvé 08/09/2026 : action "absent"/"no_show" totalement non gardée côté
// serveur, contrairement à "confirme"/scan QR). Contrairement à
// creneauEstOuvert, AUCUNE borne haute : un RDV non traité doit rester
// résolvable des jours plus tard (accumulation réelle constatée dans le
// dashboard), jamais bloqué indéfiniment par cette règle.
export function absenceDeclarable(dateRdv: string, heureRdv: string, maintenant: Date = new Date()): boolean {
  const seuil = calculerCheckInAvailableAt(dateRdv, heureRdv);
  if (!seuil) return false;
  return maintenant >= seuil;
}

export const RDV_ABSENT_TROP_TOT_MESSAGE =
  "Impossible de marquer ce rendez-vous absent avant l'ouverture de la fenêtre de confirmation de présence (10 minutes avant l'heure prévue).";

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

// Fenêtre de grâce après l'heure prévue (décision CEO 13/09/2026, chantier
// bandeau "RDV non traités") — un établissement dispose de ce délai après
// l'heure prévue pour agir avant qu'un RDV soit officiellement compté "non
// traité". Règle métier globale Yelen (pas un détail d'affichage du
// dashboard institution) : consommée uniquement via rdvNonTraite()/
// rdvEnFenetreDeGrace() ci-dessous, jamais un calcul local concurrent —
// dashboard institution, mes-rdv citoyen et l'API clients doivent tous voir
// exactement le même basculement, sans quoi une même réservation aurait deux
// vérités selon l'écran.
export const MINUTES_GRACE_NON_TRAITE = 30;

// "Non traité" — dépassé l'heure prévue de plus de MINUTES_GRACE_NON_TRAITE
// sans qu'aucune décision n'ait été prise par l'établissement (ni présence
// confirmée, ni absence constatée, ni refusé/annulé). Décision CEO
// 08/09/2026 (chantier fiabilité no-show), fenêtre de grâce ajoutée le
// 13/09/2026 — sert à donner à l'établissement un signal agrégé (KPI, filtre
// dédié) sur son propre retard de traitement, jamais à imputer quoi que ce
// soit au citoyen tant que rien n'a été explicitement constaté.
export function rdvNonTraite(statut: string, presenceStatus: string | null | undefined, dateRdv: string, heureRdv: string, maintenant: Date = new Date()): boolean {
  const enAttenteNonResolu = statut === "nouveau" || (statut === "en_attente" && presenceStatus !== "absent");
  if (!enAttenteNonResolu || !dateRdv || !heureRdv) return false;
  const [y, m, d] = dateRdv.split("-").map(Number);
  const [hh, mm] = heureRdv.split(":").map(Number);
  if (!y || !m || !d) return false;
  const seuilNonTraite = new Date(y, m - 1, d, hh, (mm || 0) + MINUTES_GRACE_NON_TRAITE, 0, 0);
  return seuilNonTraite < maintenant;
}

// Un RDV est "en fenêtre de grâce" quand son heure est dépassée
// (rdvEstEnRetard) mais que les MINUTES_GRACE_NON_TRAITE ne sont pas encore
// écoulées — c'est l'état qui doit alerter activement l'établissement
// ("agissez maintenant"), avant que le RDV ne bascule "non traité" et ne
// quitte cette alerte pour ne plus vivre que dans le décompte dédié.
export function rdvEnFenetreDeGrace(statut: string, presenceStatus: string | null | undefined, dateRdv: string, heureRdv: string, maintenant: Date = new Date()): boolean {
  const enAttenteNonResolu = statut === "nouveau" || (statut === "en_attente" && presenceStatus !== "absent");
  return enAttenteNonResolu && rdvEstEnRetard(dateRdv, heureRdv, maintenant) && !rdvNonTraite(statut, presenceStatus, dateRdv, heureRdv, maintenant);
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

// Cycle de vie du QR de présence gratuit (décision CEO 01/09/2026) — un
// établissement pouvait jusqu'ici confirmer une présence n'importe quand
// jusqu'à 23:59 le jour du RDV (creneauEstOuvert ci-dessus), sans aucun lien
// avec une preuve réelle de scan à l'heure prévue : aucune trace ne permet
// alors à Yelen de dire ce qui s'est vraiment passé en cas de litige. Le QR
// devient donc lui-même la garde-fou : expiration fixée sur l'heure réelle du
// RDV (pas sur l'instant de génération), une seule régénération finale
// possible, plus courte — au-delà, le système refuse structurellement toute
// confirmation, sans dépendre d'un audit a posteriori.
export const QR_MINUTES_APRES_RDV = 30;
export const QR_MINUTES_REGENERATION_FINALE = 10;

export function combinerDateHeureRdv(dateRdv: string, heureRdv: string): Date {
  const [y, m, d] = dateRdv.split("-").map(Number);
  const [hh, mm] = (heureRdv || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export type EtatQr = "aucun" | "actif" | "expire_regenerable" | "expire_definitif";

// Dérivable uniquement de qr_expires_at/qr_regenere_le (jamais besoin du
// qr_token lui-même) — réutilisé côté serveur (generate/validate) ET côté
// client (mon-qr citoyen, dashboard institution) pour afficher exactement le
// même état, sans dupliquer la règle de date.
export function calculerEtatQr(qrExpiresAt: string | null | undefined, qrRegenereLe: string | null | undefined, maintenant: Date = new Date()): EtatQr {
  if (!qrExpiresAt) return "aucun";
  if (maintenant < new Date(qrExpiresAt)) return "actif";
  return qrRegenereLe ? "expire_definitif" : "expire_regenerable";
}

// Message affiché PARTOUT où ce RDV apparaît une fois l'état
// "expire_definitif" atteint (mon-qr citoyen, liste + fiche RDV institution,
// erreur de scan) — jamais un "expiré" silencieux, toujours la raison
// complète (retour Bryan 01/09/2026 : tout le monde doit savoir pourquoi
// l'action tentée n'aboutit pas).
export const RDV_QR_EXPIRE_DEFINITIF_MESSAGE = {
  titre: "Ce rendez-vous n'est plus valide",
  message:
    "Le code de présence de ce rendez-vous a expiré sans avoir été scanné dans les délais prévus " +
    `(${QR_MINUTES_APRES_RDV} minutes après l'heure du rendez-vous, puis ${QR_MINUTES_REGENERATION_FINALE} minutes après son unique renouvellement).\n\n` +
    "Pour la sécurité et la traçabilité de tous, Yelen ne permet plus de confirmer la présence sur ce rendez-vous.",
};
