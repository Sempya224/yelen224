import { NextRequest } from "next/server";
import { livrerExportEcran } from "@/lib/export/ecransExport";

// Export CSV serveur des écrans « Paiements » et « Historique financier ». Le navigateur
// envoie les identifiants des lignes affichées ; voir lib/export/ecransExport.ts.
export async function POST(req: NextRequest) {
  return livrerExportEcran(req, ["paiements", "historique_financier"]);
}
