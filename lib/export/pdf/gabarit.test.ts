import { describe, expect, it, vi } from "vitest";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { COULEURS_PDF, MENTION_CONFIDENTIALITE_EXPORT, PDF_MAX_LIGNES, TEXTE_JURIDIQUE_EXPORT, VERROUILLAGE_PDF_PAR_DEFAUT } from "./config";
import { FILIGRANE_OPACITE, FILIGRANE_TAILLE, installerFiligrane } from "./filigrane";
import { genererPdfGabarit, type ColonnePdf, type ParametresGabaritPdf } from "./gabarit";
import { assainirPourHelvetica, chargerPolices, contientHorsWinAnsi } from "./polices";

const COLONNES: ColonnePdf[] = [
  { cle: "date", entete: "Date (heure de Conakry)", fraction: 0.17 },
  { cle: "membre", entete: "Membre", fraction: 0.15 },
  { cle: "action_libelle", entete: "Action", fraction: 0.26 },
  { cle: "categorie", entete: "Catégorie", fraction: 0.11 },
  { cle: "niveau", entete: "Niveau", fraction: 0.08 },
  { cle: "cible", entete: "Cible", fraction: 0.10 },
  { cle: "reference", entete: "Référence", fraction: 0.13 },
];

function ligne(i: number): Record<string, string> {
  return {
    date: `${(i % 28) + 1} octobre 2026 · ${(i % 12) + 1}:${String(i % 60).padStart(2, "0")} PM`,
    membre: i % 7 === 0 ? "Aïssatou Diallo-Barry (Responsable de la relation client)" : "Mamadou Barry",
    action_libelle: i % 5 === 0 ? "Information sensible de l'établissement modifiée par un administrateur de l'équipe" : "Rendez-vous accepté",
    categorie: "Rendez-vous", niveau: "Information", cible: "Membre de l'équipe", reference: `YL-AUD-2026-${String(i).padStart(8, "0")}`,
  };
}

async function parametres(nbLignes: number, surcharge: Partial<ParametresGabaritPdf> = {}): Promise<ParametresGabaritPdf> {
  return {
    orientation: "paysage", titre: "Journal d'activité", etablissement: "ECOBANK", reference: "YL-EXP-2026-00000001",
    creeLe: "2026-10-25T00:43:19.487Z", hash: "a".repeat(64), auteur: "Aïssatou Diallo", role: "Administrateur",
    informations: [
      { champ: "Référence", valeur: "YL-EXP-2026-00000001" },
      { champ: "Établissement", valeur: "ECOBANK" },
      { champ: "Filtres appliqués", valeur: "Aucun filtre (toutes les entrées)" },
      { champ: "Nombre de lignes", valeur: String(nbLignes) },
    ],
    mentionsEntete: ["Ce PDF est une vue du jeu de données certifié.", "Les détails figurent dans les formats tableur."],
    colonnes: COLONNES, lignes: Array.from({ length: nbLignes }, (_, i) => ligne(i)),
    qr: { image: await QRCode.toBuffer("https://exemple.test/verify/export/YL-EXP-2026-00000001#e=abc", { width: 120 }), urlCourte: "https://exemple.test/verify/export/YL-EXP-2026-00000001" },
    ...surcharge,
  };
}

