// Lecture par lots d'une source paginée (export du Journal, 24/10/2026). Pure :
// l'accès à la base est injecté.
//
// Pourquoi : une requête unique de 5000 lignes est silencieusement plafonnée par la
// limite « Max rows » de l'API Supabase (1000 par défaut). L'export était alors
// tronqué à 1000 lignes tout en étant signé et horodaté comme complet. On avance donc
// de la taille RÉELLEMENT reçue (un lot plus petit que demandé n'arrête pas la
// lecture), on s'arrête à `max + 1` lignes (pour savoir s'il en reste) ou à la fin des
// données, et la troncature n'est déclarée que s'il existe réellement plus de lignes
// que le plafond.
//
// Cohérence entre lots : l'appelant impose un ordre stable (created_at, id) et une
// borne haute fixe sur la date ; `cle` écarte en plus tout doublon qui se glisserait
// entre deux lots.
export async function lireParLots<T>(p: {
  chargerLot: (offset: number, taille: number) => Promise<T[]>;
  max: number;
  tailleLot: number;
  // Identifiant d'une ligne, pour écarter les doublons entre lots.
  cle?: (ligne: T) => string;
}): Promise<{ lignes: T[]; tronque: boolean; lignesLues: number }> {
  const retenues: T[] = [];
  const vues = new Set<string>();
  let offset = 0;
  while (retenues.length <= p.max) {
    const lot = await p.chargerLot(offset, p.tailleLot);
    if (lot.length === 0) break;
    offset += lot.length;
    for (const ligne of lot) {
      if (p.cle) {
        const k = p.cle(ligne);
        if (vues.has(k)) continue;
        vues.add(k);
      }
      retenues.push(ligne);
    }
  }
  return { lignes: retenues.slice(0, p.max), tronque: retenues.length > p.max, lignesLues: offset };
}
