// Modèle de lignes UNIQUE de l'export des Transactions (24/10/2026) : la liste signée
// par enregistrerExport est exactement celle écrite dans les fichiers (CSV, XLSX) et
// imprimée (PDF, vue partielle). Fonctions pures, sans accès réseau ni base.
//
// Le montant est un NOMBRE entier (GNF) dans le fichier et dans le contenu signé. Le
// nom du citoyen n'est jamais remplacé par son numéro de téléphone (minimisation) :
// repli « Citoyen ».
import { dateIsoUtc } from "./canonique";
import { dateHeureCourte } from "@/lib/heure";
import { DEVISE_LABEL } from "@/lib/devise";
import { MAX_LIGNES_EXPORT, neutraliserFormule, type LigneExport, type ModeleExport } from "./rendus";

export const VERSION_GABARIT_TRANSACTIONS = "transactions-1";
export const MAX_LIGNES_TRANSACTIONS = MAX_LIGNES_EXPORT;
// Nombre maximal de lignes de la table lues pour constituer l'export (filtres
// appliqués avant le plafond de 5000) ; au-delà, l'export est signalé comme limité.
export const BALAYAGE_MAX_TRANSACTIONS = 20000;
export const TAILLE_LOT_TRANSACTIONS = 1000;

const LIBELLES_TYPE: Readonly<Record<string, string>> = {
  encaissement: "Encaissement", remboursement: "Remboursement", correction: "Correction",
  annulation: "Annulation", ajustement: "Ajustement",
};
export function libelleTypeTransaction(type: string): string {
  return Object.prototype.hasOwnProperty.call(LIBELLES_TYPE, type) ? LIBELLES_TYPE[type] : type;
}

export type TransactionExport = {
  reference: string;
  type_transaction: string;
  montant: number;
  motif: string | null;
  membre_nom: string;
  citoyen_nom: string | null;
  service_nom: string | null;
  created_at: string;
};

// Nom d'un citoyen pour l'export : prénom + nom, sinon « Citoyen ». Jamais le téléphone.
export function nomCitoyenPourExport(u: { prenom: string | null; nom: string | null } | null): string {
  if (!u) return "Citoyen";
  return [u.prenom, u.nom].filter(Boolean).join(" ") || "Citoyen";
}

export function construireLignesTransactions(transactions: TransactionExport[]): ModeleExport {
  const colonnes = [
    { cle: "reference", entete: "Référence" },
    { cle: "date", entete: "Date (heure de Conakry)" },
    { cle: "horodatage_utc", entete: "Horodatage (UTC)" },
    { cle: "type", entete: "Type" },
    { cle: "citoyen", entete: "Citoyen" },
    { cle: "service", entete: "Service" },
    { cle: "agent", entete: "Agent" },
    { cle: "montant", entete: `Montant (${DEVISE_LABEL})` },
    { cle: "motif", entete: "Motif" },
  ];
  const lignes = transactions.map((t): LigneExport => ({
    reference: neutraliserFormule(t.reference),
    date: dateHeureCourte(t.created_at),
    horodatage_utc: dateIsoUtc(t.created_at),
    type: neutraliserFormule(libelleTypeTransaction(t.type_transaction)),
    citoyen: neutraliserFormule(t.citoyen_nom),
    service: neutraliserFormule(t.service_nom),
    agent: neutraliserFormule(t.membre_nom),
    montant: Math.round(Number(t.montant)),
    motif: neutraliserFormule(t.motif),
  }));
  return { colonnes, lignes };
}

// Ligne du PDF : montant mis en forme (séparateur de milliers par espace ASCII,
// jamais toLocaleString : pdfkit ne gère pas l'espace fine U+202F).
export function formaterMontantPdf(montant: number): string {
  return `${Math.round(montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${DEVISE_LABEL}`;
}

// ── Filtres ────────────────────────────────────────────────────────────────
export type FiltresTransactions = {
  type: string | null;
  agent: string | null;
  service: string | null;
  depuis: string | null;
  montantMin: number | null;
  montantMax: number | null;
  q: string | null;
};

