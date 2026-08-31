import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerRapportExecutif } from "@/lib/rapportsAggregation";
import { DEVISE_LABEL } from "@/lib/devise";

// Export .xlsx — Executive Report Center (refonte niveau US, instruction
// #10, 06/08/2026). Réutilise calculerRapportExecutif (lib/rapportsAggregation.ts),
// même source que l'écran et l'export PDF — jamais de requête dupliquée ni
// de chiffre recalculé différemment d'un format à l'autre.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rapports") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const rapport = await calculerRapportExecutif(membre.institutionId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yelen224";
  workbook.created = new Date();

  const resume = workbook.addWorksheet("Résumé");
  resume.columns = [
    { header: "Période", key: "periode", width: 18 },
    { header: `Montant (${DEVISE_LABEL})`, key: "montant", width: 20 },
    { header: "Ventes", key: "nb", width: 12 },
    { header: "Évolution vs période précédente", key: "delta", width: 28 },
  ];
  resume.getRow(1).font = { bold: true };
  (["aujourdhui", "semaine", "mois", "annee"] as const).forEach(p => {
    const k = rapport.kpi[p];
    resume.addRow({
      periode: { aujourdhui: "Aujourd'hui", semaine: "Cette semaine", mois: "Ce mois", annee: "Cette année" }[p],
      montant: k.montant, nb: k.nb,
      delta: k.delta === null ? "—" : `${k.delta >= 0 ? "+" : ""}${k.delta}%`,
    });
  });
  resume.addRow([]);
  resume.addRow(["Synthèse"]);
  rapport.resume.forEach(ligne => resume.addRow([ligne]));

  const services = workbook.addWorksheet("Top services");
  services.columns = [
    { header: "Service", key: "nom", width: 28 },
    { header: "Catégorie", key: "categorie", width: 20 },
    { header: "Ventes", key: "nb", width: 10 },
    { header: `CA (${DEVISE_LABEL})`, key: "montant", width: 18 },
    { header: "Évolution vs an. préc.", key: "delta", width: 20 },
    { header: "Part du CA", key: "part", width: 12 },
    { header: "Durée (min)", key: "duree", width: 12 },
  ];
  services.getRow(1).font = { bold: true };
  rapport.top_services.forEach(s => services.addRow({
    nom: s.nom, categorie: s.categorie, nb: s.nb, montant: s.montant,
    delta: s.delta === null ? "—" : `${s.delta >= 0 ? "+" : ""}${s.delta}%`,
    part: `${s.partCA}%`, duree: s.dureeMinutes ?? "—",
  }));

  const categories = workbook.addWorksheet("Répartition catégories");
  categories.columns = [
    { header: "Catégorie", key: "categorie", width: 24 },
    { header: `Montant (${DEVISE_LABEL})`, key: "montant", width: 20 },
    { header: "Part du CA", key: "pct", width: 12 },
  ];
  categories.getRow(1).font = { bold: true };
  rapport.repartition_categories.forEach(c => categories.addRow({ categorie: c.categorie, montant: c.montant, pct: `${c.pct}%` }));

  const evolutionAnnee = workbook.addWorksheet("Évolution mensuelle");
  evolutionAnnee.columns = [
    { header: "Mois", key: "label", width: 12 },
    { header: `Montant (${DEVISE_LABEL})`, key: "montant", width: 18 },
    { header: "Ventes", key: "ventes", width: 10 },
  ];
  evolutionAnnee.getRow(1).font = { bold: true };
  rapport.evolution.annee.forEach(p => evolutionAnnee.addRow(p));

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rapport-financier-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
