// Lecture d'une liste d'identifiants par PAQUETS (24/10/2026). Une liste de plusieurs
// centaines d'UUID passée à `.in()` dépasse la longueur d'URL acceptée par l'API : la
// requête échoue (souvent sans bruit côté appelant). Pure : l'accès base est injecté.
// Les paquets sont lus par groupes concurrents limités ; l'ordre des résultats suit
// celui des paquets, sans doublon d'identifiants en entrée.
export const TAILLE_PAQUET_IDENTIFIANTS = 100;
const PAQUETS_CONCURRENTS = 4;

export async function lirePaquets<T>(
  identifiants: string[],
  lirePaquet: (paquet: string[]) => Promise<T[]>,
  taille: number = TAILLE_PAQUET_IDENTIFIANTS,
): Promise<T[]> {
  const uniques = [...new Set(identifiants)];
  const paquets: string[][] = [];
  for (let i = 0; i < uniques.length; i += taille) paquets.push(uniques.slice(i, i + taille));
  const resultats: T[] = [];
  for (let i = 0; i < paquets.length; i += PAQUETS_CONCURRENTS) {
    const groupe = await Promise.all(paquets.slice(i, i + PAQUETS_CONCURRENTS).map(lirePaquet));
    for (const lignes of groupe) resultats.push(...lignes);
  }
  return resultats;
}