function nombreOuNull(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function lireFiltresTransactions(sp: URLSearchParams): FiltresTransactions {
  const texte = (cle: string) => { const v = sp.get(cle); return v && v.trim() ? v.trim() : null; };
  const depuis = texte("depuis");
  return {
    type: texte("type"), agent: texte("agent"), service: texte("service"),
    depuis: depuis && !Number.isNaN(new Date(depuis).getTime()) ? depuis : null,
    montantMin: nombreOuNull(sp.get("montantMin")), montantMax: nombreOuNull(sp.get("montantMax")), q: texte("q"),
  };
}

export function construireFiltresTransactionsSignes(
  f: FiltresTransactions, tronque: boolean, pdf?: { limite: number; tronque: boolean },
): Record<string, unknown> {
  return {
    type: f.type, agent: f.agent, service: f.service, depuis: f.depuis, montant_min: f.montantMin, montant_max: f.montantMax,
    q: f.q, limite_lignes: MAX_LIGNES_TRANSACTIONS, tronque,
    ...(pdf ? { limite_lignes_pdf: pdf.limite, tronque_pdf: pdf.tronque } : {}),
  };
}

export function resumerFiltresTransactions(f: FiltresTransactions): string {
  const p: string[] = [];
  if (f.type) p.push(`Type : ${libelleTypeTransaction(f.type)}`);
  if (f.agent) p.push(`Agent : ${f.agent}`);
  if (f.service) p.push(`Service : ${f.service}`);
  if (f.depuis) p.push(`Depuis le : ${dateHeureCourte(f.depuis)}`);
  if (f.montantMin !== null) p.push(`Montant minimum : ${formaterMontantPdf(f.montantMin)}`);
  if (f.montantMax !== null) p.push(`Montant maximum : ${formaterMontantPdf(f.montantMax)}`);
  if (f.q) p.push(`Recherche : « ${f.q} »`);
  return p.length ? p.join(" — ") : "Aucun filtre (toutes les transactions)";
}

// ── Lecture par lots : filtres appliqués AVANT le plafond ──────────────────
// Lit la table par lots (déjà filtrés côté SQL pour type, agent, date, montant), puis
// applique les filtres qui ne peuvent pas l'être en SQL (service, recherche) lot par
// lot, jusqu'à avoir `max + 1` lignes (pour savoir si le résultat est tronqué) ou
// épuisé la table. Avant ce correctif, ces deux filtres étaient appliqués APRÈS la
// limite de 5000 lignes : au-delà, un filtre « service » pouvait renvoyer moins de
// lignes que la réalité sans le signaler. On avance de la taille RÉELLEMENT reçue
// (un lot plus petit que demandé, p. ex. plafond de lignes de l'API, n'arrête pas la lecture).
export async function collecterTransactions(p: {
  chargerLot: (offset: number, taille: number) => Promise<unknown[]>;
  // Enrichit le lot (citoyen, service) et applique service / recherche.
  traiterLot: (lot: unknown[]) => Promise<TransactionExport[]>;
  max: number;
  tailleLot: number;
  balayageMax: number;
}): Promise<{ lignes: TransactionExport[]; tronque: boolean; balayageAtteint: boolean; lignesLues: number }> {
  const retenues: TransactionExport[] = [];
  let offset = 0;
  let epuise = false;
  while (retenues.length <= p.max && offset < p.balayageMax) {
    const lot = await p.chargerLot(offset, p.tailleLot);
    if (lot.length === 0) { epuise = true; break; }
    offset += lot.length;
    retenues.push(...(await p.traiterLot(lot)));
  }
  const balayageAtteint = !epuise && retenues.length <= p.max && offset >= p.balayageMax;
  const tronque = retenues.length > p.max || balayageAtteint;
  return { lignes: retenues.slice(0, p.max), tronque, balayageAtteint, lignesLues: offset };
}
