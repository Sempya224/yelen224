import type { MembreRole } from "./institutionPermissions";
import { heureAmPm, heureDepuisHorodatage } from "./heure";

// Logique pure de la fiche « Détails du RDV » (refonte phase 1, étape 3) :
// historique fusionné et dédoublonné, indicateurs client, créneaux voisins,
// confidentialité. Aucune requête ni UI ici — tout part de données déjà
// chargées par le dashboard.

// ─── Historique ─────────────────────────────────────────────────────────

export type HistoriqueType =
  | "creation" | "accepte" | "presence" | "termine" | "absent" | "annulation"
  | "report" | "preparation" | "validation_annulee" | "message" | "depasse"
  | `autre:${string}`;

export type HistoriqueEntree = {
  at: string;
  type: HistoriqueType;
  label: string;
  // Nom d'un membre de l'équipe, ou rôle (« Le citoyen »…) à défaut.
  acteur: string | null;
  acteurNomme: boolean;
  detail?: string;
};

export type HistoriqueColonnes = {
  created_at?: string | null;
  accepte_le?: string | null;
  presence_confirmed_at?: string | null;
  presence_status?: string | null;
  termine_at?: string | null;
  preparation_confirmee_le?: string | null;
};
export type HistoriqueEvent = { action: string; auteur_type: string; motif: string | null; created_at: string };
export type HistoriqueJournal = { action: string; membre_nom: string | null; created_at: string };

// Deux lignes de même type à moins de 2 minutes l'une de l'autre décrivent
// le même fait (la colonne du RDV, rdv_events et journal_activite sont écrits
// par la même action).
export const FENETRE_DEDOUBLONNAGE_MS = 2 * 60 * 1000;

const ACTEUR_PAR_ROLE: Record<string, string> = { citoyen: "Le citoyen", institution: "Votre établissement", system: "Yelen (automatique)" };

const LABEL_ANNULATION: Record<string, string> = {
  citoyen: "Annulé par le citoyen",
  institution: "Annulé par l'établissement",
  system: "Annulé automatiquement par Yelen",
};

// Jamais le code brut : repli = code sans préfixe « rdv_ », « _ » → espace,
// majuscule initiale (« rdv_xyz_inconnu » → « Xyz inconnu »).
export function libelleParDefaut(code: string): string {
  const propre = code.replace(/^rdv_/, "").replace(/_/g, " ").trim();
  if (!propre) return "Événement";
  return propre.charAt(0).toUpperCase() + propre.slice(1);
}

type Normalise = { type: HistoriqueType; label: string };

function depuisEvent(e: HistoriqueEvent): Normalise {
  switch (e.action) {
    case "creation": return { type: "creation", label: "Rendez-vous créé" };
    // Le statut route journalise « confirmation » pour l'acceptation (nouveau → en_attente).
    case "confirmation": return { type: "accepte", label: "Rendez-vous accepté" };
    case "annulation": return { type: "annulation", label: LABEL_ANNULATION[e.auteur_type] ?? "Rendez-vous annulé" };
    case "report": return { type: "report", label: "Reporté par le citoyen" };
    case "termine": return { type: "termine", label: "Rendez-vous terminé" };
    case "absent": return { type: "absent", label: "Client marqué absent" };
    case "message": return { type: "message", label: "Message envoyé" };
    case "depasse": return { type: "depasse", label: "Alerte de dépassement" };
    case "preparation": return { type: "preparation", label: "Visite préparée" };
    default: return { type: `autre:${e.action}`, label: libelleParDefaut(e.action) };
  }
}

function depuisJournal(code: string): Normalise {
  switch (code) {
    case "rdv_accepte": return { type: "accepte", label: "Rendez-vous accepté" };
    // Un refus par l'établissement est une annulation côté rdv_events : même fait.
    case "rdv_refuse": return { type: "annulation", label: "Annulé par l'établissement" };
    case "rdv_annule": return { type: "annulation", label: "Rendez-vous annulé" };
    case "rdv_termine": return { type: "termine", label: "Rendez-vous terminé" };
    case "rdv_absent": return { type: "absent", label: "Client marqué absent" };
    case "rdv_confirme": return { type: "presence", label: "Présence confirmée" };
    case "rdv_validation_annulee": return { type: "validation_annulee", label: "Validation annulée" };
    case "suivi_rdv_modifie": return { type: "autre:suivi_rdv_modifie", label: "Suivi modifié" };
    default: return { type: `autre:${code}`, label: libelleParDefaut(code) };
  }
}

function fusionner(a: HistoriqueEntree, b: HistoriqueEntree): HistoriqueEntree {
  // On garde l'entrée qui porte le nom de l'acteur ; à défaut celle qui a un acteur.
  const score = (x: HistoriqueEntree) => (x.acteurNomme ? 2 : x.acteur ? 1 : 0);
  const [gardee, autre] = score(b) > score(a) ? [b, a] : [a, b];
  return { ...gardee, detail: gardee.detail ?? autre.detail };
}

