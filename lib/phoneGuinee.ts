// Validation centralisée des numéros de téléphone mobiles guinéens (+224).
//
// Source de base des préfixes : Autorité de Régulation des Postes et
// Télécommunications (ARPT, Conakry), communication officielle du
// 08/01/2020 relayée par l'UIT (plan de numérotation national fermé à 9
// chiffres) : https://www.itu.int/dms_pub/itu-t/oth/02/02/T020200005B0002PDFE.pdf
// Les blocs 60/61/63/64/67/68/69 et 20-29 y étaient réservés au service GSM
// mais non attribués à un opérateur actif (Intercel/Sotelgui, actifs
// jusqu'en 2013, n'apparaissent plus dans ce tableau 2020).
//
// Mise à jour du 14/08/2026 (confirmée par Bryan, terrain Guinée) : Orange
// Guinée a depuis ouvert le bloc 610-619 (auparavant réservé/non attribué),
// portant sa plage totale à 610-629. Corroboré indépendamment par le compte
// X officiel Orange Guinée (annonce du préfixe 610,
// https://x.com/orangeguinee_gn/status/1314143766924623872) et par Libon
// (filiale Orange), qui liste déjà 610 et 611 pour Orange Guinée Conakry
// (https://help.libon.com/en/articles/196508-orange-guinea-conakry-dialling-prefixes).
// MTN/Cellcom non revérifiés à cette date — toujours vérifier une source
// récente avant d'étendre encore cette liste.
//
// Ce fichier ne valide QUE le format (indicatif, longueur, préfixe,
// caractères) — jamais l'existence réelle d'un numéro, qui ne peut être
// confirmée que par l'OTP/SMS. Ne jamais faire dire à ce module "ce numéro
// existe", seulement "ce numéro est structurellement plausible en Guinée".
export const PREFIXES_GUINEE: Record<"orange" | "mtn" | "cellcom", string[]> = {
  orange:  ["610", "611", "612", "613", "614", "615", "616", "617", "618", "619", "620", "621", "622", "623", "624", "625", "626", "627", "628", "629"],
  mtn:     ["660", "661", "662", "664", "666", "668"],
  cellcom: ["653", "654", "655", "656", "657"],
};

const TOUS_PREFIXES_GUINEE = new Set(Object.values(PREFIXES_GUINEE).flat());

export type PhoneValidationCode = "valide" | "incomplet" | "prefixe_inconnu" | "caracteres_invalides";

export type PhoneValidationResult = {
  code: PhoneValidationCode;
  valide: boolean;
  // null si le champ est vide (rien à afficher tant que l'utilisateur n'a
  // rien tapé) ou si le numéro est valide.
  message: string | null;
};

// Filtre la saisie en direct (onChange) : ne garde que chiffres et espaces,
// pour l'affichage pendant la frappe.
export function filtrerSaisiePhone(raw: string): string {
  return raw.replace(/[^\d\s]/g, "");
}

// Normalise une saisie vers les chiffres significatifs : retire
// espaces/tirets, puis un unique "0" initial toléré (habitude locale de
// saisie, ex. 0620000000) — un numéro commençant par "00" reste tel quel,
// la validation de préfixe/longueur l'invalidera naturellement.
export function normaliserChiffresPhone(raw: string): string {
  const sansEspaces = raw.replace(/[\s\-]/g, "");
  if (!/^\d*$/.test(sansEspaces)) return sansEspaces;
  return sansEspaces.replace(/^0/, "");
}

export function prefixeGuineeValide(neufChiffres: string): boolean {
  return TOUS_PREFIXES_GUINEE.has(neufChiffres.slice(0, 3));
}

// Validation 1 — FORMAT uniquement. Prend une saisie brute (avec espaces
// éventuels), retourne un code + message prêt à afficher sous le champ.
// Le préfixe est vérifié dès 3 chiffres saisis (retour anticipé), pas
// seulement une fois les 9 chiffres complets — pour un feedback pendant la
// frappe et pas seulement à la soumission.
export function validerFormatPhoneGuinee(rawInput: string): PhoneValidationResult {
  const sansEspaces = rawInput.replace(/[\s\-]/g, "");
  if (sansEspaces.length === 0) return { code: "incomplet", valide: false, message: null };
  if (!/^\d+$/.test(sansEspaces)) {
    return { code: "caracteres_invalides", valide: false, message: "Format de numéro invalide." };
  }

  const chiffres = normaliserChiffresPhone(sansEspaces);
  if (chiffres.length > 9) {
    return { code: "caracteres_invalides", valide: false, message: "Format de numéro invalide." };
  }
  if (chiffres.length >= 3 && !prefixeGuineeValide(chiffres)) {
    return { code: "prefixe_inconnu", valide: false, message: "Ce préfixe téléphonique n'est pas reconnu en Guinée." };
  }
  if (chiffres.length < 9) {
    return { code: "incomplet", valide: false, message: "Entrez un numéro guinéen complet." };
  }
  return { code: "valide", valide: true, message: null };
}

// Construit le numéro complet +224XXXXXXXXX à partir des 9 chiffres normalisés.
export function versE164Guinee(neufChiffres: string): string {
  return `+224${neufChiffres}`;
}

// Masque un numéro pour l'affichage (écrans OTP/vérification) — un numéro
// complet à l'écran n'a aucune utilité pour le citoyen à cette étape
// (regard par-dessus l'épaule, capture d'écran) et n'est là que pour lui
// confirmer que c'est bien SON numéro. Même convention/format que
// app/institution/inscription/engine/steps/VerificationStep.tsx::maskPhone
// (garde les 2 premiers + 4 derniers chiffres), reprise ici pour les écrans
// citoyen (login/inscription) plutôt que dupliquée une 2e fois.
export function masquerPhoneGuinee(neufChiffres: string): string {
  return `+224${neufChiffres}`.replace(/(\+224)(\d{2})(\d{3})(\d{4})/, "$1 $2•••$4");
}

// Validation stricte côté serveur d'un numéro déjà au format +224XXXXXXXXX —
// remplace la regex /^\+224\d{8,9}$/ dupliquée dans les routes API.
// Strictement 9 chiffres (décision Bryan 14/08/2026, aucune tolérance à 8
// chiffres — jamais exercée par un écran réel de toute façon) + préfixe
// vérifié contre le plan ARPT.
export function estE164GuineeValide(phone: string): boolean {
  const m = /^\+224(\d{9})$/.exec(phone);
  if (!m) return false;
  return prefixeGuineeValide(m[1]);
}
