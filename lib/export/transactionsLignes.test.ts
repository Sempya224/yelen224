import { describe, expect, it } from "vitest";
import { calculerHashContenu, type EnveloppeExport } from "./canonique";
import { genererCsv, type InfosDocument } from "./rendus";
import {
  collecterTransactions, construireFiltresTransactionsSignes, construireLignesTransactions, formaterMontantPdf,
  lireFiltresTransactions, libelleTypeTransaction, nomCitoyenPourExport, resumerFiltresTransactions, type TransactionExport,
} from "./transactionsLignes";

function transaction(surcharge: Partial<TransactionExport> = {}): TransactionExport {
  return {
    reference: "TRX-2026-000001", type_transaction: "encaissement", montant: 125000, motif: null, membre_nom: "Mamadou Barry",
    citoyen_nom: "Aïssatou Diallo", service_nom: "Consultation", created_at: "2026-10-23T17:00:00+00:00", ...surcharge,
  };
}

function enveloppe(lignes: Record<string, string | number | null>[]): EnveloppeExport {
  return {
    reference: "YL-EXP-2026-00000002", type: "transactions", format: "xlsx", institution_id: "11111111-1111-1111-1111-111111111111",
    auteur_id: null, role: "comptable", filtres: {}, nb_lignes: lignes.length, version_gabarit: "transactions-1",
    cree_le: "2026-10-25T10:00:00.000Z", lignes,
  };
}

function infos(): InfosDocument {
  return {
    reference: "YL-EXP-2026-00000002", etablissement: "ECOBANK", creeLe: "2026-10-25T10:00:00.000Z", auteur: "Mamadou Barry", role: "Comptable",
    filtresLisibles: "Aucun filtre (toutes les transactions)", nbLignes: 1, tronque: false, hash: "b".repeat(64),
    versionGabarit: "transactions-1", filtresSignes: {}, libelleNombre: "Nombre de transactions",
  };
}

describe("lignes Transactions", () => {
  it("garde le montant en nombre entier, dans le fichier comme dans le contenu signé", () => {
    const m = construireLignesTransactions([transaction({ montant: 125000.4 }), transaction({ montant: 99.6, reference: "TRX-2026-000002" })]);
    expect(m.lignes[0].montant).toBe(125000);
    expect(m.lignes[1].montant).toBe(100);
    expect(typeof m.lignes[0].montant).toBe("number");
    expect(m.colonnes.map(c => c.cle)).toEqual(["reference", "date", "horodatage_utc", "type", "citoyen", "service", "agent", "montant", "motif"]);
    expect(m.colonnes.find(c => c.cle === "montant")?.entete).toBe("Montant (GNF)");
  });
  it("donne les libellés, la date 12 h de Conakry et l'horodatage ISO UTC", () => {
    const l = construireLignesTransactions([transaction()]).lignes[0];
    expect(l.type).toBe("Encaissement");
    expect(l.date).toBe("23 octobre 2026 · 5:00 PM");
    expect(l.horodatage_utc).toBe("2026-10-23T17:00:00.000Z");
    expect(l.motif).toBeNull();
    expect(libelleTypeTransaction("inconnu_x")).toBe("inconnu_x");
  });
  it("n'expose jamais de téléphone : repli « Citoyen »", () => {
    expect(nomCitoyenPourExport({ prenom: "Aïssatou", nom: "Diallo" })).toBe("Aïssatou Diallo");
    expect(nomCitoyenPourExport({ prenom: "Aïssatou", nom: null })).toBe("Aïssatou");
    expect(nomCitoyenPourExport({ prenom: null, nom: null })).toBe("Citoyen");
    expect(nomCitoyenPourExport(null)).toBe("Citoyen");
  });
  it("neutralise l'injection de formule dans les textes (pas dans les montants)", () => {
    const l = construireLignesTransactions([transaction({ motif: "=HYPERLINK(\"x\")", citoyen_nom: "-Moussa" })]).lignes[0];
    expect(l.motif).toBe("'=HYPERLINK(\"x\")");
    expect(l.citoyen).toBe("'-Moussa");
    expect(l.montant).toBe(125000);
  });
  it("détecte l'altération d'une seule cellule, y compris un montant", () => {
    const m = construireLignesTransactions([transaction(), transaction({ reference: "TRX-2026-000002", montant: 5000 })]);
    const original = calculerHashContenu(enveloppe(m.lignes));
    const montantAltere = m.lignes.map(l => ({ ...l }));
    montantAltere[1].montant = 50000;
    expect(calculerHashContenu(enveloppe(montantAltere))).not.toBe(original);
    const motifAltere = m.lignes.map(l => ({ ...l }));
    motifAltere[0].motif = "ajout";
    expect(calculerHashContenu(enveloppe(motifAltere))).not.toBe(original);
    expect(calculerHashContenu(enveloppe([...m.lignes].reverse()))).toBe(original);
  });
  it("écrit les montants sans guillemets dans le CSV et formate le PDF avec des espaces ASCII", () => {
    const csv = genererCsv(construireLignesTransactions([transaction()]), infos());
    const ligne = csv.split("\r\n").find(l => l.includes("TRX-2026-000001"))!;
    expect(ligne).toContain(";125000;");
    expect(formaterMontantPdf(125000)).toBe("125 000 GNF");
    expect(formaterMontantPdf(999)).toBe("999 GNF");
    expect(formaterMontantPdf(1234567)).toBe("1 234 567 GNF");
  });
});

