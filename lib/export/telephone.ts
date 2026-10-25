// Téléphones et noms de clients dans les exports de données (24/10/2026). Fonctions
// pures. Le masque est appliqué AVANT le calcul du contenu signé : le document signé
// contient la valeur masquée, comme l'IP du Journal pour les rôles sans le droit.

// « +224612345678 » → « +224 ******* 78 » : l'indicatif éventuel (+ et chiffres de tête
// jusqu'au 4e caractère) est conservé, les chiffres du numéro sont remplacés par des
// astérisques sauf les deux derniers. Valeur vide → chaîne vide. Moins de 3 chiffres :
// tout est masqué.
export function masquerTelephone(telephone: string | null | undefined): string {
  const brut = (telephone ?? "").replace(/[\s.\-()]/g, "");
  if (brut === "") return "";
  const indicatif = brut.startsWith("+") ? brut.slice(0, 4) : "";
  const national = (indicatif ? brut.slice(4) : brut).replace(/\D/g, "");
  if (national.length < 3) return `${indicatif ? `${indicatif} ` : ""}${"*".repeat(Math.max(national.length, 1))}`.trim();
  const debut = indicatif ? `${indicatif} ` : "";
  return `${debut}${"*".repeat(national.length - 2)} ${national.slice(-2)}`;
}

export function telephoneExporte(telephone: string | null | undefined, clair: boolean): string {
  return clair ? (telephone ?? "") : masquerTelephone(telephone);
}

// Nom d'un client pour l'export : prénom + nom, sinon le repli donné (« Client » ou
// « Citoyen » selon l'écran). JAMAIS le numéro de téléphone, contrairement au repli
// des routes de liste (buildNom) qui alimentent les écrans.
export function nomClientPourExport(
  u: { prenom: string | null; nom: string | null } | null | undefined, repli: "Client" | "Citoyen",
): string {
  if (!u) return repli;
  return [u.prenom, u.nom].filter(Boolean).join(" ") || repli;
}
