// Modèles de lignes des exports serveur des écrans (phase 1, 24/10/2026) : RDV passés,
// RDV de l'accueil, Historique financier et Paiements. Fonctions pures.
//
// Approche « sélection de l'écran » : le navigateur envoie les identifiants des lignes
// affichées (max 5000) ; le serveur les relit, ne garde que celles de l'établissement
// de la session, applique le masque des téléphones selon le rôle, puis construit le
// modèle ci-dessous, signé tel quel. Aucune logique de filtre de l'écran n'est dupliquée.
//
// Minimisation : le téléphone est masqué (+224 ******* 78) sauf pour les rôles ayant
// export.telephone_clair, et le nom d'un client sans prénom ni nom n'est JAMAIS remplacé
// par son numéro de téléphone (repli « Client » / « Citoyen »).
import { dateJourConakry, heureAmPm } from "@/lib/heure";
import { DEVISE_LABEL } from "@/lib/devise";
import type { RdvHistoAssemble } from "@/lib/rdvHistorique";
import type { PaiementAssemble } from "@/lib/paiementsListe";
import { nomClientPourExport, telephoneExporte } from "./telephone";
import { neutraliserFormule, type ColonneExport, type LigneExport, type ModeleExport } from "./rendus";

export const MAX_IDS_EXPORT_ECRAN = 5000;

export type EcranExport = "rdv_passes" | "rdv_accueil" | "historique_financier" | "paiements";
export const ECRANS_EXPORT: readonly EcranExport[] = ["rdv_passes", "rdv_accueil", "historique_financier", "paiements"];

// Libellé affiché de l'écran, pour le titre du document et la page de vérification.
export const LIBELLES_ECRAN: Readonly<Record<EcranExport, string>> = {
  rdv_passes: "RDV passés",
  rdv_accueil: "Rendez-vous de l'accueil",
  historique_financier: "Historique financier",
  paiements: "Paiements",
};

