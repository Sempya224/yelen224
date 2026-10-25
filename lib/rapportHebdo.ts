// Rapport hebdomadaire d'activité — moteur de calcul (Lot 1, 20/10/2026).
// Moteur pur, déterministe, zéro LLM, zéro accès DB dans ce fichier : les
// lignes brutes sont injectées par l'appelant (même contrat que
// lib/semaineEngine.ts). Définitions et justifications :
// docs/rapport-hebdomadaire/SPEC_INDICATEURS.md et AUDIT_LOT1.md.
//
// Règles structurantes :
// - Semaine = lundi 00:00:00.000 UTC inclus -> lundi suivant exclu (Guinée =
//   UTC+0, hypothèse du projet). Toutes les bornes en UTC explicite, jamais
//   l'heure locale du serveur. NB : l'écran Rapports existant
//   (lib/rapportsAggregation.ts) compte du dimanche au samedi — écart assumé
//   (décision Bryan 20/10/2026), le rapport affiche toujours ses dates.
// - RDV gratuits (`rdv`) et réservations payantes (`paid_bookings`) sont deux
//   blocs séparés ; AUCUN total ne les additionne. Le rapprochement n'est
//   qu'informatif (0 candidat = sans RDV, 1 = confirmé, >= 2 = ambigu).
// - Seuil de 10 observations avant tout pourcentage ou toute tendance ;
//   dessous, "Données insuffisantes" (jamais un zéro déguisé).
// - Anomalies de données historiques gérées ici, jamais corrigées en base :
//   un événement d'annulation système ne vaut annulation que si le statut
//   courant est 'annule' ET que l'événement précède l'heure du RDV.
import { MINUTES_GRACE_NON_TRAITE } from "./rdvGating";
import { DEVISE_LABEL } from "./devise";

export const RAPPORT_HEBDO_VERSION = 1;
export const SEUIL_MIN_OBSERVATIONS = 10;
export const DELAI_SANS_REPONSE_HEURES = 24;
export const MOTIF_DONNEES_INSUFFISANTES = "Données insuffisantes";
// Paliers de suspension automatique "RDV non traités" sur 30 jours glissants
// (migration 20260915000003 : 3 -> 7 jours, 5 -> 30 jours, 10 -> indéfinie).
export const PALIERS_SUSPENSION_NON_TRAITES = [3, 5, 10] as const;
const FENETRE_NON_TRAITES_JOURS = 30;
const MAX_PRIORITES = 3;

const MS_MINUTE = 60_000;
const MS_HEURE = 3_600_000;
const MS_JOUR = 86_400_000;

// ─── Entrées (colonnes réelles, vérifiées le 20/10/2026) ──────────────────
export type RdvLigne = {
  id: string;
  citoyen_id: string | null;
  date_rdv: string; // YYYY-MM-DD
  heure_rdv: string; // HH:MM[:SS]
  statut: string;
  presence_status: string | null;
  created_at: string;
  accepte_le: string | null;
  non_traite_marque_le: string | null;
  annule_par: string | null;
};

export type RdvEvenementLigne = {
  rdv_id: string;
  action: string; // absent | annulation | confirmation | creation | depasse | message | report | termine
  auteur_type: string; // citoyen | institution | system
  ancien_statut: string | null;
  nouveau_statut: string | null;
  created_at: string;
};

export type PaiementLigne = {
  id: string;
  citoyen_id: string | null;
  statut: string; // en_attente | confirme | termine | no_show | annule | rembourse
  date_rdv: string;
  heure_rdv: string;
  created_at: string;
  traite_le: string | null;
  montant_paye: number | null;
  montant_declare_citoyen: number | null;
  declare_le: string | null;
  service_id: string;
  service_nom: string | null;
};

export type AvisLigne = {
  id: string;
  note: number;
  created_at: string;
  masque: boolean;
  brouillon: boolean;
  reponse_institution: string | null;
};

export type EntreeRapportHebdo = {
  lundi: string; // lundi de la semaine rapportée, YYYY-MM-DD
  maintenant: string; // instant de génération, ISO
  // Lignes couvrant la semaine rapportée ET la précédente (comparaison), plus
  // les RDV dont `non_traite_marque_le` tombe dans les 30 derniers jours.
  rdv: RdvLigne[];
  evenements: RdvEvenementLigne[];
  paiements: PaiementLigne[];
  avis: AvisLigne[];
  // citoyen_id ayant déjà au moins un RDV `termine` avant le lundi rapporté.
  clientsServisAvant: string[];
};

