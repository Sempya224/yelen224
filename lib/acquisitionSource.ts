// Sources d'acquisition Yelen-native (Centre d'Analyse → Acquisition,
// brief CEO §15) — distinct de lib/canalAcquisition.ts qui classe le
// Referer HTTP des pages offres (Google/réseaux sociaux/site web), un
// concept externe différent. Ici on cherche par QUEL parcours Yelen le
// citoyen a atteint la fiche (recherche interne, à proximité, QR,
// Community, etc.), pas d'où vient son navigateur.
export type AcquisitionSource =
  | "yelen_search" | "nearby" | "qr_code" | "community" | "announcement"
  | "share" | "external" | "direct" | "unknown";

export const ACQUISITION_SOURCE_LABELS: Record<AcquisitionSource, string> = {
  yelen_search: "Recherche Yelen",
  nearby: "À proximité",
  qr_code: "QR Code",
  community: "Yelen Community",
  announcement: "Annonce établissement",
  share: "Partage",
  external: "Lien externe",
  direct: "Accès direct",
  unknown: "Autre",
};

const SOURCES_VALIDES: AcquisitionSource[] = [
  "yelen_search", "nearby", "qr_code", "community", "announcement", "share", "external", "direct", "unknown",
];

// Un seul paramètre `?source=` couvre toutes les valeurs Yelen-native
// (qr_code compris — le QR pointait déjà vers `?source=qr` avant ce
// chantier, voir InstitutionPublicClient.tsx, valeur conservée en alias
// pour ne jamais casser les QR déjà imprimés).
const ALIAS_PARAM: Record<string, AcquisitionSource> = { qr: "qr_code" };

function normaliserParam(sourceParam: string | null): AcquisitionSource | null {
  if (!sourceParam) return null;
  if (ALIAS_PARAM[sourceParam]) return ALIAS_PARAM[sourceParam];
  return (SOURCES_VALIDES as string[]).includes(sourceParam) ? (sourceParam as AcquisitionSource) : null;
}

// Priorité au paramètre explicite posé par le point d'entrée (Lot C).
// Sans paramètre : repli sur le Referer, même esprit que
// canalAcquisition.ts::detecterCanal — hôte Yelen ou absent = direct
// (app installée / navigation directe / lien partagé dont le client
// masque le referer), hôte externe reconnu = external.
export function detecterSourceAcquisition(sourceParam: string | null, refererUrl: string | null, appUrl: string): AcquisitionSource {
  const parNom = normaliserParam(sourceParam);
  if (parNom) return parNom;
  if (!refererUrl) return "direct";
  try {
    const host = new URL(refererUrl).hostname.toLowerCase();
    const appHost = new URL(appUrl).hostname.toLowerCase();
    if (host === appHost || host.endsWith(`.${appHost}`)) return "direct";
    return "external";
  } catch {
    return "unknown";
  }
}
