// Gabarit PDF commun des exports Yelen (24/10/2026) : bandeau doré, logo vectoriel,
// en-tête de document avec QR de vérification, filigrane sur chaque page, pied de
// page avec référence, empreinte et « Page X sur Y ». Deux modes de corps :
//  - tableau paginé à en-tête de colonnes répété (`colonnes` + `lignes`) : listes
//    (Journal, Transactions, RDV passés) ;
//  - sections (`sections`) : cartes KPI, listes à puces et tableaux courts : rapports
//    en lecture.
//
// Mentions factuelles seulement : aucune mention de valeur probante, de signature
// électronique ni de légalisation. Les textes de confidentialité et juridique
// viennent de config.ts (vides par défaut, rien n'est affiché tant qu'ils le sont).
//
// Performance (mesures du 24/10/2026, pdfkit 0.15.2) : le coût se répartit entre le
// dessin du texte (environ 0,5 ms par cellule, incompressible) et la mesure de
// hauteur (environ 0,17 ms par cellule). La mesure est évitée quand le texte tient
// visiblement sur une ligne (largeur exacte via widthOfString, mise en cache) : le
// résultat est identique à la mesure exacte, vérifié par un test de comparaison.
import PDFDocument from "pdfkit";
import { dateHeureCourte } from "@/lib/heure";
import {
  COULEURS_PDF, LANGUE_PDF, MENTION_CONFIDENTIALITE_EXPORT, TEXTE_JURIDIQUE_EXPORT, VERROUILLAGE_PDF_PAR_DEFAUT,
} from "./config";
import { dessinerSoleil, installerFiligrane } from "./filigrane";
import { chargerPolices } from "./polices";

export type ColonnePdf = {
  cle: string;
  entete: string;
  // Part de la largeur utile (normalisée : seules les proportions comptent).
  fraction: number;
  align?: "left" | "right" | "center";
};

export type LignePdf = Record<string, string | number | null | undefined>;

export type KpiPdf = {
  label: string;
  valeur: string;
  detail?: string;
  ton?: "positif" | "negatif" | "neutre";
};

// Corps en mode « sections » (rapports) : rendues dans l'ordre, avec saut de page
// automatique ; l'en-tête de colonnes d'un tableau est répété s'il change de page.
export type SectionPdf =
  | { type: "kpis"; items: KpiPdf[] }
  | { type: "liste"; titre: string; items: string[] }
  | { type: "tableau"; titre: string; colonnes: ColonnePdf[]; lignes: LignePdf[]; vide?: string };

export type ParametresGabaritPdf = {
  orientation: "portrait" | "paysage";
  titre: string;
  etablissement: string;
  reference: string;
  creeLe: string; // ISO UTC
  hash: string;
  auteur: string;
  role: string;
  // Bloc « champ : valeur » sous le titre (sans l'empreinte, imprimée au pied).
  informations: { champ: string; valeur: string }[];
  // Phrases en italique sous le bloc (limites du PDF...).
  mentionsEntete?: string[];
  // Limite du nombre de lignes imprimées : affichée dans l'en-tête ET au pied de
  // chaque page (ex. « PDF limité aux 1000 lignes les plus récentes sur 3200... »).
  mentionLimite?: string;
  // Mode tableau (colonnes + lignes) OU mode sections ; exactement l'un des deux.
  colonnes?: ColonnePdf[];
  lignes?: LignePdf[];
  sections?: SectionPdf[];
  qr: { image: Buffer; urlCourte: string };
  motsCles?: string[];
  // Réservé : désactivé par défaut et NON IMPLÉMENTÉ (voir config.ts). true => erreur.
  verrouiller?: boolean;
  // Diagnostic / tests : mesure TOUTES les cellules avec heightOfString (référence
  // de comparaison). Par défaut false : mesure évitée pour les textes d'une ligne.
  mesureExacte?: boolean;
  // Tests : false désactive la compression des flux pour pouvoir lire le texte du PDF.
  compresser?: boolean;
};

export type DiagnosticPdf = {
  nbLignes: number;
  nbCellulesRapides: number;
  nbCellulesMesurees: number;
  // Somme des hauteurs de ligne : doit être identique avec et sans mesure exacte.
  hauteurTotale: number;
  dureeMs: number;
};

