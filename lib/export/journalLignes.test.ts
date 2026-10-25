import { describe, expect, it } from "vitest";
import { calculerHashContenu, type EnveloppeExport } from "./canonique";
import {
  construireFiltresSignes, construireLignesExport, genererCsvJournal, genererJsonJournal, ligneEnStructureJson,
  lignesInformations, resumerFiltresLisibles, type EntreeExportJournal, type InfosDocument,
} from "./journalLignes";
import { lireFiltresJournal } from "@/lib/journalRequete";
import { libelleAction } from "@/lib/journalLibelles";

function entree(surcharge: Partial<EntreeExportJournal> = {}): EntreeExportJournal {
  return {
    audit_id: "YL-AUD-2026-00000001", membre_nom: "Aïssatou Diallo", action: "rdv_accepte", categorie: "rdv", niveau: "info",
    cible_table: "rdv", details: { z: 1, a: "x" }, ancienne_valeur: null, nouvelle_valeur: { statut: "confirme" },
    ip: "197.149.0.1", navigateur: "Chrome", os: "Windows", plateforme: "web", created_at: "2026-10-23T17:00:00+00:00",
    ...surcharge,
  };
}

function enveloppe(lignes: Record<string, string | number | null>[]): EnveloppeExport {
  return {
    reference: "YL-EXP-2026-00000001", type: "journal", format: "xlsx", institution_id: "11111111-1111-1111-1111-111111111111",
    auteur_id: null, role: "admin", filtres: {}, nb_lignes: lignes.length, version_gabarit: "journal-1",
    cree_le: "2026-10-24T18:00:00.000Z", lignes,
  };
}

function infos(surcharge: Partial<InfosDocument> = {}): InfosDocument {
  return {
    reference: "YL-EXP-2026-00000001", etablissement: "ECOBANK", creeLe: "2026-10-24T17:51:00.000Z", auteur: "Aïssatou Diallo",
    role: "Administrateur", filtresLisibles: "Aucun filtre (toutes les entrées)", nbLignes: 1, tronque: false,
    hash: "a".repeat(64), versionGabarit: "journal-1", filtresSignes: {}, ...surcharge,
  };
}

describe("construireLignesExport", () => {
  it("n'a pas de colonne IP sans le droit, et ne contient aucune valeur d'IP", () => {
    const m = construireLignesExport([entree()], { voirIp: false });
    expect(m.colonnes.map(c => c.cle)).not.toContain("ip");
    expect(m.lignes[0]).not.toHaveProperty("ip");
    expect(JSON.stringify(m)).not.toContain("197.149.0.1");
  });
  it("a la colonne IP avec le droit, entre « Valeur après » et « Navigateur »", () => {
    const m = construireLignesExport([entree()], { voirIp: true });
    const cles = m.colonnes.map(c => c.cle);
    expect(cles.indexOf("ip")).toBe(cles.indexOf("apres") + 1);
    expect(cles[cles.indexOf("ip") + 1]).toBe("navigateur");
    expect(m.lignes[0].ip).toBe("197.149.0.1");
  });
  it("donne des libellés français, l'heure 12 h de Conakry et l'horodatage ISO UTC", () => {
    const l = construireLignesExport([entree()], { voirIp: true }).lignes[0];
    expect(l.action).toBe("rdv_accepte");
    expect(l.action_libelle).toBe("Rendez-vous accepté");
    expect(l.categorie).toBe("Rendez-vous");
    expect(l.niveau).toBe("Information");
    expect(l.cible).toBe("Rendez-vous");
    expect(l.plateforme).toBe("Web");
    expect(l.horodatage_utc).toBe("2026-10-23T17:00:00.000Z");
    expect(l.date).toBe("23 octobre 2026 · 5:00 PM");
  });
  it("laisse une action inconnue en code brut", () => {
    const l = construireLignesExport([entree({ action: "action_inconnue_x", cible_table: "table_x" })], { voirIp: false }).lignes[0];
    expect(l.action_libelle).toBe("action_inconnue_x");
    expect(l.cible).toBe("table_x");
    expect(libelleAction("message_envoye", { client_nom: "Mamadou" })).toBe("Message envoyé à Mamadou");
  });
  it("sérialise détails, avant et après en JSON canonique (clés triées), null si absent", () => {
    const l = construireLignesExport([entree()], { voirIp: false }).lignes[0];
    expect(l.details).toBe('{"a":"x","z":1}');
    expect(l.avant).toBeNull();
    expect(l.apres).toBe('{"statut":"confirme"}');
    expect(construireLignesExport([entree({ details: null })], { voirIp: false }).lignes[0].details).toBe("{}");
  });
  it("neutralise l'injection de formule tableur dans le modèle (donc dans le fichier et le signé)", () => {
    const l = construireLignesExport([entree({ membre_nom: "=HYPERLINK(\"http://x\")" }), entree({ membre_nom: "-Moussa" })], { voirIp: false }).lignes;
    expect(l[0].membre).toBe("'=HYPERLINK(\"http://x\")");
    expect(l[1].membre).toBe("'-Moussa");
    expect(construireLignesExport([entree()], { voirIp: false }).lignes[0].membre).toBe("Aïssatou Diallo");
  });
});

