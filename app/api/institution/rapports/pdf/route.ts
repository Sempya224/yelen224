import { NextRequest } from "next/server";
import { livrerRapport } from "@/lib/export/rapportsExport";

// Export PDF du Rapport financier exécutif. Gabarit commun (lib/export/pdf, mode
// « sections »), enregistré et identifié par le module lib/export. lib/rapportsPdf.ts
// n'est plus appelé ici.
export async function GET(req: NextRequest) {
  return livrerRapport(req, "pdf");
}
