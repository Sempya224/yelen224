import { combinerDateHeureRdv } from "./rdvGating";

// Formateur d'heures unique du dashboard institution (règle Yelen : heures
// TOUJOURS en 12 h AM/PM, jamais en 24 h). Fiche « Détails du RDV », liste
// des rendez-vous et popovers passent tous par ici — ne plus formater une
// heure à la main (slice(0, 5), toLocaleTimeString("fr-FR", ...)).

// Guinée = UTC+0 toute l'année. Les horodatages (timestamptz) sont formatés
// dans ce fuseau et non dans celui du navigateur, sans quoi un poste réglé
// ailleurs afficherait des heures décalées.
export const FUSEAU_GUINEE = "Africa/Conakry";

// « 14:30:00 » (colonne Postgres `time`) -> « 2:30 PM ». Chaîne vide si le
// format n'est pas reconnu : à l'appelant de choisir son repli (« — »).
export function heureAmPm(h?: string | null): string {
  const m = (h || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const H = Number(m[1]);
  if (H > 23 || Number(m[2]) > 59) return "";
  return `${H % 12 === 0 ? 12 : H % 12}:${m[2]} ${H >= 12 ? "PM" : "AM"}`;
}

const FORMAT_HEURE = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: FUSEAU_GUINEE });

// Horodatage (ISO ou Date) -> « 8:01 AM », heure de Conakry. Chaîne vide si
// la date est invalide. Les espaces insécables que certaines versions d'ICU
// placent avant AM/PM sont normalisés.
export function heureDepuisHorodatage(valeur: Date | string | number | null | undefined): string {
  if (valeur === null || valeur === undefined || valeur === "") return "";
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  return FORMAT_HEURE.format(d).replace(/\s/g, " ");
}

// Écart entre deux instants, à la même précision que delaiRestant :
// « 25 min », « 1 h 45 min », « 2 h », « 2 j 8 h », « 3 j », « 2 mois » (dès 30 jours).
// Toujours positif.
function ecartCourt(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60000);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const reste = minutes % 60;
    return reste === 0 ? `${h} h` : `${h} h ${reste} min`;
  }
  const j = Math.floor(minutes / 1440);
  // Au-delà de 30 jours, la précision en jours n'apporte plus rien : mois de 30 jours.
  if (j >= 30) return `${Math.floor(j / 30)} mois`;
  const h = Math.floor((minutes % 1440) / 60);
  return h === 0 ? `${j} j` : `${j} j ${h} h`;
}

// « dans 2 h » / « il y a 25 min » / « à l'instant ».
export function libelleRelatif(cible: Date, now: Date): string {
  const ms = cible.getTime() - now.getTime();
  if (Math.abs(ms) < 60000) return "à l'instant";
  return ms > 0 ? `dans ${ecartCourt(ms)}` : `il y a ${ecartCourt(ms)}`;
}

// Compte à rebours d'une échéance : « 25 min restantes » ou « délai dépassé ».
export function delaiRestant(echeance: Date, now: Date): string {
  const ms = echeance.getTime() - now.getTime();
  if (ms <= 0) return "délai dépassé";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min restantes`;
  const h = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${h} h restantes` : `${h} h ${reste} min restantes`;
}

function jourCalendaire(d: Date): number {
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

// « Aujourd'hui, 8:00 AM · dans 2 h » (en-tête de la fiche RDV). Date et
// heure du RDV sont des valeurs « murales » (sans fuseau) : même construction
// locale que rdvGating.combinerDateHeureRdv.
export function libelleDateRelativeRdv(dateRdv: string, heureRdv: string, now: Date): string {
  const quand = combinerDateHeureRdv(dateRdv, heureRdv);
  if (Number.isNaN(quand.getTime())) return "";
  const ecartJours = jourCalendaire(quand) - jourCalendaire(now);
  const jour = ecartJours === 0 ? "Aujourd'hui"
    : ecartJours === 1 ? "Demain"
    : ecartJours === -1 ? "Hier"
    : quand.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const heure = heureAmPm(heureRdv);
  return `${jour}${heure ? `, ${heure}` : ""} · ${libelleRelatif(quand, now)}`;
}

const FORMAT_JOUR_CONAKRY = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_GUINEE, year: "numeric", month: "2-digit", day: "2-digit" });
const FORMAT_DATE_COURTE_UTC = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