export function construireHistorique(
  colonnes: HistoriqueColonnes,
  events: readonly HistoriqueEvent[],
  journal: readonly HistoriqueJournal[],
): HistoriqueEntree[] {
  const brut: HistoriqueEntree[] = [];
  const col = (at: string | null | undefined, type: HistoriqueType, label: string) => {
    if (at) brut.push({ at, type, label, acteur: null, acteurNomme: false });
  };
  col(colonnes.created_at, "creation", "Rendez-vous créé");
  col(colonnes.accepte_le, "accepte", "Rendez-vous accepté");
  if (colonnes.presence_status === "absent") col(colonnes.presence_confirmed_at, "absent", "Client marqué absent");
  else col(colonnes.presence_confirmed_at, "presence", "Présence confirmée");
  col(colonnes.termine_at, "termine", "Rendez-vous terminé");
  col(colonnes.preparation_confirmee_le, "preparation", "Visite préparée");

  for (const e of events) {
    const n = depuisEvent(e);
    const motif = (e.motif ?? "").trim();
    brut.push({
      at: e.created_at, type: n.type, label: n.label,
      acteur: ACTEUR_PAR_ROLE[e.auteur_type] ?? null, acteurNomme: false,
      // Le motif d'annulation est affiché une seule fois, dans le bandeau.
      // Celui d'un report l'est dans « Quand et où ».
      detail: motif && (e.action === "absent") ? motif : undefined,
    });
  }
  for (const j of journal) {
    const n = depuisJournal(j.action);
    const nom = (j.membre_nom ?? "").trim();
    brut.push({ at: j.created_at, type: n.type, label: n.label, acteur: nom || null, acteurNomme: !!nom });
  }

  const valides = brut.filter((x) => !Number.isNaN(new Date(x.at).getTime()));
  valides.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  const gardees: HistoriqueEntree[] = [];
  for (const entree of valides) {
    const t = new Date(entree.at).getTime();
    let idx = -1;
    for (let i = gardees.length - 1; i >= 0; i--) {
      if (t - new Date(gardees[i].at).getTime() > FENETRE_DEDOUBLONNAGE_MS) break;
      if (gardees[i].type === entree.type) { idx = i; break; }
    }
    if (idx >= 0) gardees[idx] = fusionner(gardees[idx], entree);
    else gardees.push(entree);
  }
  return gardees.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Conakry" });
// « 21 oct., 8:01 AM » — jour et heure de Conakry.
export function horodatageCourt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${FORMAT_JOUR.format(d)}, ${heureDepuisHorodatage(d)}`;
}

// ─── Indicateurs client chez l'établissement ──────────────────────────

// Plafond de GET /api/institution/rdv (limit(300)) : au-delà, les compteurs
// sont calculés sur les 300 derniers RDV seulement.
export const LIMITE_LISTE_RDV = 300;

export type RdvStat = {
  id?: string;
  citoyen_id?: string | null;
  statut: string;
  date_rdv: string;
  heure_rdv?: string | null;
  presence_status?: string | null;
  annule_par?: string | null;
};

export type StatsClient = {
  total: number;
  termines: number;
  absences: number;
  annulationsCitoyen: number;
  // annule_par est NULL sur les RDV antérieurs à la migration 20261013000002 :
  // on les compte à part plutôt que de deviner un auteur.
  annulationsOrigineInconnue: number;
  premierRdv: string | null;
  tronque: boolean;
  // Nombre de RDV de l'établissement sur lesquels ces compteurs sont calculés
  // (tous clients confondus) : la « période » à afficher à côté des absences.
  taillePeriode: number;
};

// Ce que compte `absences` — et rien d'autre : les RDV de CET établissement, de CE
// citoyen, parmi ceux déjà chargés (300 derniers), dont `presence_status === "absent"`.
// Ne sont PAS comptés : un RDV annulé (par le citoyen, l'établissement ou
// automatiquement par Yelen) sans constat d'absence, ni un RDV « non traité »
// (état dérivé à la lecture, presence_status reste NULL). Les écrivains de cette
// valeur sont : rdv/statut (action « absent »), qrValidation (absence via QR) et
// paid-bookings/valider (no_show).

export function statsClient(rdvs: readonly RdvStat[], citoyenId: string | null | undefined): StatsClient | null {
  if (!citoyenId) return null;
  const siens = rdvs.filter((r) => r.citoyen_id === citoyenId);
  let termines = 0, absences = 0, annulationsCitoyen = 0, annulationsOrigineInconnue = 0;
  let premier: string | null = null;
  for (const r of siens) {
    if (!premier || r.date_rdv < premier) premier = r.date_rdv;
    if (r.presence_status === "absent") { absences++; continue; }
    if (r.statut === "termine") termines++;
    else if (r.statut === "annule") {
      if (r.annule_par === "citoyen") annulationsCitoyen++;
      else if (!r.annule_par) annulationsOrigineInconnue++;
    }
  }
  return { total: siens.length, termines, absences, annulationsCitoyen, annulationsOrigineInconnue, premierRdv: premier, tronque: rdvs.length >= LIMITE_LISTE_RDV, taillePeriode: rdvs.length };
}

// ─── Créneau ───────────────────────────────────────────────────────────

const minutesHeure = (h?: string | null): number | null => {
  const m = (h || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Autres RDV encore valables sur le même créneau (même date, même heure).
export function autresRdvMemeHeure(rdvs: readonly RdvStat[], courant: { id: string; date_rdv: string; heure_rdv: string }): number {
  const h = minutesHeure(courant.heure_rdv);
  if (h === null) return 0;
  return rdvs.filter((r) => r.id !== courant.id && r.date_rdv === courant.date_rdv && minutesHeure(r.heure_rdv) === h && r.statut !== "annule" && r.statut !== "refuse").length;
}

// « 10:00 » + 30 min → « 10:30 » (heure murale ; repasse à 00:xx après minuit).
export function heureFinPrevue(heureRdv: string | null | undefined, dureeMinutes: number | null | undefined): string | null {
  const debut = minutesHeure(heureRdv);
  if (debut === null || !dureeMinutes || dureeMinutes <= 0) return null;
  const fin = (debut + dureeMinutes) % 1440;
  return `${String(Math.floor(fin / 60)).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`;
}

export function plageHoraire(heureRdv: string | null | undefined, dureeMinutes: number | null | undefined): string {
  const debut = heureAmPm(heureRdv);
  if (!debut) return "—";
  const fin = heureFinPrevue(heureRdv, dureeMinutes);
  return fin ? `${debut} – ${heureAmPm(fin)}` : debut;
}

// Nombre de nuits entre deux dates « AAAA-MM-JJ » (séjour hôtel).
export function nuitsSejour(arrivee: string, depart: string): number | null {
  const a = arrivee.split("-").map(Number);
  const d = depart.split("-").map(Number);
  if (a.length !== 3 || d.length !== 3 || a.some(Number.isNaN) || d.some(Number.isNaN)) return null;
  const n = Math.round((Date.UTC(d[0], d[1] - 1, d[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  return n > 0 ? n : null;
}

// ─── Demande ───────────────────────────────────────────────────────────

// Balise [URGENT] posée dans rdv.objet : détectée puis retirée du texte avant
// qu'il soit passé à extraireService (qui prendrait « URGENT » pour le service).
export function separerUrgent(objet: string | null | undefined): { urgent: boolean; objet: string } {
  const brut = objet ?? "";
  if (!/\[URGENT\]/i.test(brut)) return { urgent: false, objet: brut };
  return { urgent: true, objet: brut.replace(/\[URGENT\]\s*/i, "").trim() };
}

// ─── Confidentialité ───────────────────────────────────────────────────

// description_besoin et champs complémentaires peuvent contenir des données
// sensibles (santé…) : visibles uniquement par admin, superviseur, dirigeant
// et agent d'accueil. Tout autre rôle, ou rôle inconnu : masqués.
const ROLES_DEMANDE: readonly MembreRole[] = ["admin", "superviseur", "dirigeant", "agent"];
export function peutVoirDemande(role: MembreRole | null | undefined): boolean {
  return !!role && ROLES_DEMANDE.includes(role);
}

// ─── Préparation de la venue : insertion rapide de phrases ──────────────

const normaliserPhrase = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function contientPhrase(texte: string, phrase: string): boolean {
  return normaliserPhrase(texte).includes(normaliserPhrase(phrase));
}

// Séparateur entre deux consignes. Pas de saut de ligne : la liste des
// notifications côté citoyen (components/NotifPanel.tsx) ne préserve pas les
// retours à la ligne et les colle en un seul texte.
export const SEPARATEUR_CONSIGNES = " · ";

// Ajoute `phrase` à la suite des consignes, après un séparateur. Ne fait rien
// si la phrase est déjà présente (à la casse et aux espaces près) ou si le
// résultat dépasserait `max` caractères (limite de la route, 300).
export function ajouterPhrase(texte: string, phrase: string, max: number): { texte: string; ajoute: boolean } {
  if (contientPhrase(texte, phrase)) return { texte, ajoute: false };
  const base = texte.replace(/[\s·]+$/, "");
  const suite = base ? `${base}${SEPARATEUR_CONSIGNES}${phrase}` : phrase;
  if (suite.length > max) return { texte, ajoute: false };
  return { texte: suite, ajoute: true };
}