// ─── Périodes ───────────────────────────────────────────────────────────────
export type Periode = { debutMs: number; finMs: number; lundi: string; dimanche: string };

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function periodeDepuisLundi(lundi: string): Periode {
  const debutMs = Date.parse(`${lundi}T00:00:00.000Z`);
  if (Number.isNaN(debutMs) || isoDate(debutMs) !== lundi) throw new Error(`Date invalide : ${lundi}`);
  if (new Date(debutMs).getUTCDay() !== 1) throw new Error(`${lundi} n'est pas un lundi`);
  return { debutMs, finMs: debutMs + 7 * MS_JOUR, lundi, dimanche: isoDate(debutMs + 6 * MS_JOUR) };
}

export function periodePrecedente(p: Periode): Periode {
  return periodeDepuisLundi(isoDate(p.debutMs - 7 * MS_JOUR));
}

// Dernière semaine lundi-dimanche entièrement écoulée à `maintenant`.
export function derniereSemaineComplete(maintenant: Date): Periode {
  const jour = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  const decalage = (new Date(jour).getUTCDay() + 6) % 7;
  return periodeDepuisLundi(isoDate(jour - decalage * MS_JOUR - 7 * MS_JOUR));
}

function dansInstant(ms: number, p: Periode): boolean {
  return ms >= p.debutMs && ms < p.finMs;
}
function dansIso(iso: string | null, p: Periode): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return !Number.isNaN(ms) && dansInstant(ms, p);
}
function dansDate(date: string, p: Periode): boolean {
  return date >= p.lundi && date <= p.dimanche;
}