// « Sam. 24 oct. · 6:15 AM · dans 2 j » (carte du popover « RDV entrants »).
// Date et heure du RDV sont des valeurs « murales » ; le relatif est calculé par
// jour calendaire de Conakry (« Aujourd'hui », « Demain », « dans N j »).
// Chaîne vide si la date n'est pas au format AAAA-MM-JJ.
export function libelleDateHeureRdvCourte(dateRdv: string, heureRdv: string | null | undefined, now: Date): string {
  const m = (dateRdv || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const jourRdv = Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  const [a, mo, j] = FORMAT_JOUR_CONAKRY.format(now).split("-").map(Number);
  const ecart = jourRdv - Math.round(Date.UTC(a, mo - 1, j) / 86400000);
  const date = FORMAT_DATE_COURTE_UTC.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  const relatif = ecart === 0 ? "Aujourd'hui" : ecart === 1 ? "Demain" : ecart === -1 ? "Hier"
    : ecart > 1 ? `dans ${ecart} j` : `il y a ${-ecart} j`;
  const heure = heureAmPm(heureRdv);
  return [`${date.charAt(0).toUpperCase()}${date.slice(1)}`, heure, relatif].filter(Boolean).join(" · ");
}

// ── Messagerie (22/10/2026) : jours calendaires et libellés en fuseau Conakry ──
const FORMAT_SEPARATEUR_JOUR = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, weekday: "long", day: "numeric", month: "long" });
const FORMAT_DATE_COURTE_LISTE = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, day: "numeric", month: "short" });
const FORMAT_DATE_LONGUE_COMPLETE = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, weekday: "long", day: "numeric", month: "long", year: "numeric" });

function premiereMajuscule(s: string): string {
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s;
}

// Jour calendaire de Conakry (« 2026-10-18 »), « » si la date est invalide.
export function jourConakry(valeur: Date | string | number): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(d.getTime()) ? "" : FORMAT_JOUR_CONAKRY.format(d);
}

function ecartJoursConakry(valeur: Date | string, now: Date): number {
  const [a, m, j] = jourConakry(valeur).split("-").map(Number);
  const [na, nm, nj] = jourConakry(now).split("-").map(Number);
  return Math.round((Date.UTC(na, nm - 1, nj) - Date.UTC(a, m - 1, j)) / 86400000);
}

// Pastille de séparation du fil : « Aujourd'hui », « Hier », « Dimanche 18 octobre ».
export function libelleSeparateurJour(valeur: Date | string, now: Date): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  const ecart = ecartJoursConakry(d, now);
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return "Hier";
  return premiereMajuscule(FORMAT_SEPARATEUR_JOUR.format(d));
}

// Liste des conversations : heure du jour (« 4:09 PM »), « Hier », sinon date courte (« 19 oct. »).
export function libelleHeureListe(valeur: Date | string, now: Date): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  const ecart = ecartJoursConakry(d, now);
  if (ecart === 0) return heureDepuisHorodatage(d);
  if (ecart === 1) return "Hier";
  return FORMAT_DATE_COURTE_LISTE.format(d);
}

// Info-bulle : « Dimanche 18 octobre 2026, 4:09 PM ».
export function dateHeureComplete(valeur: Date | string): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  return `${premiereMajuscule(FORMAT_DATE_LONGUE_COMPLETE.format(d))}, ${heureDepuisHorodatage(d)}`;
}

const FORMAT_DATE_JOUR = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, day: "numeric", month: "long", year: "numeric" });

// « 31 août 2026 » (jour seul, fuseau de Conakry). Chaîne vide si invalide.
export function dateJourConakry(valeur: Date | string): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  return FORMAT_DATE_JOUR.format(d);
}

// « 31 août 2026 · 5:51 PM » (sans jour de semaine). Chaîne vide si invalide.
export function dateHeureCourte(valeur: Date | string): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  return `${FORMAT_DATE_JOUR.format(d)} · ${heureDepuisHorodatage(d)}`;
}

const FORMAT_DATE_ABREGEE_UTC = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const FORMAT_DATE_ABREGEE_CONAKRY = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, day: "numeric", month: "short", year: "numeric" });

// « 2026-10-23 » (valeur murale, colonne `date`) -> « 23 oct. 2026 ». Chaîne vide si le format n'est pas reconnu.
export function dateMuraleAbregee(dateRdv: string | null | undefined): string {
  const m = (dateRdv || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return FORMAT_DATE_ABREGEE_UTC.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

// Horodatage -> « 22 oct. 2026 · 3:34 PM » (mois abrégé, fuseau de Conakry). Chaîne vide si invalide.
export function horodatageAbrege(valeur: Date | string | null | undefined): string {
  if (valeur === null || valeur === undefined || valeur === "") return "";
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return "";
  return `${FORMAT_DATE_ABREGEE_CONAKRY.format(d)} · ${heureDepuisHorodatage(d)}`;
}
