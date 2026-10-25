// Présentation des notifications du dashboard institution — source unique
// partagée par le popover du header et l'écran « Notifications » (22/10/2026).
// Affichage uniquement : aucune donnée n'est modifiée, aucune requête. La
// salutation figée en base reste dans `titre`, simplement non affichée dans
// les cartes (visible dans l'info-bulle et le volet de détail).
import { FUSEAU_GUINEE } from "@/lib/heure";

export type NotificationInstitution = {
  id: string; type: string | null; titre: string; message: string; lu: boolean; rdv_id: string | null; created_at: string;
};

export type CategorieNotif = "action" | "info" | "alerte";

export const LIBELLES_TYPE: Record<string, string> = {
  reservation: "Nouvelle visite",
  arrivee: "Client arrivé",
  message: "Nouveau message",
  document_televerse: "Document reçu",
  signalement: "Signalement",
  rappel_15min: "Visiteur imminent",
  heure_rdv: "RDV en cours",
  partenariat: "Partenariat",
  communaute: "Communauté",
  rappel_24h: "Rappel",
  rappel_2h: "Rappel",
  rappel_45min: "Rappel",
  prise_en_charge: "Pris en charge",
  termine: "Terminé",
  membre_premiere_connexion: "Sécurité",
  institution_inactivite_reactivation: "Compte réactivé",
  clock_in_absent: "Absence de pointage",
  clock_in_incomplet: "Pointage incomplet",
  rdv_annule: "RDV annulé",
  rdv_reporte: "RDV reporté",
  avis_publie: "Avis publié",
  institution_validee: "Établissement validé",
  institution_verification_accordee: "Vérification accordée",
  institution_verification_complement_demande: "Complément demandé",
  institution_verification_rejetee: "Vérification refusée",
  institution_avertissement: "Avertissement",
  institution_suspendue: "Établissement suspendu",
  institution_suspendue_rdv_non_traites: "Suspension automatique",
  revision_suspension_acceptee: "Révision acceptée",
  institution_refusee: "Demande refusée",
  revision_suspension_rejetee: "Révision rejetée",
};

const TYPES_ACTION = new Set(["reservation", "arrivee", "message", "document_televerse", "signalement"]);
// Refus reconnus par le type (les autres refus ne se lisent qu'au titre, voir categorieDe).
const TYPES_REFUSES = new Set(["institution_refusee", "revision_suspension_rejetee", "institution_verification_rejetee"]);

const LIBELLE_REPLI = "Information";

export function libelleType(n: Pick<NotificationInstitution, "type">): string {
  return (n.type && LIBELLES_TYPE[n.type]) || LIBELLE_REPLI;
}

// Première ligne non vide du message : sert de titre de carte quand le type
// n'a pas de libellé propre (évite « Information » affiché deux fois).
export function titreCarte(n: Pick<NotificationInstitution, "type" | "message">): string {
  const libelle = libelleType(n);
  if (libelle !== LIBELLE_REPLI) return libelle;
  const ligne = n.message.split("\n").map(l => l.trim()).find(l => l.length > 0);
  return ligne ?? libelle;
}

export function categorieDe(n: Pick<NotificationInstitution, "type" | "titre">): CategorieNotif {
  if (n.type && TYPES_ACTION.has(n.type)) return "action";
  if (n.type && TYPES_REFUSES.has(n.type)) return "alerte";
  // Les refus admin (partenariat / communauté) ne se reconnaissent qu'à leur
  // titre stocké (« … refusée ») : aucun champ dédié n'existe côté serveur.
  if ((n.type === "partenariat" || n.type === "communaute") && /refus/i.test(n.titre)) return "alerte";
  return "info";
}

export const LIBELLE_CATEGORIE: Record<CategorieNotif, string> = { action: "À traiter", info: "Information", alerte: "Refusé" };

type CouleursNotif = { gold: string; orange: string; red: string; redL: string; blue: string; blueL: string };

export function teintes(C: CouleursNotif, categorie: CategorieNotif): { fond: string; trait: string } {
  if (categorie === "action") return { fond: `${C.gold}24`, trait: C.orange };
  if (categorie === "alerte") return { fond: C.redL, trait: C.red };
  return { fond: C.blueL, trait: C.blue };
}