export type ResultatPdf = { buffer: Buffer; nbPages: number; diagnostic: DiagnosticPdf };

const MARGE = 40;
const DEBUT_EN_TETE = 26;
const TAILLE_QR = 90;
const TAILLE_LOGO = 40;
const HAUTEUR_ENTETE_COLONNES = 18;
const TAILLE_TEXTE = 8;
const REMPLISSAGE_X = 4;
const REMPLISSAGE_Y = 3;
const LIGNES_MAX = 2;
const DEBUT_PAGES_SUIVANTES = 24;
const ZONE_PIED_BASE = 52;
const KPI_PAR_LIGNE = 4;
const HAUTEUR_LIGNE_KPI = 56;
// Marge de sécurité de la mesure rapide : un texte n'est jugé « d'une ligne » que s'il
// est plus étroit que la colonne d'au moins 0,5 pt.
const MARGE_MESURE_RAPIDE = 0.5;

function dessinerBandeau(doc: PDFKit.PDFDocument): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, 5).fill(COULEURS_PDF.or);
  doc.restore();
}

// Logo : soleil sombre sur carré doré plat (vectoriel, jamais d'image à charger,
// donc rien qui puisse échouer ni se dégrader).
function dessinerLogo(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x, y, TAILLE_LOGO, TAILLE_LOGO, 9).fill(COULEURS_PDF.or);
  doc.restore();
  const interieur = TAILLE_LOGO * 0.62;
  dessinerSoleil(doc, { x: x + (TAILLE_LOGO - interieur) / 2, y: y + (TAILLE_LOGO - interieur) / 2, taille: interieur, couleur: COULEURS_PDF.texte });
}