const nbPagesDansFichier = (b: Buffer) => (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

// Texte d'un PDF non compressé : les polices standard sont écrites en chaînes
// hexadécimales WinAnsi dans des tableaux TJ (le texte d'une ligne peut être coupé
// par des ajustements de crénage) ; on recolle chaque tableau en une ligne de texte.
function textesDuPdf(b: Buffer): string[] {
  const brut = b.toString("latin1");
  const lignes: string[] = [];
  for (const m of brut.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    const morceaux = [...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map(h => Buffer.from(h[1], "hex").toString("latin1"));
    lignes.push(morceaux.join(""));
  }
  for (const m of brut.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) lignes.push(Buffer.from(m[1], "hex").toString("latin1"));
  return lignes;
}

describe("polices", () => {
  it("assainit les caractères hors WinAnsi pour Helvetica et conserve les accents français", () => {
    expect(assainirPourHelvetica("Aïssatou à Conakry — « test » ’ … €")).toBe("Aïssatou à Conakry — « test » ’ … €");
    expect(assainirPourHelvetica("délai → 24 h")).toBe("délai ? 24 h");
    expect(assainirPourHelvetica("1 000")).toBe("1 000");
    expect(assainirPourHelvetica("a​b\r\nc\td")).toBe("ab c d");
    expect(assainirPourHelvetica("ɓɗŋ")).toBe("???");
    expect(contientHorsWinAnsi("ɓ")).toBe(true);
    expect(contientHorsWinAnsi("Aïssatou")).toBe(false);
  });
  it("retombe sur Helvetica quand les fichiers de police sont absents ou non configurés", () => {
    const doc = new PDFDocument();
    expect(chargerPolices(doc).standard).toBe(true);
    const repli = chargerPolices(doc, { regulier: "absent/a.ttf", gras: "absent/b.ttf", italique: "absent/c.ttf" });
    expect(repli).toMatchObject({ standard: true, regulier: "Helvetica", gras: "Helvetica-Bold", italique: "Helvetica-Oblique" });
  });
});

describe("filigrane", () => {
  it("est posé sur la première page puis à chaque pageAdded, en or plat à 5 % d'opacité", () => {
    const appels: string[] = [];
    let ecouteur: (() => void) | null = null;
    const chaine: Record<string, unknown> = {};
    for (const nom of ["save", "restore", "opacity", "translate", "scale", "lineWidth", "lineCap", "lineJoin", "strokeColor", "circle", "path", "stroke"]) {
      chaine[nom] = (...args: unknown[]) => { appels.push(`${nom}:${args.join(",")}`); return chaine; };
    }
    chaine.page = { width: 841.89, height: 595.28 };
    chaine.on = (evenement: string, f: () => void) => { if (evenement === "pageAdded") ecouteur = f; return chaine; };
    const decor = vi.fn();
    installerFiligrane(chaine as unknown as PDFKit.PDFDocument, decor);
    expect(decor).toHaveBeenCalledTimes(1);
    expect(appels).toContain(`opacity:${FILIGRANE_OPACITE}`);
    expect(appels).toContain(`strokeColor:${COULEURS_PDF.or}`);
    expect(appels).toContain(`scale:${FILIGRANE_TAILLE / 24}`);
    expect(appels.filter(a => a === "path:M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12")).toHaveLength(1);
    expect(ecouteur).not.toBeNull();
    (ecouteur as unknown as () => void)();
    expect(decor).toHaveBeenCalledTimes(2);
    expect(appels.filter(a => a === "save:")).toHaveLength(2);
    expect(appels.filter(a => a === "restore:")).toHaveLength(2);
  });
});

describe("configuration", () => {
  it("laisse vides les textes de confidentialité et juridique, et le verrouillage désactivé", () => {
    expect(MENTION_CONFIDENTIALITE_EXPORT).toBe("");
    expect(TEXTE_JURIDIQUE_EXPORT).toBe("");
    expect(VERROUILLAGE_PDF_PAR_DEFAUT).toBe(false);
  });
  it("plafonne le PDF à 1000 lignes", () => {
    expect(PDF_MAX_LIGNES).toBe(1000);
  });
});

// Délai large : la génération est lente sur une machine chargée (mesures du 24/10/2026).
describe("gabarit PDF", { timeout: 60_000 }, () => {
  it("génère un PDF valide, en paysage, avec métadonnées et langue", async () => {
    const { buffer, nbPages } = await genererPdfGabarit(await parametres(12));
    const texte = buffer.toString("latin1");
    expect(texte.startsWith("%PDF-")).toBe(true);
    expect(texte).toMatch(/\/Lang/);
    expect(texte).toMatch(/\/Producer/);
    expect(texte).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
    expect(nbPages).toBe(1);
    expect(nbPagesDansFichier(buffer)).toBe(nbPages);
  });
  it("génère en portrait quand on le demande", async () => {
    const { buffer } = await genererPdfGabarit(await parametres(5, { orientation: "portrait" }));
    expect(buffer.toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
  });
  it("pagine un tableau long", async () => {
    const { buffer, nbPages } = await genererPdfGabarit(await parametres(200));
    expect(nbPages).toBeGreaterThan(3);
    expect(nbPagesDansFichier(buffer)).toBe(nbPages);
  });
  it("accepte un tableau vide", async () => {
    const { nbPages } = await genererPdfGabarit(await parametres(0));
    expect(nbPages).toBe(1);
  });
  it("refuse le verrouillage, non implémenté", async () => {
    await expect(genererPdfGabarit(await parametres(1, { verrouiller: true }))).rejects.toThrow(/verrouillage/i);
  });
  it("donne le même résultat avec la mesure rapide et avec la mesure exacte (avant/après)", async () => {
    const p = await parametres(150);
    const exact = await genererPdfGabarit({ ...p, mesureExacte: true });
    const rapide = await genererPdfGabarit({ ...p, mesureExacte: false });
    expect(rapide.nbPages).toBe(exact.nbPages);
    expect(rapide.diagnostic.hauteurTotale).toBeCloseTo(exact.diagnostic.hauteurTotale, 6);
    expect(Math.abs(rapide.buffer.length - exact.buffer.length) / exact.buffer.length).toBeLessThan(0.005);
    // La mesure rapide évite bien l'essentiel des mesures coûteuses.
    expect(exact.diagnostic.nbCellulesRapides).toBe(0);
    expect(rapide.diagnostic.nbCellulesRapides).toBeGreaterThan(rapide.diagnostic.nbCellulesMesurees);
    expect(rapide.diagnostic.nbCellulesRapides + rapide.diagnostic.nbCellulesMesurees).toBe(150 * COLONNES.length);
  });
  it("garde deux lignes par cellule (et non une seule suivie de points de suspension)", async () => {
    const longue = "Information sensible de l'établissement modifiée par un administrateur de l'équipe";
    const { buffer } = await genererPdfGabarit(await parametres(1, { compresser: false, lignes: [{ ...ligne(1), action_libelle: longue }] }));
    const texte = textesDuPdf(buffer).join("\n");
    expect(texte).toContain("Information sensible");
    expect(texte).toContain("équipe"); // fin du texte, sur la 2e ligne de la cellule
    expect(texte).not.toContain("…");
  });
  it("affiche la phrase imposée, l'empreinte et « Page X sur Y » au pied de chaque page", async () => {
    const { buffer, nbPages } = await genererPdfGabarit(await parametres(150, { compresser: false }));
    const lignes = textesDuPdf(buffer);
    expect(nbPages).toBeGreaterThan(1);
    expect(lignes.filter(l => l.startsWith("Document généré par Yelen224 le 25 octobre 2026 · 12:43 AM, référence YL-EXP-2026-00000001, vérifiable via le QR code."))).toHaveLength(nbPages);
    expect(lignes.filter(l => l === `Empreinte SHA-256 : ${"a".repeat(64)}`)).toHaveLength(nbPages);
    for (let i = 1; i <= nbPages; i++) expect(lignes).toContain(`Page ${i} sur ${nbPages}`);
  });
  it("affiche la mention de limite en en-tête et au pied de chaque page, et rien sans elle", async () => {
    const mention = "PDF limité aux 1000 lignes les plus récentes sur 3200. Les formats tableur contiennent l'ensemble (jusqu'à 5000).";
    const avec = await genererPdfGabarit(await parametres(150, { compresser: false, mentionLimite: mention }));
    const sans = await genererPdfGabarit(await parametres(150, { compresser: false }));
    const occurrences = (b: Buffer) => textesDuPdf(b).filter(l => l.includes("PDF limité aux 1000 lignes")).length;
    expect(occurrences(avec.buffer)).toBe(avec.nbPages + 1); // 1 en-tête + 1 par pied de page
    expect(occurrences(sans.buffer)).toBe(0);
  });
  it("rend le mode sections (cartes KPI, liste, tableaux) en portrait, avec en-tête de colonnes répété", async () => {
    const base = await parametres(0);
    const colonnesTop: ColonnePdf[] = [
      { cle: "service", entete: "Service", fraction: 0.5 }, { cle: "ventes", entete: "Ventes", fraction: 0.2, align: "right" },
      { cle: "montant", entete: "CA", fraction: 0.3, align: "right" },
    ];
    const p: ParametresGabaritPdf = {
      orientation: "portrait", titre: "Rapport financier exécutif", etablissement: "ECOBANK", reference: base.reference, creeLe: base.creeLe,
      hash: base.hash, auteur: base.auteur, role: base.role, informations: base.informations, qr: base.qr, compresser: false,
      sections: [
        { type: "kpis", items: [
          { label: "Aujourd'hui", valeur: "50 000 GNF", detail: "— · 1 vente", ton: "neutre" },
          { label: "Cette semaine", valeur: "300 000 GNF", detail: "+12.5% · 4 ventes", ton: "positif" },
          { label: "Ce mois", valeur: "900 000 GNF", detail: "-3.2% · 12 ventes", ton: "negatif" },
          { label: "Cette année", valeur: "9 000 000 GNF", detail: "0% · 120 ventes", ton: "neutre" },
        ] },
        { type: "liste", titre: "Résumé", items: ["Première phrase du résumé.", "Deuxième phrase du résumé."] },
        { type: "tableau", titre: "Top services (cette année)", colonnes: colonnesTop,
          lignes: Array.from({ length: 120 }, (_, i) => ({ service: `Service numéro ${i}`, ventes: i, montant: `${i * 1000} GNF` })) },
        { type: "tableau", titre: "Répartition vide", colonnes: colonnesTop, lignes: [], vide: "Aucune donnée pour le moment." },
      ],
    };
    const { buffer, nbPages } = await genererPdfGabarit(p);
    const lignes = textesDuPdf(buffer);
    expect(buffer.toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(nbPages).toBeGreaterThan(1);
    expect(lignes).toContain("AUJOURD'HUI");
    expect(lignes).toContain("300 000 GNF");
    expect(lignes).toContain("+12.5% · 4 ventes");
    expect(lignes).toContain("Résumé");
    expect(lignes.some(l => l.includes("Première phrase du résumé."))).toBe(true);
    expect(lignes).toContain("Top services (cette année)");
    // L'en-tête de colonnes du grand tableau est répété sur chaque page qui le continue.
    expect(lignes.filter(l => l === "SERVICE").length).toBeGreaterThanOrEqual(2);
    expect(lignes).toContain("Service numéro 119");
    expect(lignes).toContain("Aucune donnée pour le moment.");
    for (let i = 1; i <= nbPages; i++) expect(lignes).toContain(`Page ${i} sur ${nbPages}`);
  });
  it("exige soit colonnes + lignes, soit sections", async () => {
    const p = await parametres(1);
    await expect(genererPdfGabarit({ ...p, colonnes: undefined, lignes: undefined })).rejects.toThrow(/sections/);
    await expect(genererPdfGabarit({ ...p, sections: [] })).rejects.toThrow(/sections/);
  });
  it("ne modifie pas les lignes fournies (le contenu signé reste intact)", async () => {
    const p = await parametres(3);
    const avant = JSON.stringify(p.lignes);
    await genererPdfGabarit(p);
    expect(JSON.stringify(p.lignes)).toBe(avant);
  });
});

// Mesures de charge : 1000 lignes (plafond du PDF) répétées 3 fois — la machine de
// développement est instable, on retient le MEILLEUR temps — puis 5000 lignes une fois.
describe("charge", () => {
  for (const [n, repetitions, pagesMin] of [[1000, 3, 20], [5000, 1, 100]] as const) {
    it(`génère ${n} lignes et rapporte temps, pages et poids`, async () => {
      const p = await parametres(n);
      const durees: number[] = [];
      let dernier: Awaited<ReturnType<typeof genererPdfGabarit>> | null = null;
      for (let i = 0; i < repetitions; i++) {
        const debut = performance.now();
        dernier = await genererPdfGabarit(p);
        durees.push(Math.round(performance.now() - debut));
      }
      const { buffer, nbPages, diagnostic } = dernier!;
      console.info(`[CHARGE PDF] ${n} lignes : ${durees.join(" / ")} ms (meilleur ${Math.min(...durees)} ms), ${nbPages} pages, ${(buffer.length / 1024).toFixed(0)} Ko, cellules rapides ${diagnostic.nbCellulesRapides} / mesurées ${diagnostic.nbCellulesMesurees}`);
      expect(buffer.toString("latin1", 0, 5)).toBe("%PDF-");
      expect(nbPages).toBeGreaterThan(pagesMin);
      expect(nbPagesDansFichier(buffer)).toBe(nbPages);
    }, 300_000);
  }
});