// ── Regroupement par date, fuseau Africa/Conakry ──
const FORMAT_JOUR = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_GUINEE, year: "numeric", month: "2-digit", day: "2-digit" });

function jourEntier(d: Date): number {
  const [a, m, j] = FORMAT_JOUR.format(d).split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, j) / 86400000);
}

export type GroupeNotif = "Aujourd'hui" | "Hier" | "Cette semaine" | "Plus ancien";
export const ORDRE_GROUPES: GroupeNotif[] = ["Aujourd'hui", "Hier", "Cette semaine", "Plus ancien"];

export function groupeDe(iso: string, now: Date): GroupeNotif {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Plus ancien";
  const ecart = jourEntier(now) - jourEntier(d);
  if (ecart <= 0) return "Aujourd'hui";
  if (ecart === 1) return "Hier";
  if (ecart < 7) return "Cette semaine";
  return "Plus ancien";
}

export function grouper(items: NotificationInstitution[], now: Date): { groupe: GroupeNotif; items: NotificationInstitution[] }[] {
  const parGroupe = new Map<GroupeNotif, NotificationInstitution[]>();
  for (const n of items) {
    const g = groupeDe(n.created_at, now);
    parGroupe.set(g, [...(parGroupe.get(g) ?? []), n]);
  }
  return ORDRE_GROUPES.filter(g => parGroupe.has(g)).map(g => {
    const liste = parGroupe.get(g)!;
    // Aujourd'hui : actions d'abord, chaque sous-liste gardant son ordre chronologique.
    const ordonnee = g === "Aujourd'hui"
      ? [...liste.filter(n => categorieDe(n) === "action"), ...liste.filter(n => categorieDe(n) !== "action")]
      : liste;
    return { groupe: g, items: ordonnee };
  });
}

// Nombre de jours (calendaires, Conakry) entre une date et `now` : 0 = aujourd'hui.
export function ecartJours(iso: string, now: Date): number {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : jourEntier(now) - jourEntier(d);
}

// « Mardi 21 oct. 2026, 2:45 PM » — heure de Conakry, 12 h AM/PM.
const FORMAT_DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, weekday: "long", day: "numeric", month: "short", year: "numeric" });
const FORMAT_HEURE = new Intl.DateTimeFormat("en-US", { timeZone: FUSEAU_GUINEE, hour: "numeric", minute: "2-digit", hour12: true });
export function dateHeureLongue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const jour = FORMAT_DATE_LONGUE.format(d);
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)}, ${FORMAT_HEURE.format(d).replace(/\s/g, " ")}`;
}

export type FiltreNotif = "toutes" | "non_lues" | "action" | "info" | "alerte";
export type PeriodeNotif = "tout" | "jour" | "7j" | "30j";
export const FILTRES_NOTIF: FiltreNotif[] = ["toutes", "non_lues", "action", "info", "alerte"];
export const PERIODES_NOTIF: PeriodeNotif[] = ["jour", "7j", "30j", "tout"];
export const LIBELLE_FILTRE: Record<FiltreNotif, string> = { toutes: "Toutes", non_lues: "Non lues", action: "À traiter", info: "Information", alerte: "Refusé" };
export const LIBELLE_PERIODE: Record<PeriodeNotif, string> = { jour: "Aujourd'hui", "7j": "7 jours", "30j": "30 jours", tout: "Tout" };

export function estFiltreNotif(v: string | null): v is FiltreNotif { return !!v && (FILTRES_NOTIF as string[]).includes(v); }
export function estPeriodeNotif(v: string | null): v is PeriodeNotif { return !!v && (PERIODES_NOTIF as string[]).includes(v); }

export function correspondPeriode(iso: string, periode: PeriodeNotif, now: Date): boolean {
  if (periode === "tout") return true;
  const e = ecartJours(iso, now);
  return periode === "jour" ? e <= 0 : periode === "7j" ? e < 7 : e < 30;
}

export function correspondFiltre(n: NotificationInstitution, filtre: FiltreNotif, nonLuesIds: ReadonlySet<string>): boolean {
  if (filtre === "toutes") return true;
  if (filtre === "non_lues") return nonLuesIds.has(n.id);
  return categorieDe(n) === filtre;
}

// Recherche plein texte insensible à la casse et aux accents.
export function normaliserRecherche(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