function texteCellule(v: string | number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

export async function genererPdfGabarit(p: ParametresGabaritPdf): Promise<ResultatPdf> {
  if (p.verrouiller ?? VERROUILLAGE_PDF_PAR_DEFAUT) {
    throw new Error("Le verrouillage du PDF n'est pas implémenté (ticket ultérieur).");
  }
  const modeSections = p.sections !== undefined;
  if (modeSections === (p.colonnes !== undefined) || (!modeSections && p.lignes === undefined)) {
    throw new Error("Le gabarit PDF attend soit `colonnes` + `lignes`, soit `sections`.");
  }
  const debutMs = performance.now();

  return new Promise<ResultatPdf>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: p.orientation === "paysage" ? "landscape" : "portrait",
      margin: MARGE,
      bufferPages: true,
      compress: p.compresser ?? true,
      lang: LANGUE_PDF,
      displayTitle: true,
      info: {
        Title: `${p.titre} - ${p.etablissement}`,
        Author: "Yelen224",
        Subject: `Référence ${p.reference}`,
        Keywords: [p.reference, p.hash, ...(p.motsCles ?? [])].join(", "),
        Creator: "Yelen224",
        Producer: "Yelen224",
        CreationDate: new Date(p.creeLe),
      },
    });
    const morceaux: Buffer[] = [];
    let nbPages = 0;
    const nbLignesTotal = modeSections
      ? (p.sections ?? []).reduce((s, sec) => s + (sec.type === "tableau" ? sec.lignes.length : 0), 0)
      : (p.lignes ?? []).length;
    const diagnostic: DiagnosticPdf = { nbLignes: nbLignesTotal, nbCellulesRapides: 0, nbCellulesMesurees: 0, hauteurTotale: 0, dureeMs: 0 };
    doc.on("data", (m: Buffer) => morceaux.push(m));
    doc.on("end", () => {
      diagnostic.dureeMs = Math.round(performance.now() - debutMs);
      resolve({ buffer: Buffer.concat(morceaux), nbPages, diagnostic });
    });
    doc.on("error", reject);

    const polices = chargerPolices(doc);
    const T = (texte: string | number | null | undefined) => polices.assainir(texteCellule(texte));
    const gauche = MARGE;
    const largeur = doc.page.width - 2 * MARGE;

    // Filigrane + bandeau sur CHAQUE page (avant tout contenu).
    installerFiligrane(doc, dessinerBandeau);

    // Zone de pied réservée : fixe + mentions non vides (limite, confidentialité,
    // juridique). Un texte vide ne réserve et n'affiche rien.
    const mentions = [p.mentionLimite ?? "", MENTION_CONFIDENTIALITE_EXPORT, TEXTE_JURIDIQUE_EXPORT]
      .map(s => s.trim()).filter(s => s.length > 0).map(T);
    doc.font(polices.regulier).fontSize(6.5);
    const hauteurMentions = mentions.reduce((h, m) => h + doc.heightOfString(m, { width: largeur }) + 2, 0);
    const zonePied = ZONE_PIED_BASE + hauteurMentions;
    const yMax = doc.page.height - zonePied - 6;

    // ── En-tête de la page 1 ────────────────────────────────────────────────
    const xQr = gauche + largeur - TAILLE_QR;
    doc.image(p.qr.image, xQr, DEBUT_EN_TETE, { width: TAILLE_QR, height: TAILLE_QR });
    doc.fillColor(COULEURS_PDF.attenue).font(polices.regulier).fontSize(6.5)
      .text("Vérifier ce document", xQr, DEBUT_EN_TETE + TAILLE_QR + 2, { width: TAILLE_QR, align: "center", lineBreak: false });

    dessinerLogo(doc, gauche, DEBUT_EN_TETE);
    doc.fillColor(COULEURS_PDF.texte).font(polices.gras).fontSize(17)
      .text("Yelen", gauche + 48, DEBUT_EN_TETE + 4, { lineBreak: false });
    doc.fillColor(COULEURS_PDF.or).font(polices.gras).fontSize(8)
      .text(T(p.titre).toUpperCase(), gauche + 48, DEBUT_EN_TETE + 24, { characterSpacing: 0.6, lineBreak: false });

    const largeurEntete = largeur - TAILLE_QR - 14;
    doc.fillColor(COULEURS_PDF.texte).font(polices.gras).fontSize(11)
      .text(T(p.etablissement), gauche, DEBUT_EN_TETE + TAILLE_LOGO + 10, { width: largeurEntete });
    doc.moveDown(0.3);
    for (const info of p.informations) {
      doc.fillColor(COULEURS_PDF.attenue).font(polices.regulier).fontSize(8.5)
        .text(`${T(info.champ)} : `, { continued: true, width: largeurEntete })
        .fillColor(COULEURS_PDF.texte).text(T(info.valeur), { width: largeurEntete });
    }
    for (const m of [...(p.mentionsEntete ?? []), ...(p.mentionLimite ? [p.mentionLimite] : [])]) {
      doc.moveDown(0.25);
      doc.fillColor(COULEURS_PDF.attenue).font(polices.italique).fontSize(7.5).text(T(m), { width: largeurEntete });
    }
    // Le séparateur ne coupe jamais le QR (en-tête court).
    doc.y = Math.max(doc.y + 6, DEBUT_EN_TETE + TAILLE_QR + 16);
    doc.moveTo(gauche, doc.y).lineTo(gauche + largeur, doc.y).strokeColor(COULEURS_PDF.or).lineWidth(1.2).stroke();

    // ── Corps : tableau ─────────────────────────────────────────────────────
    // Hauteur réellement avancée par pdfkit pour UNE ligne (interligne compris) :
    // c'est l'unité du plafond. (Mesurée avec currentLineHeight() sans interligne, le
    // plafond de 2 lignes ne laissait la place qu'à une seule : la 2e ligne était
    // remplacée par des points de suspension.)
    doc.font(polices.regulier).fontSize(TAILLE_TEXTE);
    const hauteurUneLigne = doc.currentLineHeight(true);
    const hauteurMaxCellule = hauteurUneLigne * LIGNES_MAX + 0.5;

    // Largeur exacte d'un texte au corps (police et taille du tableau), mise en cache :
    // les valeurs répétées (catégorie, niveau, cible, action...) ne sont calculées qu'une fois.
    const cacheLargeurs = new Map<string, number>();
    const largeurTexte = (t: string): number => {
      let w = cacheLargeurs.get(t);
      if (w === undefined) { w = doc.widthOfString(t); cacheLargeurs.set(t, w); }
      return w;
    };
    const exacte = p.mesureExacte === true;

    // Dessine un tableau à partir de `yDepart` (en-tête de colonnes, lignes zébrées,
    // en-tête répété à chaque saut de page) et renvoie la position y de fin.
    const dessinerTableau = (colonnes: ColonnePdf[], lignes: LignePdf[], yDepart: number, vide?: string): number => {
      const somme = colonnes.reduce((s, c) => s + c.fraction, 0) || 1;
      const largeurs = colonnes.map(c => (largeur * c.fraction) / somme);
      const positions = largeurs.map((_, i) => gauche + largeurs.slice(0, i).reduce((s, w) => s + w, 0));

      const dessinerEnteteColonnes = (y0: number): number => {
        doc.save();
        doc.rect(gauche, y0, largeur, HAUTEUR_ENTETE_COLONNES).fill(COULEURS_PDF.enteteTableau);
        doc.restore();
        doc.fillColor(COULEURS_PDF.attenue).font(polices.gras).fontSize(7);
        colonnes.forEach((c, i) => {
          doc.text(T(c.entete).toUpperCase(), positions[i] + REMPLISSAGE_X, y0 + 6, {
            width: largeurs[i] - 2 * REMPLISSAGE_X, align: c.align ?? "left", lineBreak: false, characterSpacing: 0.3,
          });
        });
        doc.moveTo(gauche, y0 + HAUTEUR_ENTETE_COLONNES).lineTo(gauche + largeur, y0 + HAUTEUR_ENTETE_COLONNES)
          .strokeColor(COULEURS_PDF.or).lineWidth(0.8).stroke();
        return y0 + HAUTEUR_ENTETE_COLONNES;
      };

      let y = dessinerEnteteColonnes(yDepart);
      if (lignes.length === 0) {
        doc.fillColor(COULEURS_PDF.attenue).font(polices.italique).fontSize(9)
          .text(T(vide ?? "Aucune entrée pour ces filtres."), gauche + REMPLISSAGE_X, y + 10, { width: largeur - 2 * REMPLISSAGE_X, lineBreak: false });
        return y + 28;
      }

      lignes.forEach((ligne, index) => {
        doc.font(polices.regulier).fontSize(TAILLE_TEXTE);
        const textes = colonnes.map(c => T(ligne[c.cle]) || "—");
        let hauteur = hauteurUneLigne;
        textes.forEach((t, j) => {
          const disponible = largeurs[j] - 2 * REMPLISSAGE_X;
          if (!exacte && !t.includes("\n") && largeurTexte(t) <= disponible - MARGE_MESURE_RAPIDE) {
            diagnostic.nbCellulesRapides++; // tient sur une ligne : hauteur d'une ligne
            return;
          }
          diagnostic.nbCellulesMesurees++;
          const h = doc.heightOfString(t, { width: disponible });
          if (h > hauteur) hauteur = h;
        });
        const hauteurLigne = Math.min(hauteur, hauteurMaxCellule) + 2 * REMPLISSAGE_Y;
        diagnostic.hauteurTotale += hauteurLigne;

        if (y + hauteurLigne > yMax) {
          doc.addPage(); // filigrane et bandeau posés par l'événement pageAdded
          y = dessinerEnteteColonnes(DEBUT_PAGES_SUIVANTES);
          doc.font(polices.regulier).fontSize(TAILLE_TEXTE);
        }
        if (index % 2 === 1) {
          doc.save();
          doc.rect(gauche, y, largeur, hauteurLigne).fill(COULEURS_PDF.zebre);
          doc.restore();
        }
        doc.fillColor(COULEURS_PDF.texte);
        textes.forEach((t, j) => {
          doc.text(t, positions[j] + REMPLISSAGE_X, y + REMPLISSAGE_Y, {
            width: largeurs[j] - 2 * REMPLISSAGE_X, height: hauteurMaxCellule, ellipsis: true, align: colonnes[j].align ?? "left",
          });
        });
        y += hauteurLigne;
        doc.moveTo(gauche, y).lineTo(gauche + largeur, y).strokeColor(COULEURS_PDF.bordure).lineWidth(0.4).stroke();
      });
      return y;
    };

    if (!modeSections) {
      dessinerTableau(p.colonnes ?? [], p.lignes ?? [], doc.y + 8);
    } else {
      // ── Corps : sections (rapports) ───────────────────────────────────────
      let y = doc.y + 14;
      const assurerPlace = (hauteur: number) => {
        if (y + hauteur > yMax) { doc.addPage(); y = DEBUT_PAGES_SUIVANTES; }
      };
      const titreSection = (titre: string) => {
        doc.fillColor(COULEURS_PDF.texte).font(polices.gras).fontSize(11).text(T(titre), gauche, y, { width: largeur, lineBreak: false });
        y += 18;
      };

      for (const section of p.sections ?? []) {
        if (section.type === "kpis") {
          const parLigne = Math.min(KPI_PAR_LIGNE, Math.max(1, section.items.length));
          const largeurCarte = largeur / parLigne;
          section.items.forEach((kpi, i) => {
            if (i % parLigne === 0) assurerPlace(HAUTEUR_LIGNE_KPI);
            const x = gauche + (i % parLigne) * largeurCarte;
            const couleurDetail = kpi.ton === "positif" ? COULEURS_PDF.positif : kpi.ton === "negatif" ? COULEURS_PDF.negatif : COULEURS_PDF.attenue;
            doc.fillColor(COULEURS_PDF.attenue).font(polices.gras).fontSize(8)
              .text(T(kpi.label).toUpperCase(), x, y, { width: largeurCarte - 10, lineBreak: false, characterSpacing: 0.3 });
            doc.fillColor(COULEURS_PDF.texte).font(polices.gras).fontSize(14)
              .text(T(kpi.valeur), x, y + 13, { width: largeurCarte - 10, lineBreak: false });
            if (kpi.detail) {
              doc.fillColor(couleurDetail).font(polices.gras).fontSize(8.5)
                .text(T(kpi.detail), x, y + 32, { width: largeurCarte - 10, lineBreak: false });
            }
            if (i % parLigne === parLigne - 1 || i === section.items.length - 1) y += HAUTEUR_LIGNE_KPI;
          });
          y += 4;
        } else if (section.type === "liste") {
          assurerPlace(60);
          titreSection(section.titre);
          for (const item of section.items) {
            doc.font(polices.regulier).fontSize(9);
            const texte = `•  ${T(item)}`;
            const h = doc.heightOfString(texte, { width: largeur });
            assurerPlace(h + 6);
            doc.fillColor(COULEURS_PDF.texte).text(texte, gauche, y, { width: largeur });
            y += h + 4;
          }
          y += 10;
        } else {
          assurerPlace(HAUTEUR_ENTETE_COLONNES + 3 * hauteurUneLigne + 24);
          titreSection(section.titre);
          y = dessinerTableau(section.colonnes, section.lignes, y, section.vide) + 14;
        }
      }
    }

    // ── Pied de CHAQUE page ─────────────────────────────────────────────────
    const phrase = `Document généré par Yelen224 le ${dateHeureCourte(p.creeLe)}, référence ${p.reference}, vérifiable via le QR code.`;
    const plage = doc.bufferedPageRange();
    nbPages = plage.count;
    for (let i = 0; i < plage.count; i++) {
      doc.switchToPage(plage.start + i);
      const margeBasse = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // sinon pdfkit ajoute une page en écrivant dans la marge
      const yPied = doc.page.height - zonePied;
      doc.moveTo(gauche, yPied).lineTo(gauche + largeur, yPied).strokeColor(COULEURS_PDF.bordure).lineWidth(0.5).stroke();
      doc.fillColor(COULEURS_PDF.attenue).font(polices.regulier).fontSize(7)
        .text(T(phrase), gauche, yPied + 5, { width: largeur, lineBreak: false });
      doc.fontSize(6.5)
        .text(`Empreinte SHA-256 : ${p.hash}`, gauche, yPied + 16, { width: largeur - 90, lineBreak: false })
        .text(`Page ${i + 1} sur ${plage.count}`, gauche, yPied + 16, { width: largeur, align: "right", lineBreak: false })
        .text(`Vérification : ${T(p.qr.urlCourte)}`, gauche, yPied + 26, { width: largeur, lineBreak: false });
      let yMention = yPied + 38;
      for (const m of mentions) {
        doc.text(m, gauche, yMention, { width: largeur });
        yMention += doc.heightOfString(m, { width: largeur }) + 2;
      }
      doc.page.margins.bottom = margeBasse;
    }
    doc.end();
  });
}
