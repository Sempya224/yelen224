// Helpers PURS de l'écran Services (Lot 1b) : duplication et messages d'erreur.
// Aucun React, aucun accès réseau.

const NOM_MAX = 120;
const SUFFIXE_COPIE = /\s*\(copie(?: \d+)?\)\s*$/i;

// Nom d'une copie : retire les suffixes « (copie) » / « (copie N) » déjà
// présents (jamais « (copie) (copie) »), puis ajoute « (copie) » ou, si ce nom
// existe déjà, « (copie 2) », « (copie 3 »… Le nom de base est tronqué pour
// rester dans la limite de 120 caractères de l'API.
export function nomCopie(nom: string, nomsExistants: readonly string[]): string {
  let base = nom.trim();
  while (SUFFIXE_COPIE.test(base)) base = base.replace(SUFFIXE_COPIE, "").trim();
  if (base === "") base = "Service";
  const pris = new Set(nomsExistants.map(n => n.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const suffixe = n === 1 ? " (copie)" : ` (copie ${n})`;
    const candidat = base.slice(0, NOM_MAX - suffixe.length).trim() + suffixe;
    if (!pris.has(candidat.toLowerCase())) return candidat;
  }
}

// Une description qui est en réalité un message d'erreur collé (« Erreur :
// new row violates row-level security… ») ne doit jamais être recopiée.
export function descriptionRecopiable(description: string | null | undefined): string | null {
  if (typeof description !== "string") return null;
  const t = description.trim();
  if (t === "") return null;
  if (/^erreur\s*:/i.test(t) || /violates row-level security|violates .* constraint|duplicate key value/i.test(t)) return null;
  return t;
}

// Message affiché dans un toast : le message français du serveur (`error`) s'il
// existe, sinon le repli fourni. Jamais de préfixe « Erreur : ».
export function messageErreurApi(corps: unknown, repli: string): string {
  if (corps && typeof corps === "object") {
    const e = (corps as { error?: unknown }).error;
    if (typeof e === "string" && e.trim() !== "") return e.trim();
  }
  return repli;
}
