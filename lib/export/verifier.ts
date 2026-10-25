// Vérification d'un export à partir de son enveloppe canonique (module d'export
// commun, 24/10/2026) : recalcule l'empreinte, la compare à celle enregistrée,
// puis contrôle la signature HMAC avec la version de clé d'origine.
import { calculerHashContenu, type EnveloppeExport } from "./canonique";
import { lireCleSignature, verifierSignature } from "./signature";

export type ResultatVerification = {
  // L'empreinte recalculée depuis le contenu est égale à celle enregistrée.
  hashCorrespond: boolean;
  // La signature enregistrée est valide pour l'empreinte enregistrée avec la
  // clé de cette version (false aussi si la signature est mal formée).
  signatureValide: boolean;
  // Les deux : le contenu fourni est exactement celui qui a été signé.
  authentique: boolean;
};

export function verifierEnveloppe(
  env: EnveloppeExport,
  enregistre: { hash_contenu: string; signature_hmac: string; cle_version: number },
): ResultatVerification {
  const { cle } = lireCleSignature(enregistre.cle_version);
  const hashCorrespond = calculerHashContenu(env) === enregistre.hash_contenu;
  const signatureValide = verifierSignature(enregistre.hash_contenu, enregistre.signature_hmac, cle);
  return { hashCorrespond, signatureValide, authentique: hashCorrespond && signatureValide };
}