function instantRdv(date: string, heure: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = heure.split(":").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

// ─── Mesures avec seuil ─────────────────────────────────────────────────────
export type Taux =
  | { disponible: true; pct: number; numerateur: number; base: number }
  | { disponible: false; motif: string; numerateur: number; base: number };

export type VariationPct = { disponible: true; pct: number } | { disponible: false; motif: string };
export type VariationPoints = { disponible: true; points: number } | { disponible: false; motif: string };

function arrondi1(n: number): number {
  return Math.round(n * 10) / 10;
}

function taux(numerateur: number, base: number): Taux {
  if (base < SEUIL_MIN_OBSERVATIONS) return { disponible: false, motif: MOTIF_DONNEES_INSUFFISANTES, numerateur, base };
  return { disponible: true, pct: arrondi1((numerateur / base) * 100), numerateur, base };
}

function variationCompte(actuel: number, precedent: number): VariationPct {
  if (actuel < SEUIL_MIN_OBSERVATIONS || precedent < SEUIL_MIN_OBSERVATIONS) return { disponible: false, motif: MOTIF_DONNEES_INSUFFISANTES };
  return { disponible: true, pct: arrondi1(((actuel - precedent) / precedent) * 100) };
}

function ecartTaux(actuel: Taux, precedent: Taux): VariationPoints {
  if (!actuel.disponible || !precedent.disponible) return { disponible: false, motif: MOTIF_DONNEES_INSUFFISANTES };
  return { disponible: true, points: arrondi1(actuel.pct - precedent.pct) };
}

// ─── Classification des RDV gratuits ───────────────────────────────────────
export type IssueRdv =
  | "realise"
  | "absence"
  | "annulation"
  | "suspension"
  | "non_traite_ecrase"
  | "ecrasement_non_qualifie"
  | "autre";
export type AuteurAnnulation = "citoyen" | "institution" | "inconnue";

export type RdvClasse = {
  rdv: RdvLigne;
  instant: number;
  issue: IssueRdv;
  auteur: AuteurAnnulation | null;
  refusDeDemande: boolean;
  accepte: boolean;
};

function estAcceptee(r: RdvLigne, evts: RdvEvenementLigne[]): boolean {
  return r.accepte_le !== null
    || evts.some(e => e.action === "confirmation")
    || evts.some(e => e.ancien_statut === "en_attente");
}

export function classerRdv(r: RdvLigne, evts: RdvEvenementLigne[]): RdvClasse {
  const instant = instantRdv(r.date_rdv, r.heure_rdv);
  const accepte = estAcceptee(r, evts);
  const annule = r.statut === "annule";
  const evtSysteme = evts.find(e => e.action === "annulation" && e.auteur_type === "system");
  const refusDeDemande = evts.some(e => e.action === "annulation" && e.auteur_type === "institution" && e.ancien_statut === "nouveau");
  const base = { rdv: r, instant, refusDeDemande, accepte };

  if (r.statut === "termine") return { ...base, issue: "realise", auteur: null };
  // Un événement système ne vaut annulation que si le statut COURANT est
  // 'annule' (RDV-2026-000029 : événement présent, statut rétabli).
  const suspension = annule && evtSysteme !== undefined && Date.parse(evtSysteme.created_at) < instant;
  if (suspension) return { ...base, issue: "suspension", auteur: null };
  if (r.presence_status === "absent") return { ...base, issue: "absence", auteur: null };
  if (annule && evtSysteme !== undefined) {
    // Événement système POSTÉRIEUR au RDV = écrasement après coup (lot du
    // 15/09/2026) : ce n'est pas une annulation, on lit l'état d'origine.
    return { ...base, issue: r.non_traite_marque_le ? "non_traite_ecrase" : "ecrasement_non_qualifie", auteur: null };
  }
  if (annule) {
    let auteur: AuteurAnnulation = "inconnue";
    if (r.annule_par === "citoyen" || r.annule_par === "institution") auteur = r.annule_par;
    else {
      const evt = [...evts].reverse().find(e => e.action === "annulation" && (e.auteur_type === "citoyen" || e.auteur_type === "institution"));
      if (evt) auteur = evt.auteur_type as AuteurAnnulation;
    }
    return { ...base, issue: "annulation", auteur };
  }
  return { ...base, issue: "autre", auteur: null };
}

// ─── Blocs de sortie ────────────────────────────────────────────────────────
export type BlocRdvGratuits = {
  demandesRecues: number;
  acceptees: number;
  realisees: number;
  annulations: { total: number; citoyen: number; institution: number; inconnue: number; dontRefusDeDemande: number };
  annulationsParSuspension: number;
  absences: number;
  nonTraites: number; // mesurés sur non_traite_marque_le, pas sur date_rdv
  ecrasementsNonQualifies: number;
  clientsDistinctsServis: number;
  nouveauxClients: number;
  clientsConnus: number;
  creneauxSollicites: { heure: string; nb: number }[];
  tauxRealisation: Taux;
  tauxAnnulation: Taux;
  tauxAbsence: Taux;
};

function calculerBlocRdv(classes: RdvClasse[], rdv: RdvLigne[], p: Periode, maintenantMs: number, clientsAvant: Set<string>): BlocRdvGratuits {
  const inP = classes.filter(c => dansDate(c.rdv.date_rdv, p));
  const compte = (issue: IssueRdv) => inP.filter(c => c.issue === issue).length;

  const annulees = inP.filter(c => c.issue === "annulation");
  const parAuteur = (a: AuteurAnnulation) => annulees.filter(c => c.auteur === a).length;

  const echusAcceptes = inP.filter(c => c.instant <= maintenantMs && c.issue !== "suspension" && (c.accepte || c.issue === "realise" || c.issue === "absence"));
  const baseAnnulation = inP.filter(c => c.issue !== "suspension");

  const servis = new Set(inP.filter(c => c.issue === "realise" && c.rdv.citoyen_id).map(c => c.rdv.citoyen_id as string));
  const nouveaux = [...servis].filter(id => !clientsAvant.has(id)).length;

  const parHeure = new Map<string, number>();
  for (const c of inP) {
    if (c.issue === "annulation" || c.issue === "suspension" || c.issue === "non_traite_ecrase" || c.issue === "ecrasement_non_qualifie") continue;
    const h = c.rdv.heure_rdv.slice(0, 2);
    parHeure.set(h, (parHeure.get(h) ?? 0) + 1);
  }
  const creneaux = [...parHeure.entries()]
    .map(([heure, nb]) => ({ heure, nb }))
    .sort((a, b) => b.nb - a.nb || a.heure.localeCompare(b.heure))
    .slice(0, 3);

  const realisees = compte("realise");
  const absences = compte("absence");
  return {
    demandesRecues: rdv.filter(r => dansIso(r.created_at, p)).length,
    acceptees: rdv.filter(r => dansIso(r.accepte_le, p)).length,
    realisees,
    annulations: {
      total: annulees.length,
      citoyen: parAuteur("citoyen"),
      institution: parAuteur("institution"),
      inconnue: parAuteur("inconnue"),
      dontRefusDeDemande: annulees.filter(c => c.refusDeDemande).length,
    },
    annulationsParSuspension: compte("suspension"),
    absences,
    nonTraites: rdv.filter(r => dansIso(r.non_traite_marque_le, p)).length,
    ecrasementsNonQualifies: compte("ecrasement_non_qualifie"),
    clientsDistinctsServis: servis.size,
    nouveauxClients: nouveaux,
    clientsConnus: servis.size - nouveaux,
    creneauxSollicites: creneaux,
    tauxRealisation: taux(realisees, echusAcceptes.length),
    tauxAnnulation: taux(annulees.length, baseAnnulation.length),
    tauxAbsence: taux(absences, echusAcceptes.length),
  };
}

export type BlocPaiements = {
  reservationsRecues: number;
  encaisse: { montant: number; nbEncaissements: number };
  panierMoyen: { valeur: number; base: number } | null; // null = aucun encaissement (non mesurable)
  noShow: { nb: number; montant: number }; // jamais ajouté à l'encaissé
  annulees: number;
  rembourse: { nb: number; montant: number };
  declareParClient: { nb: number; montant: number }; // non vérifié
  servicesEncaisses: { service_id: string; nom: string; nb: number; montant: number }[];
};

const STATUTS_ENCAISSES = ["confirme", "termine"];

function somme(valeurs: (number | null)[]): number {
  return valeurs.reduce<number>((s, v) => s + (v ?? 0), 0);
}

function calculerBlocPaiements(paiements: PaiementLigne[], p: Periode): BlocPaiements {
  // Même convention que lib/rapportsAggregation.ts : statut confirme|termine,
  // date = traite_le avec repli created_at. Seules les lignes à montant
  // renseigné entrent dans l'encaissé et le panier moyen.
  const encaisses = paiements.filter(b =>
    STATUTS_ENCAISSES.includes(b.statut) && b.montant_paye !== null && dansIso(b.traite_le ?? b.created_at, p));
  const montant = somme(encaisses.map(b => b.montant_paye));
  const parService = new Map<string, { nom: string; nb: number; montant: number }>();
  for (const b of encaisses) {
    const cur = parService.get(b.service_id) ?? { nom: b.service_nom ?? "Service", nb: 0, montant: 0 };
    cur.nb += 1; cur.montant += b.montant_paye ?? 0;
    parService.set(b.service_id, cur);
  }
  const noShow = paiements.filter(b => b.statut === "no_show" && dansDate(b.date_rdv, p));
  const rembourses = paiements.filter(b => b.statut === "rembourse" && dansIso(b.traite_le, p));
  const declares = paiements.filter(b => b.montant_declare_citoyen !== null && dansIso(b.declare_le, p));
  return {
    reservationsRecues: paiements.filter(b => dansIso(b.created_at, p)).length,
    encaisse: { montant, nbEncaissements: encaisses.length },
    panierMoyen: encaisses.length > 0 ? { valeur: Math.round(montant / encaisses.length), base: encaisses.length } : null,
    noShow: { nb: noShow.length, montant: somme(noShow.map(b => b.montant_paye)) },
    annulees: paiements.filter(b => b.statut === "annule" && dansDate(b.date_rdv, p)).length,
    rembourse: { nb: rembourses.length, montant: somme(rembourses.map(b => b.montant_paye)) },
    declareParClient: { nb: declares.length, montant: somme(declares.map(b => b.montant_declare_citoyen)) },
    servicesEncaisses: [...parService.entries()]
      .map(([service_id, v]) => ({ service_id, ...v }))
      .sort((a, b) => b.montant - a.montant || a.nom.localeCompare(b.nom))
      .slice(0, 5),
  };
}

export type Rapprochement = { confirme: number; ambigu: number; sansRdv: number; total: number };

// Informatif uniquement : ne s'additionne à aucun total. Clé d'indice
// (citoyen, date, heure) — un indice, pas une preuve d'identité.
function calculerRapprochement(paiements: PaiementLigne[], rdv: RdvLigne[], p: Periode): Rapprochement {
  const cle = (c: string | null, d: string, h: string) => `${c ?? ""}|${d}|${h.slice(0, 5)}`;
  const index = new Map<string, number>();
  for (const r of rdv) {
    if (!r.citoyen_id) continue;
    const k = cle(r.citoyen_id, r.date_rdv, r.heure_rdv);
    index.set(k, (index.get(k) ?? 0) + 1);
  }
  const concernes = paiements.filter(b => dansDate(b.date_rdv, p));
  let confirme = 0, ambigu = 0, sansRdv = 0;
  for (const b of concernes) {
    const n = b.citoyen_id ? (index.get(cle(b.citoyen_id, b.date_rdv, b.heure_rdv)) ?? 0) : 0;
    if (n === 0) sansRdv += 1; else if (n === 1) confirme += 1; else ambigu += 1;
  }
  return { confirme, ambigu, sansRdv, total: concernes.length };
}

export type BlocAvis = { nouveaux: number; noteMoyenne: number | null; notesBasses: number; notesBassesSansReponse: number };

function calculerBlocAvis(avis: AvisLigne[], p: Periode): BlocAvis {
  const dans = avis.filter(a => !a.masque && !a.brouillon && dansIso(a.created_at, p));
  const basses = dans.filter(a => a.note <= 2);
  return {
    nouveaux: dans.length,
    noteMoyenne: dans.length > 0 ? arrondi1(dans.reduce((s, a) => s + a.note, 0) / dans.length) : null,
    notesBasses: basses.length,
    notesBassesSansReponse: basses.filter(a => !a.reponse_institution || !a.reponse_institution.trim()).length,
  };
}

// ─── Plan d'action ─────────────────────────────────────────────────────────
export type ActionPlan = {
  regle: "non_traites" | "demandes_sans_reponse" | "annulations" | "avis_sans_reponse" | "paiements_non_traites";
  // Trois niveaux distincts : fait mesuré / hypothèse / action suggérée.
  constat: string;
  hypothese: string | null;
  action: string;
  verification: string;
};

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return n > 1 ? plurielForme : singulier;
}

