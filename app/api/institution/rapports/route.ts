import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerFinanceAccueil } from "@/lib/financeAggregation";

// Export .xlsx — dépendance exceljs (Bryan exécute `npm install exceljs`,
// pas encore fait au moment de l'écriture de cette route). Réutilise les
// mêmes agrégations que l'Accueil financier (lib/financeAggregation.ts),
// pas de requête dupliquée.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rapports") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const finance = await calculerFinanceAccueil(membre.institutionId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yelen224";
  workbook.created = new Date();

  const resume = workbook.addWorksheet("Résumé");
  resume.columns = [
    { header: "Période", key: "periode", width: 18 },
    { header: "Montant encaissé (FCFA)", key: "encaisse", width: 22 },
    { header: "Paiements", key: "nb", width: 12 },
    { header: "En attente (FCFA)", key: "attente", width: 18 },
    { header: "Remboursé (FCFA)", key: "rembourse", width: 18 },
    { header: "Panier moyen (FCFA)", key: "panier", width: 18 },
  ];
  resume.getRow(1).font = { bold: true };
  (["aujourdhui", "semaine", "mois", "annee"] as const).forEach(p => {
    const s = finance[p];
    resume.addRow({
      periode: { aujourdhui: "Aujourd'hui", semaine: "Cette semaine", mois: "Ce mois", annee: "Cette année" }[p],
      encaisse: s.montant_encaisse, nb: s.nb_paiements, attente: s.montant_en_attente,
      rembourse: s.montant_rembourse, panier: s.panier_moyen,
    });
  });

  const services = workbook.addWorksheet("Top services");
  services.columns = [
    { header: "Service", key: "nom", width: 28 },
    { header: "Ventes", key: "nb", width: 12 },
    { header: "Montant (FCFA)", key: "montant", width: 18 },
  ];
  services.getRow(1).font = { bold: true };
  finance.top_services.forEach(s => services.addRow({ nom: s.nom, nb: s.nb, montant: s.montant }));

  const journalier = workbook.addWorksheet("Entrées journalières");
  journalier.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Montant (FCFA)", key: "montant", width: 18 },
  ];
  journalier.getRow(1).font = { bold: true };
  finance.graphique_journalier.forEach(p => journalier.addRow(p));

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rapport-financier-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