export const VERSIONS_GABARIT_ECRAN: Readonly<Record<EcranExport, string>> = {
  rdv_passes: "rdv-passes-1", rdv_accueil: "rdv-accueil-1", historique_financier: "historique-financier-1", paiements: "paiements-1",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valide le corps d'une demande d'export : un écran connu et au plus 5000 identifiants
// bien formés. Un dépassement est refusé (jamais coupé en silence).
export function lireDemandeExport(corps: unknown): { ecran: EcranExport; ids: string[] } | { erreur: string } {
  if (!corps || typeof corps !== "object") return { erreur: "Corps de requête invalide" };
  const { ecran, ids } = corps as { ecran?: unknown; ids?: unknown };
  if (typeof ecran !== "string" || !(ECRANS_EXPORT as readonly string[]).includes(ecran)) return { erreur: "Écran d'export inconnu" };
  if (!Array.isArray(ids)) return { erreur: "Liste d'identifiants requise" };
  if (ids.length === 0) return { erreur: "Aucune ligne à exporter" };
  if (ids.length > MAX_IDS_EXPORT_ECRAN) return { erreur: `Trop de lignes sélectionnées (maximum ${MAX_IDS_EXPORT_ECRAN}). Affinez les filtres.` };
  if (!ids.every((id): id is string => typeof id === "string" && UUID.test(id))) return { erreur: "Identifiant invalide dans la sélection" };
  return { ecran: ecran as EcranExport, ids: [...new Set(ids)] };
}

// Remet les lignes lues dans l'ordre des identifiants reçus (ordre de l'écran) ;
// les identifiants sans ligne (autre établissement, supprimée) sont simplement absents.
export function reordonnerParIdentifiants<T>(lignes: T[], ids: string[], cle: (l: T) => string): T[] {
  const parId = new Map(lignes.map(l => [cle(l), l]));
  return ids.map(id => parId.get(id)).filter((l): l is T => l !== undefined);
}

// Filtres signés : le périmètre est la sélection de l'écran (le nombre d'identifiants
// reçus et retenus sont signés ; ceux écartés ne sont jamais exportés).
export function construireFiltresEcranSignes(
  ecran: EcranExport, p: { idsRecus: number; idsRetenus: number; telephoneClair: boolean },
): Record<string, unknown> {
  return {
    ecran, perimetre: "selection_ecran", ids_recus: p.idsRecus, ids_retenus: p.idsRetenus,
    telephone: p.telephoneClair ? "clair" : "masque", limite_lignes: MAX_IDS_EXPORT_ECRAN,
  };
}

export function resumerSelection(idsRecus: number, idsRetenus: number): string {
  const base = `Sélection affichée à l'écran, ${idsRetenus} ligne${idsRetenus > 1 ? "s" : ""}`;
  const ecartes = idsRecus - idsRetenus;
  return ecartes > 0 ? `${base} (${ecartes} identifiant${ecartes > 1 ? "s" : ""} ignoré${ecartes > 1 ? "s" : ""} : hors de votre établissement)` : base;
}

// ── Libellés de statut ─────────────────────────────────────────────────────
// Mêmes libellés que l'écran RDV passés (statutBadge) ; statut inconnu : valeur brute.
export function libelleStatutRdv(statut: string, presenceStatus: string | null): string {
  if (presenceStatus === "absent") return "Absent";
  switch (statut) {
    case "confirme": return "Confirmé";
    case "en_attente": return "En attente";
    case "nouveau": return "Nouveau";
    case "annule": return "Annulé";
    case "termine": return "Terminé";
    default: return statut;
  }
}

const LIBELLES_STATUT_PAIEMENT: Readonly<Record<string, string>> = {
  en_attente: "En attente", confirme: "Confirmé", termine: "Terminé", no_show: "Absent", annule: "Annulé", rembourse: "Remboursé",
};
export function libelleStatutPaiement(statut: string): string {
  return Object.prototype.hasOwnProperty.call(LIBELLES_STATUT_PAIEMENT, statut) ? LIBELLES_STATUT_PAIEMENT[statut] : statut;
}

function dateLisible(date: string): string {
  return dateJourConakry(date) || date;
}

// ── RDV (passés et accueil) ────────────────────────────────────────────────
const COLONNES_RDV: ColonneExport[] = [
  { cle: "reference", entete: "Référence" }, { cle: "date", entete: "Date" }, { cle: "heure", entete: "Heure" },
  { cle: "client", entete: "Client" }, { cle: "telephone", entete: "Téléphone" }, { cle: "service_objet", entete: "Service/Objet" },
  { cle: "statut", entete: "Statut" }, { cle: "motif_annulation", entete: "Motif annulation" }, { cle: "suivi", entete: "Suivi" },
  { cle: "agent", entete: "Agent" }, { cle: "derniere_action", entete: "Dernière action" },
];

export function construireLignesRdv(items: RdvHistoAssemble[], opts: { telephoneClair: boolean }): ModeleExport {
  const lignes = items.map(({ ligne: r, citoyen }): LigneExport => ({
    reference: neutraliserFormule(r.reference),
    date: dateLisible(r.date_rdv),
    heure: heureAmPm(r.heure_rdv) || null,
    client: neutraliserFormule(nomClientPourExport(citoyen, "Client")),
    telephone: neutraliserFormule(telephoneExporte(citoyen?.phone, opts.telephoneClair) || null),
    service_objet: neutraliserFormule(r.service_nom || r.objet || null),
    statut: neutraliserFormule(libelleStatutRdv(r.statut, r.presence_status)),
    motif_annulation: neutraliserFormule(r.motif_annulation),
    suivi: neutraliserFormule(r.notes),
    agent: neutraliserFormule(r.agent_nom),
    derniere_action: neutraliserFormule(r.derniere_action),
  }));
  return { colonnes: COLONNES_RDV, lignes };
}

// ── Paiements et historique financier ──────────────────────────────────────
const COLONNES_PAIEMENTS: ColonneExport[] = [
  { cle: "reference", entete: "Référence" }, { cle: "citoyen", entete: "Citoyen" }, { cle: "service", entete: "Service" },
  { cle: "agent", entete: "Agent" }, { cle: "date", entete: "Date" }, { cle: "heure", entete: "Heure" },
  { cle: "montant", entete: `Montant (${DEVISE_LABEL})` }, { cle: "statut", entete: "Statut" },
];
const COLONNES_HISTORIQUE: ColonneExport[] = [
  { cle: "reference", entete: "Référence" }, { cle: "client", entete: "Client" }, { cle: "telephone", entete: "Téléphone" },
  { cle: "service", entete: "Service" }, { cle: "date", entete: "Date" }, { cle: "heure", entete: "Heure" },
  { cle: "statut", entete: "Statut" }, { cle: "montant", entete: `Montant (${DEVISE_LABEL})` },
];

export function construireLignesPaiements(items: PaiementAssemble[]): ModeleExport {
  const lignes = items.map(({ ligne: p, citoyen }): LigneExport => ({
    reference: neutraliserFormule(p.reference),
    citoyen: neutraliserFormule(nomClientPourExport(citoyen, "Citoyen")),
    service: neutraliserFormule(p.service_nom),
    agent: neutraliserFormule(p.agent_nom),
    date: dateLisible(p.date_rdv),
    heure: heureAmPm(p.heure_rdv) || null,
    montant: Math.round(Number(p.montant)),
    statut: neutraliserFormule(libelleStatutPaiement(p.statut)),
  }));
  return { colonnes: COLONNES_PAIEMENTS, lignes };
}

export function construireLignesHistoriqueFinancier(items: PaiementAssemble[], opts: { telephoneClair: boolean }): ModeleExport {
  const lignes = items.map(({ ligne: p, citoyen }): LigneExport => ({
    reference: neutraliserFormule(p.reference),
    client: neutraliserFormule(nomClientPourExport(citoyen, "Client")),
    telephone: neutraliserFormule(telephoneExporte(citoyen?.phone, opts.telephoneClair) || null),
    service: neutraliserFormule(p.service_nom),
    date: dateLisible(p.date_rdv),
    heure: heureAmPm(p.heure_rdv) || null,
    statut: neutraliserFormule(libelleStatutPaiement(p.statut)),
    montant: Math.round(Number(p.montant)),
  }));
  return { colonnes: COLONNES_HISTORIQUE, lignes };
}
