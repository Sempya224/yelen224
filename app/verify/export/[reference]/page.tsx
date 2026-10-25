import type { Metadata } from "next";
import { VerifyExportClient } from "./verify-export-client";

// Page publique de vérification d'un export (24/10/2026). Non indexée : la
// référence figure dans l'URL, l'empreinte arrive dans le fragment (#e=…) qui
// ne quitte jamais le navigateur.
export const metadata: Metadata = {
  title: "Vérification d'un document - Yelen224",
  description: "Vérifiez qu'une référence et une empreinte correspondent à un document enregistré par Yelen224.",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  let lisible = reference;
  try { lisible = decodeURIComponent(reference); } catch { /* conservé tel quel : la page le traitera comme non concordant */ }
  return <VerifyExportClient reference={lisible}/>;
}
