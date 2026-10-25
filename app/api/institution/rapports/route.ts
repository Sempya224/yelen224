import { NextRequest } from "next/server";
import { livrerRapport } from "@/lib/export/rapportsExport";

// Export .xlsx — Executive Report Center. Enregistré, identifié (référence, empreinte)
// et livré par le module lib/export (voir lib/export/rapportsExport.ts) ; mêmes
// chiffres que l'écran et l'export PDF (calculerRapportExecutif).
export async function GET(req: NextRequest) {
  return livrerRapport(req, "xlsx");
}
