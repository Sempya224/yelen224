// Signature des exports (module d'export commun, 24/10/2026) : HMAC-SHA256 de
// l'empreinte du contenu canonique, avec une clé serveur.
//
// La clé n'est lue QU'À L'USAGE (jamais à l'import : un build sans la variable
// ne doit pas casser) et il n'existe volontairement AUCUNE valeur par défaut ni
// repli sur une autre clé : une signature produite avec une clé vide ou devinable
// serait pire que pas de signature. Contrairement à `new TextEncoder().encode(
// process.env.X!)` (lib/adminAuth.ts), qui produit une clé VIDE sans erreur si
// la variable est absente, une variable manquante lève ici une erreur explicite.
// Les messages d'erreur citent le NOM de la variable, jamais sa valeur.
import { createHmac, timingSafeEqual } from "crypto";

// Version courante de la clé : stockée dans exports.cle_version. 1 =
// EXPORT_SIGNING_SECRET, n ≥ 2 = EXPORT_SIGNING_SECRET_V{n} — permet de
// renouveler la clé sans invalider les signatures déjà émises.
export const CLE_VERSION_COURANTE = 1;
export const LONGUEUR_MINIMALE_CLE = 32;

const HEX_SHA256 = /^[0-9a-f]{64}$/;

export class ErreurCleSignature extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurCleSignature";
  }
}

function nomVariable(version: number): string {
  if (!Number.isInteger(version) || version < 1) throw new ErreurCleSignature("Version de clé de signature invalide.");
  return version === 1 ? "EXPORT_SIGNING_SECRET" : `EXPORT_SIGNING_SECRET_V${version}`;
}

export function lireCleSignature(version: number = CLE_VERSION_COURANTE): { cle: Buffer; version: number } {
  const nom = nomVariable(version);
  const brute = process.env[nom];
  if (brute === undefined) throw new ErreurCleSignature(`La variable d'environnement ${nom} est absente.`);
  // Les espaces en début/fin (retour à la ligne collé avec la valeur, très
  // fréquent) sont retirés : sans cela deux environnements pourraient dériver
  // une clé différente pour le même secret.
  const valeur = brute.trim();
  if (valeur.length === 0) throw new ErreurCleSignature(`La variable d'environnement ${nom} est vide.`);
  if (valeur.length < LONGUEUR_MINIMALE_CLE) {
    throw new ErreurCleSignature(`La variable d'environnement ${nom} est trop courte (minimum ${LONGUEUR_MINIMALE_CLE} caractères).`);
  }
  return { cle: Buffer.from(valeur, "utf8"), version };
}

// HMAC-SHA256 (hex) de l'empreinte du contenu.
export function signerHash(hash: string, cle: Buffer): string {
  if (!HEX_SHA256.test(hash)) throw new ErreurCleSignature("Empreinte invalide : SHA-256 hexadécimal attendu.");
  return createHmac("sha256", cle).update(hash, "utf8").digest("hex");
}

// Comparaison à temps constant. Une signature mal formée renvoie false (jamais
// d'exception : l'appelant est typiquement une route de vérification publique).
export function verifierSignature(hash: string, signature: string, cle: Buffer): boolean {
  if (!HEX_SHA256.test(hash)) return false;
  const candidate = signature.toLowerCase();
  if (!HEX_SHA256.test(candidate)) return false;
  const attendue = Buffer.from(signerHash(hash, cle), "hex");
  const recue = Buffer.from(candidate, "hex");
  return attendue.length === recue.length && timingSafeEqual(attendue, recue);
}
