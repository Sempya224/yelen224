// Cœur de la vérification publique d'un export (24/10/2026) : fonction pure, les
// accès base et clé sont injectés (testable sans réseau).
//
// Vérifié = l'empreinte saisie est égale à `hash_contenu` (comparaison à temps
// constant) ET la signature HMAC stockée est valide pour ce hash avec la clé de
// sa version. Toute autre issue (entrée mal formée, référence inconnue, mauvaise
// empreinte, HMAC invalide) produit la MÊME réponse publique `{ verifie: false }` :
// la référence est séquentielle donc devinable, seule l'empreinte (256 bits) est
// secrète, et la réponse ne doit pas permettre de distinguer « inexistante » de
// « mauvaise empreinte ». La `raison` n'est destinée qu'aux journaux internes.
//
// Ce que cela prouve : qu'un export portant cette référence et cette empreinte a
// été enregistré par Yelen224. Pas que le contenu d'un fichier donné est resté
// inchangé (un PDF falsifié portant la vraie référence et la vraie empreinte
// serait « vérifié ») ; la vérification du contenu relève d'un autre ticket
// (téléversement du fichier pour recalcul).
import { timingSafeEqual } from "crypto";
import { dateHeureCourte } from "@/lib/heure";
import { verifierSignature } from "./signature";

export const REGEX_REFERENCE_EXPORT = /^YL-EXP-\d{4}-\d{8}$/;
export const REGEX_EMPREINTE = /^[0-9a-f]{64}$/i;

export const TEXTE_LIMITE_VERIFICATION =
  "Cette vérification confirme l'enregistrement du document par Yelen224. Elle ne garantit pas, à elle seule, que le contenu du fichier est resté inchangé.";

const LIBELLES_TYPE_EXPORT: Readonly<Record<string, string>> = {
  journal: "Journal d'activité",
  transactions: "Transactions",
  rapport_financier: "Rapport financier",
  rdv_passes: "RDV passés",
  rdv_accueil: "Rendez-vous de l'accueil",
  historique_financier: "Historique financier",
  paiements: "Paiements",
};
export function libelleTypeExport(type: string): string {
  return Object.prototype.hasOwnProperty.call(LIBELLES_TYPE_EXPORT, type) ? LIBELLES_TYPE_EXPORT[type] : "Export";
}

export type LigneExportPublique = {
  id: string;
  reference: string;
  type: string;
  institution_id: string;
  hash_contenu: string;
  signature_hmac: string;
  cle_version: number;
  nb_lignes: number;
  version_gabarit: string;
  cree_le: string;
};

export type DocumentVerifie = {
  reference: string;
  type: string;
  etablissement: string;
  date: string;
  nb_lignes: number;
  version_gabarit: string;
};

export type RaisonNonVerifie = "forme" | "introuvable" | "empreinte" | "signature";

export type ResultatVerification =
  | { verifie: true; document: DocumentVerifie; interne: { exportId: string; institutionId: string; typeCode: string } }
  | { verifie: false; raison: RaisonNonVerifie };

export type DependancesVerification = {
  charger: (reference: string) => Promise<LigneExportPublique | null>;
  // Lève ErreurCleSignature si la clé est absente, vide ou trop courte.
  lireCle: (version: number) => { cle: Buffer };
  nomEtablissement: (institutionId: string) => Promise<string | null>;
};

const HASH_FACTICE = "0".repeat(64);
const SIGNATURE_FACTICE = "0".repeat(64);

function egaliteHex(a: string, b: string): boolean {
  if (!REGEX_EMPREINTE.test(a) || !REGEX_EMPREINTE.test(b)) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase(), "hex"), Buffer.from(b.toLowerCase(), "hex"));
}

export async function verifierExportPublic(
  entree: { reference: unknown; empreinte: unknown },
  dep: DependancesVerification,
): Promise<ResultatVerification> {
  const { reference, empreinte } = entree;
  if (
    typeof reference !== "string" || typeof empreinte !== "string" ||
    !REGEX_REFERENCE_EXPORT.test(reference) || !REGEX_EMPREINTE.test(empreinte)
  ) {
    return { verifie: false, raison: "forme" };
  }

  const ligne = await dep.charger(reference);
  // Mêmes opérations (clé, comparaison, HMAC) que la référence existe ou non :
  // sur une référence inconnue, on compare à des valeurs factices.
  const { cle } = dep.lireCle(ligne?.cle_version ?? 1);
  const hashStocke = ligne?.hash_contenu ?? HASH_FACTICE;
  const hashOk = egaliteHex(empreinte, hashStocke);
  const signatureOk = verifierSignature(hashStocke, ligne?.signature_hmac ?? SIGNATURE_FACTICE, cle);

  if (!ligne) return { verifie: false, raison: "introuvable" };
  if (!hashOk) return { verifie: false, raison: "empreinte" };
  if (!signatureOk) return { verifie: false, raison: "signature" };

  const nom = await dep.nomEtablissement(ligne.institution_id);
  return {
    verifie: true,
    document: {
      reference: ligne.reference,
      type: libelleTypeExport(ligne.type),
      etablissement: nom ?? "Établissement",
      date: dateHeureCourte(ligne.cree_le),
      nb_lignes: ligne.nb_lignes,
      version_gabarit: ligne.version_gabarit,
    },
    interne: { exportId: ligne.id, institutionId: ligne.institution_id, typeCode: ligne.type },
  };
}

// Réponse publique : jamais la raison. Toute issue négative est identique.
export function reponsePublique(r: ResultatVerification): { verifie: false } | ({ verifie: true } & DocumentVerifie) {
  return r.verifie ? { verifie: true, ...r.document } : { verifie: false };
}