function formatMontantTexte(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + DEVISE_LABEL;
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Sortie ─────────────────────────────────────────────────────────────────
export type RapportHebdo = {
  version: number;
  periode: { lundi: string; dimanche: string };
  periodePrecedente: { lundi: string; dimanche: string };
  genereLe: string;
  vide: boolean;
  rdvGratuits: {
    actuel: BlocRdvGratuits;
    precedent: BlocRdvGratuits;
    // Instantanés à la date de génération (pas de période).
    demandesSansReponse24h: number;
    variations: { demandesRecues: VariationPct; realisees: VariationPct; tauxAnnulation: VariationPoints; tauxRealisation: VariationPoints; tauxAbsence: VariationPoints };
  };
  paiements: {
    actuel: BlocPaiements;
    precedent: BlocPaiements;
    reservationsNonTraitees: { nb: number; montant: number };
    variations: { encaisse: VariationPct };
  };
  rapprochementPaiementsRdv: Rapprochement;
  avis: BlocAvis;
  nonTraites30Jours: number;
  bilan: string[];
  planAction: ActionPlan[];
  limites: string[];
};

const LIMITES = [
  "Les rendez-vous gratuits et les réservations payantes sont comptés séparément et ne sont jamais additionnés.",
  "Le rapprochement entre réservation payante et rendez-vous repose sur un indice (citoyen, date, heure), pas sur une preuve d'identité.",
  "Taux de retour, taux d'occupation et section Équipe ne sont pas calculés dans cette version.",
  "L'analyse par service ne porte que sur les services payants : le service des rendez-vous gratuits n'est pas renseigné.",
  "La semaine va du lundi au dimanche (UTC) ; l'écran Rapports compte du dimanche au samedi.",
];

export function calculerRapportHebdo(entree: EntreeRapportHebdo): RapportHebdo {
  const p = periodeDepuisLundi(entree.lundi);
  const pPrec = periodePrecedente(p);
  const maintenantMs = Date.parse(entree.maintenant);
  if (Number.isNaN(maintenantMs)) throw new Error(`Instant de génération invalide : ${entree.maintenant}`);
  if (maintenantMs < p.finMs) throw new Error(`La semaine du ${p.lundi} n'est pas terminée`);

  const parRdv = new Map<string, RdvEvenementLigne[]>();
  for (const e of entree.evenements) {
    const liste = parRdv.get(e.rdv_id) ?? [];
    liste.push(e);
    parRdv.set(e.rdv_id, liste);
  }
  for (const liste of parRdv.values()) liste.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const classes = entree.rdv.map(r => classerRdv(r, parRdv.get(r.id) ?? []));
  const clientsAvant = new Set(entree.clientsServisAvant);

  const rdvActuel = calculerBlocRdv(classes, entree.rdv, p, maintenantMs, clientsAvant);
  const rdvPrecedent = calculerBlocRdv(classes, entree.rdv, pPrec, maintenantMs, clientsAvant);
  const payActuel = calculerBlocPaiements(entree.paiements, p);
  const payPrecedent = calculerBlocPaiements(entree.paiements, pPrec);
  const avis = calculerBlocAvis(entree.avis, p);

  // Instantanés à la génération. "Sans réponse" : statut 'nouveau' depuis plus
  // de 24 h, rendez-vous pas encore passé la grâce de 30 min (au-delà, il bascule
  // dans l'indicateur "non traité" et n'est plus compté ici).
  const demandesSansReponse = entree.rdv.filter(r =>
    r.statut === "nouveau"
    && Date.parse(r.created_at) <= maintenantMs - DELAI_SANS_REPONSE_HEURES * MS_HEURE
    && instantRdv(r.date_rdv, r.heure_rdv) + MINUTES_GRACE_NON_TRAITE * MS_MINUTE > maintenantMs).length;
  const reservationsNonTraitees = entree.paiements.filter(b =>
    b.statut === "en_attente" && instantRdv(b.date_rdv, b.heure_rdv) + MINUTES_GRACE_NON_TRAITE * MS_MINUTE < maintenantMs);
  const nonTraites30Jours = entree.rdv.filter(r => {
    if (!r.non_traite_marque_le) return false;
    const ms = Date.parse(r.non_traite_marque_le);
    return ms >= maintenantMs - FENETRE_NON_TRAITES_JOURS * MS_JOUR && ms <= maintenantMs;
  }).length;

  const vide =
    entree.rdv.every(r => !dansIso(r.created_at, p) && !dansDate(r.date_rdv, p) && !dansIso(r.non_traite_marque_le, p))
    && entree.paiements.every(b => !dansIso(b.created_at, p) && !dansIso(b.traite_le, p) && !dansDate(b.date_rdv, p) && !dansIso(b.declare_le, p))
    && avis.nouveaux === 0;

  const variations = {
    demandesRecues: variationCompte(rdvActuel.demandesRecues, rdvPrecedent.demandesRecues),
    realisees: variationCompte(rdvActuel.realisees, rdvPrecedent.realisees),
    tauxAnnulation: ecartTaux(rdvActuel.tauxAnnulation, rdvPrecedent.tauxAnnulation),
    tauxRealisation: ecartTaux(rdvActuel.tauxRealisation, rdvPrecedent.tauxRealisation),
    tauxAbsence: ecartTaux(rdvActuel.tauxAbsence, rdvPrecedent.tauxAbsence),
  };
  const variationEncaisse = variationCompte(payActuel.encaisse.nbEncaissements, payPrecedent.encaisse.nbEncaissements);

  // Plan d'action : ordre de priorité fixe, 3 règles maximum.
  const candidats: ActionPlan[] = [];
  if (rdvActuel.nonTraites >= 1) {
    candidats.push({
      regle: "non_traites",
      constat: `${rdvActuel.nonTraites} rendez-vous ${pluriel(rdvActuel.nonTraites, "non traité", "non traités")} cette semaine (${nonTraites30Jours} sur les 30 derniers jours).`,
      hypothese: null,
      action: `Traiter les demandes dès réception : la suspension automatique s'applique à partir de ${PALIERS_SUSPENSION_NON_TRAITES[0]} rendez-vous non traités sur 30 jours glissants.`,
      verification: "Aucun nouveau rendez-vous non traité la semaine suivante.",
    });
  }
  if (demandesSansReponse >= 1) {
    candidats.push({
      regle: "demandes_sans_reponse",
      constat: `${demandesSansReponse} ${pluriel(demandesSansReponse, "demande attend", "demandes attendent")} une réponse depuis plus de ${DELAI_SANS_REPONSE_HEURES} h (à la date de génération).`,
      hypothese: null,
      action: "Accepter ou refuser ces demandes avant l'heure du rendez-vous.",
      verification: `Aucune demande en attente depuis plus de ${DELAI_SANS_REPONSE_HEURES} h la semaine suivante.`,
    });
  }
  if (variations.tauxAnnulation.disponible && variations.tauxAnnulation.points > 0 && rdvActuel.tauxAnnulation.disponible) {
    const a = rdvActuel.annulations;
    candidats.push({
      regle: "annulations",
      constat: `Le taux d'annulation passe à ${rdvActuel.tauxAnnulation.pct} % (${variations.tauxAnnulation.points > 0 ? "+" : ""}${variations.tauxAnnulation.points} points) : ${a.citoyen} par le citoyen, ${a.institution} par l'établissement, ${a.inconnue} d'origine inconnue.`,
      hypothese: "Les annulations peuvent se concentrer sur un auteur, un créneau ou un type de réservation : cela reste à vérifier.",
      action: "Examiner les annulations de la semaine avant d'adapter les confirmations ou les rappels.",
      verification: "Comparer le taux d'annulation de la semaine suivante, sur une base d'au moins 10 rendez-vous.",
    });
  }
  if (avis.notesBassesSansReponse >= 1) {
    candidats.push({
      regle: "avis_sans_reponse",
      constat: `${avis.notesBassesSansReponse} ${pluriel(avis.notesBassesSansReponse, "avis", "avis")} de 2 étoiles ou moins ${pluriel(avis.notesBassesSansReponse, "n'a", "n'ont")} pas de réponse de l'établissement.`,
      hypothese: null,
      action: "Lire ces avis et y répondre.",
      verification: "Aucun avis de 2 étoiles ou moins sans réponse la semaine suivante.",
    });
  }
  if (reservationsNonTraitees.length >= 1) {
    const montant = somme(reservationsNonTraitees.map(b => b.montant_paye));
    candidats.push({
      regle: "paiements_non_traites",
      constat: `${reservationsNonTraitees.length} ${pluriel(reservationsNonTraitees.length, "réservation payante est restée", "réservations payantes sont restées")} en attente après l'heure prévue (${formatMontantTexte(montant)} enregistrés, non comptés comme encaissés).`,
      hypothese: null,
      action: "Valider ou clôturer ces réservations dans le Centre de validation.",
      verification: "Aucune réservation payante en attente après son heure la semaine suivante.",
    });
  }
  const planAction = candidats.slice(0, MAX_PRIORITES);

  // Bilan exécutif : une ligne par bloc, jamais de total consolidé.
  const bilan: string[] = [`Période : du lundi ${formatDateFr(p.lundi)} au dimanche ${formatDateFr(p.dimanche)}.`];
  if (vide) {
    bilan.push("Aucune activité enregistrée sur la période.");
  } else {
    bilan.push(`Rendez-vous gratuits : ${rdvActuel.demandesRecues} ${pluriel(rdvActuel.demandesRecues, "demande reçue", "demandes reçues")}, ${rdvActuel.realisees} ${pluriel(rdvActuel.realisees, "prestation réalisée", "prestations réalisées")}.`);
    bilan.push(`Réservations payantes : ${payActuel.reservationsRecues} ${pluriel(payActuel.reservationsRecues, "reçue", "reçues")}, ${formatMontantTexte(payActuel.encaisse.montant)} encaissés sur ${payActuel.encaisse.nbEncaissements} ${pluriel(payActuel.encaisse.nbEncaissements, "paiement", "paiements")}.`);
    if (avis.nouveaux > 0 && avis.noteMoyenne !== null) {
      bilan.push(`Avis : ${avis.nouveaux} ${pluriel(avis.nouveaux, "nouvel avis", "nouveaux avis")}, note moyenne ${avis.noteMoyenne} sur 5.`);
    }
    if (planAction.length > 0) bilan.push(`Priorité de la semaine suivante : ${planAction[0].action}`);
  }

  return {
    version: RAPPORT_HEBDO_VERSION,
    periode: { lundi: p.lundi, dimanche: p.dimanche },
    periodePrecedente: { lundi: pPrec.lundi, dimanche: pPrec.dimanche },
    genereLe: entree.maintenant,
    vide,
    rdvGratuits: { actuel: rdvActuel, precedent: rdvPrecedent, demandesSansReponse24h: demandesSansReponse, variations },
    paiements: {
      actuel: payActuel,
      precedent: payPrecedent,
      reservationsNonTraitees: { nb: reservationsNonTraitees.length, montant: somme(reservationsNonTraitees.map(b => b.montant_paye)) },
      variations: { encaisse: variationEncaisse },
    },
    rapprochementPaiementsRdv: calculerRapprochement(entree.paiements, entree.rdv, p),
    avis,
    nonTraites30Jours,
    bilan,
    planAction,
    limites: LIMITES,
  };
}
