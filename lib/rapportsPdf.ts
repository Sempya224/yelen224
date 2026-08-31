import PDFDocument from "pdfkit";
import type { RapportExecutif } from "./rapportsAggregation";
import { DEVISE_LABEL } from "./devise";

// PDF du Rapport exécutif (instruction #10, refonte niveau US) — même
// convention de couleurs/police que lib/recuPdf.ts (gold/dark/muted/green/
// red), pas de logo image ici (un en-tête texte est standard pour un
// rapport financier, contrairement au reçu qui est un document légal remis
// au citoyen). Regroupement de milliers par espace ASCII manuel — jamais
// toLocaleString ici, pdfkit ne supporte pas le séparateur U+202F qu'il
// produit (WinAnsiEncoding des polices standard).
const GOLD = "#F5A623";
const DARK = "#111111";
const MUTED = "#6C6C70";
const GREEN = "#1DAA61";
const RED = "#D64545";

function formatPrix(p: number): string {
  const entier = Math.round(p).toString();
  const avecEspaces = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return avecEspaces + " " + DEVISE_LABEL;
}

function formatPct(p: number | null): string {
  if (p === null) return "—";
  return (p >= 0 ? "+" : "") + p + "%";
}

function couleurDelta(p: number | null): string {
  if (p === null) return MUTED;
  return p >= 0 ? GREEN : RED;
}

function assurerPlace(doc: PDFKit.PDFDocument, hauteurNecessaire: number) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - hauteurNecessaire) doc.addPage();
}

export async function genererRapportPdf(rapport: RapportExecutif, institutionNom: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ── En-tête ──
    doc.fillColor(GOLD).fontSize(10).font("Helvetica-Bold").text("YELEN224", { characterSpacing: 1 });
    doc.fillColor(DARK).fontSize(19).font("Helvetica-Bold").text("Rapport financier exécutif");
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text(institutionNom);
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(
      `Généré le ${new Date(rapport.genere_le).toLocaleString("fr-FR")} — toutes les données proviennent de l'activité réelle de Yelen.`
    );
    doc.moveDown(0.6);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor(GOLD).lineWidth(1.4).stroke();
    doc.moveDown(0.8);

    // ── KPI ──
    const kpis: { label: string; k: keyof RapportExecutif["kpi"] }[] = [
      { label: "Aujourd'hui", k: "aujourdhui" },
      { label: "Cette semaine", k: "semaine" },
      { label: "Ce mois", k: "mois" },
      { label: "Cette année", k: "annee" },
    ];
    const colW = pageW / 4;
    const kpiY = doc.y;
    kpis.forEach((item, i) => {
      const x = doc.page.margins.left + i * colW;
      const v = rapport.kpi[item.k];
      doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text(item.label.toUpperCase(), x, kpiY, { width: colW - 10, characterSpacing: 0.3 });
      doc.fillColor(DARK).fontSize(14).font("Helvetica-Bold").text(formatPrix(v.montant), x, kpiY + 13, { width: colW - 10 });
      doc.fillColor(couleurDelta(v.delta)).fontSize(8.5).font("Helvetica-Bold").text(
        `${formatPct(v.delta)} · ${v.nb} vente${v.nb > 1 ? "s" : ""}`, x, kpiY + 32, { width: colW - 10 }
      );
    });
    doc.y = kpiY + 54;
    doc.moveDown(0.8);

    // ── Résumé ──
    assurerPlace(doc, 90);
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Résumé");
    doc.moveDown(0.3);
    rapport.resume.forEach(ligne => {
      assurerPlace(doc, 20);
      doc.fillColor(DARK).fontSize(9).font("Helvetica").text(`•  ${ligne}`, { width: pageW });
      doc.moveDown(0.15);
    });
    doc.moveDown(0.6);

    // ── Top services ──
    assurerPlace(doc, 120);
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Top services (cette année)");
    doc.moveDown(0.4);
    if (rapport.top_services.length === 0) {
      doc.fillColor(MUTED).fontSize(9).font("Helvetica").text("Aucune donnée pour le moment.");
    } else {
      const cols = [
        { label: "SERVICE", w: 0.28 },
        { label: "CATÉGORIE", w: 0.18 },
        { label: "VENTES", w: 0.1 },
        { label: "CA", w: 0.18 },
        { label: "ÉVOLUTION", w: 0.13 },
        { label: "PART DU CA", w: 0.13 },
      ];
      let x0 = doc.page.margins.left;
      const rowY0 = doc.y;
      cols.forEach(c => {
        doc.fillColor(MUTED).fontSize(7.5).font("Helvetica-Bold").text(c.label, x0, rowY0, { width: c.w * pageW, characterSpacing: 0.3 });
        x0 += c.w * pageW;
      });
      doc.y = rowY0 + 12;
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor("#DDDDDD").lineWidth(0.6).stroke();
      doc.moveDown(0.3);

      rapport.top_services.forEach(s => {
        assurerPlace(doc, 20);
        let x = doc.page.margins.left;
        const rowY = doc.y;
        const vals = [
          s.nom, s.categorie, String(s.nb), formatPrix(s.montant), formatPct(s.delta),
          s.partCA + "%",
        ];
        cols.forEach((c, i) => {
          doc.fillColor(i === 4 ? couleurDelta(s.delta) : DARK).fontSize(8.5).font(i === 0 ? "Helvetica-Bold" : "Helvetica").text(vals[i], x, rowY, { width: c.w * pageW - 4 });
          x += c.w * pageW;
        });
        doc.y = rowY + 14;
      });
    }
    doc.moveDown(0.6);

    // ── Répartition par catégorie ──
    assurerPlace(doc, 100);
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Répartition des revenus par catégorie");
    doc.moveDown(0.4);
    if (rapport.repartition_categories.length === 0) {
      doc.fillColor(MUTED).fontSize(9).font("Helvetica").text("Aucune donnée pour le moment.");
    } else {
      rapport.repartition_categories.forEach(c => {
        assurerPlace(doc, 16);
        const rowY = doc.y;
        doc.fillColor(DARK).fontSize(9).font("Helvetica").text(c.categorie, doc.page.margins.left, rowY, { width: pageW * 0.55 });
        doc.fillColor(MUTED).fontSize(9).font("Helvetica-Bold").text(`${formatPrix(c.montant)}  ·  ${c.pct}%`, doc.page.margins.left + pageW * 0.55, rowY, { width: pageW * 0.45, align: "right" });
        doc.y = rowY + 14;
      });
    }

    // ── Pied de page (chaque page) ──
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(
        `Yelen224 — Rapport généré automatiquement, usage interne — page ${i + 1}/${pages.count}`,
        doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 10,
        { width: pageW, align: "center" }
      );
    }

    doc.end();
  });
}
