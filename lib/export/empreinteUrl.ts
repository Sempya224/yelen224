// Empreinte dans l'URL de vérification et construction des liens (module
// d'export commun, 24/10/2026). Fichier volontairement SANS import Node
// (`crypto`, `Buffer`) : il est utilisé côté navigateur (page de vérification)
// comme côté serveur (QR du PDF). Conversion hex ↔ base64url avec btoa/atob.
//
// Le QR encode `{base}/verify/export/{référence}#e={empreinte en base64url}`.
// Le fragment (après `#`) n'est jamais envoyé au serveur ni écrit dans ses
// journaux : la page le lit côté navigateur, lance la vérification, puis l'efface
// de la barre d'adresse. 43 caractères base64url au lieu de 64 hexadécimaux : un
// QR moins dense, donc plus facile à scanner.

export function hexVersBase64url(hex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Empreinte invalide : SHA-256 hexadécimal attendu.");
  let binaire = "";
  for (let i = 0; i < 64; i += 2) binaire += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// null si la valeur n'est pas exactement une empreinte SHA-256 en base64url.
export function base64urlVersHex(valeur: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(valeur)) return null;
  let binaire: string;
  try {
    binaire = atob(`${valeur.replace(/-/g, "+").replace(/_/g, "/")}=`);
  } catch {
    return null;
  }
  if (binaire.length !== 32) return null;
  let hex = "";
  for (let i = 0; i < binaire.length; i++) hex += binaire.charCodeAt(i).toString(16).padStart(2, "0");
  return hex;
}

// Base publique : NEXT_PUBLIC_APP_URL, à défaut l'origine de la requête
// (`viaEnv: false` permet à l'appelant de le signaler : en préversion, le QR
// pointerait vers l'URL de la préversion).
export function baseUrlApplication(origineRequete: string): { base: string; viaEnv: boolean } {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return env ? { base: env.replace(/\/$/, ""), viaEnv: true } : { base: origineRequete.replace(/\/$/, ""), viaEnv: false };
}

export function urlVerificationExport(base: string, reference: string): string {
  return `${base}/verify/export/${encodeURIComponent(reference)}`;
}

export function urlVerificationExportAvecEmpreinte(base: string, reference: string, hashHex: string): string {
  return `${urlVerificationExport(base, reference)}#e=${hexVersBase64url(hashHex)}`;
}