describe("filtres Transactions", () => {
  it("ignore les montants et dates invalides au lieu de les envoyer à la base", () => {
    const f = lireFiltresTransactions(new URLSearchParams("montantMin=abc&montantMax=2500&depuis=pas-une-date&type=encaissement"));
    expect(f.montantMin).toBeNull();
    expect(f.montantMax).toBe(2500);
    expect(f.depuis).toBeNull();
    expect(f.type).toBe("encaissement");
  });
  it("signe la limite, la troncature et, pour le PDF, le plafond du PDF", () => {
    const f = lireFiltresTransactions(new URLSearchParams("type=remboursement"));
    expect(construireFiltresTransactionsSignes(f, true)).toMatchObject({ type: "remboursement", limite_lignes: 5000, tronque: true });
    expect(construireFiltresTransactionsSignes(f, false)).not.toHaveProperty("limite_lignes_pdf");
    expect(construireFiltresTransactionsSignes(f, false, { limite: 1000, tronque: true })).toMatchObject({ limite_lignes_pdf: 1000, tronque_pdf: true });
  });
  it("résume les filtres en français", () => {
    expect(resumerFiltresTransactions(lireFiltresTransactions(new URLSearchParams("")))).toBe("Aucun filtre (toutes les transactions)");
    const t = resumerFiltresTransactions(lireFiltresTransactions(new URLSearchParams("type=remboursement&montantMin=1000&service=Consultation")));
    expect(t).toContain("Type : Remboursement");
    expect(t).toContain("Service : Consultation");
    expect(t).toContain("Montant minimum : 1 000 GNF");
  });
});

describe("lecture par lots : filtres avant le plafond", () => {
  // 300 lignes brutes ; le « service » recherché n'est porté que par une ligne sur trois.
  const brutes = Array.from({ length: 300 }, (_, i) => ({ i }));
  const sourcePlafonnee = (plafondApi: number) => async (offset: number, taille: number) => brutes.slice(offset, offset + Math.min(taille, plafondApi));
  const traiter = async (lot: unknown[]) => (lot as { i: number }[])
    .filter(l => l.i % 3 === 0)
    .map(l => transaction({ reference: `TRX-${String(l.i).padStart(6, "0")}` }));

  it("renvoie toutes les lignes correspondantes, même au-delà du premier lot", async () => {
    const r = await collecterTransactions({ chargerLot: sourcePlafonnee(1000), traiterLot: traiter, max: 5000, tailleLot: 50, balayageMax: 20000 });
    expect(r.lignes).toHaveLength(100);
    expect(r.tronque).toBe(false);
    expect(r.balayageAtteint).toBe(false);
    expect(r.lignesLues).toBe(300);
    expect(r.lignes.at(-1)?.reference).toBe("TRX-000297"); // un ancien lot, au-delà des 50 premières lignes
  });
  it("applique le plafond APRÈS les filtres et signale la troncature (l'ancien comportement perdait des lignes)", async () => {
    const max = 40;
    const r = await collecterTransactions({ chargerLot: sourcePlafonnee(1000), traiterLot: traiter, max, tailleLot: 50, balayageMax: 20000 });
    expect(r.lignes).toHaveLength(max);
    expect(r.tronque).toBe(true);
    // Ancien comportement : plafonner les `max` premières lignes brutes PUIS filtrer.
    const ancien = (await traiter(brutes.slice(0, max))).length;
    expect(ancien).toBe(14);
    expect(r.lignes.length).toBeGreaterThan(ancien);
  });
  it("continue quand l'API renvoie moins de lignes que demandé", async () => {
    const r = await collecterTransactions({ chargerLot: sourcePlafonnee(7), traiterLot: traiter, max: 5000, tailleLot: 50, balayageMax: 20000 });
    expect(r.lignes).toHaveLength(100);
    expect(r.lignesLues).toBe(300);
  });
  it("signale quand la lecture est arrêtée par la limite de balayage", async () => {
    const r = await collecterTransactions({ chargerLot: sourcePlafonnee(1000), traiterLot: traiter, max: 5000, tailleLot: 50, balayageMax: 100 });
    expect(r.balayageAtteint).toBe(true);
    expect(r.tronque).toBe(true);
    expect(r.lignes.length).toBeLessThan(100);
  });
  it("gère une table vide", async () => {
    const r = await collecterTransactions({ chargerLot: async () => [], traiterLot: traiter, max: 5000, tailleLot: 50, balayageMax: 20000 });
    expect(r).toEqual({ lignes: [], tronque: false, balayageAtteint: false, lignesLues: 0 });
  });
});