describe("empreinte et altération", () => {
  it("une cellule modifiée donne une empreinte différente", () => {
    const m = construireLignesExport([entree(), entree({ audit_id: "YL-AUD-2026-00000002" })], { voirIp: true });
    const original = calculerHashContenu(enveloppe(m.lignes));
    const altere = m.lignes.map(l => ({ ...l }));
    altere[1].membre = "Quelqu'un d'autre";
    expect(calculerHashContenu(enveloppe(altere))).not.toBe(original);
    const autreHeure = m.lignes.map(l => ({ ...l }));
    autreHeure[0].date = "23 octobre 2026 · 5:01 PM";
    expect(calculerHashContenu(enveloppe(autreHeure))).not.toBe(original);
  });
  it("l'ordre d'affichage des lignes n'influe pas sur l'empreinte", () => {
    const m = construireLignesExport([entree(), entree({ audit_id: "YL-AUD-2026-00000002" })], { voirIp: true });
    expect(calculerHashContenu(enveloppe(m.lignes))).toBe(calculerHashContenu(enveloppe([...m.lignes].reverse())));
  });
  it("le masquage de l'IP change le contenu signé (la valeur signée est la valeur exportée)", () => {
    const avecIp = construireLignesExport([entree()], { voirIp: true }).lignes;
    const sansIp = construireLignesExport([entree()], { voirIp: false }).lignes;
    expect(calculerHashContenu(enveloppe(avecIp))).not.toBe(calculerHashContenu(enveloppe(sansIp)));
  });
});

describe("rendus", () => {
  it("CSV : BOM, séparateur point-virgule, 7 lignes de métadonnées, ligne vide, puis le tableau", () => {
    const m = construireLignesExport([entree()], { voirIp: false });
    const csv = genererCsvJournal(m, infos());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lignes = csv.slice(1).split("\r\n");
    expect(lignes[0]).toBe('"Référence";"YL-EXP-2026-00000001"');
    expect(lignes[6].startsWith('"Empreinte SHA-256";"aaaa')).toBe(true);
    expect(lignes[7]).toBe("");
    expect(lignes[8]).toBe(m.colonnes.map(c => `"${c.entete}"`).join(";"));
    expect(lignes[9].split('";"').length).toBe(m.colonnes.length);
    expect(lignes).toHaveLength(11); // 7 + vide + entête + 1 ligne + fin de fichier
  });
  it("CSV : double les guillemets dans une cellule", () => {
    const m = construireLignesExport([entree({ membre_nom: 'Jean "le grand"' })], { voirIp: false });
    expect(genererCsvJournal(m, infos())).toContain('"Jean ""le grand"""');
  });
  it("JSON : objet { document, lignes } avec détails en objets, sans les mots signé / valeur probante", () => {
    const m = construireLignesExport([entree()], { voirIp: false });
    const j = JSON.parse(genererJsonJournal(m, infos({ tronque: true })));
    expect(Object.keys(j)).toEqual(["document", "lignes"]);
    expect(j.document).toMatchObject({ reference: "YL-EXP-2026-00000001", empreinte: "a".repeat(64), etablissement: "ECOBANK", nb_lignes: 1, tronque: true });
    expect(j.lignes[0].details).toEqual({ a: "x", z: 1 });
    expect(j.lignes[0].avant).toBeNull();
    expect(JSON.stringify(j).toLowerCase()).not.toMatch(/signé|probante/);
    expect(ligneEnStructureJson(m.lignes[0]).apres).toEqual({ statut: "confirme" });
  });
  it("affiche la troncature dans les informations et la signe dans les filtres", () => {
    expect(lignesInformations(infos({ tronque: true })).find(l => l.champ === "Nombre de lignes")?.valeur).toContain("limité");
    const f = construireFiltresSignes(lireFiltresJournal(new URLSearchParams("categorie=rdv")), true);
    expect(f).toMatchObject({ categorie: "rdv", limite_lignes: 5000, tronque: true });
  });
  it("résume les filtres en français", () => {
    const f = lireFiltresJournal(new URLSearchParams("categorie=rdv&niveau=critique&date_from=2026-10-01T00:00:00.000Z&date_to=2026-10-24T23:59:59.999Z"));
    const texte = resumerFiltresLisibles(f);
    expect(texte).toContain("Catégorie : Rendez-vous");
    expect(texte).toContain("Niveau : Critique");
    expect(texte).toContain("1 octobre 2026");
    expect(resumerFiltresLisibles(lireFiltresJournal(new URLSearchParams()))).toBe("Aucun filtre (toutes les entrées)");
  });
});
