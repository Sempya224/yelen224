// QR de vérification d'un export (24/10/2026), partagé par les exports PDF. Encode
// `{base}/verify/export/{référence}#e={empreinte en base64url}` ; le fragment ne
// quitte jamais le navigateur de la personne qui scanne. Base : NEXT_PUBLIC_APP_URL,
// à défaut l'origine de la requête (en préversion, le QR pointerait alors vers l'URL
// de la préversion : un avertissement est écrit dans les logs du serveur).
import QRCode from "qrcode";
import { baseUrlApplication, urlVerificationExport, urlVerificationExportAvecEmpreinte } from "./empreinteUrl";

export async function genererQrVerification(
  origineRequete: string, reference: string, hashHex: string, etiquetteLog: string,
): Promise<{ image: Buffer; urlCourte: string }> {
  const { base, viaEnv } = baseUrlApplication(origineRequete);
  if (!viaEnv) console.warn(`[${etiquetteLog}] NEXT_PUBLIC_APP_URL absente : le QR du PDF utilise l'origine de la requête.`);
  const image = await QRCode.toBuffer(urlVerificationExportAvecEmpreinte(base, reference, hashHex), { width: 360, margin: 1, errorCorrectionLevel: "M" });
  return { image, urlCourte: urlVerificationExport(base, reference) };
}
