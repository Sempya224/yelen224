import { describe, expect, it } from "vitest";
import { lireParLots } from "./lectureParLots";

type Ligne = { id: string; n: number };
const source = (n: number): Ligne[] => Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}`, n: i }));

// Simule l'API : au plus `plafondApi` lignes par requête, quelle que soit la taille demandée.
const api = (donnees: Ligne[], plafondApi: number) => async (offset: number, taille: number) =>
  donnees.slice(offset, offset + Math.min(taille, plafondApi));

describe("lecture par lots (export du Journal)", () => {
  it("exporte les 2500 lignes d'une source dont l'API est plafonnée à 1000 par requête", async () => {
    const donnees = source(2500);
    // Ancien comportement : une seule requête de 5000 lignes, plafonnée en silence par l'API.
    const ancien = await api(donnees, 1000)(0, 5000);
    expect(ancien).toHaveLength(1000);
    // Nouveau comportement : lecture par lots.
    const r = await lireParLots({ chargerLot: api(donnees, 1000), max: 5000, tailleLot: 1000, cle: l => l.id });
    expect(r.lignes).toHaveLength(2500);
    expect(r.tronque).toBe(false);
    expect(r.lignesLues).toBe(2500);
    expect(r.lignes.map(l => l.n)).toEqual(donnees.map(l => l.n)); // même ordre, sans trou
  });
  it("n'arrête pas la lecture quand l'API renvoie moins que demandé", async () => {
    const r = await lireParLots({ chargerLot: api(source(1234), 300), max: 5000, tailleLot: 1000, cle: l => l.id });
    expect(r.lignes).toHaveLength(1234);
    expect(r.tronque).toBe(false);
  });
  it("déclare la troncature seulement s'il existe plus de lignes que le plafond", async () => {
    const plus = await lireParLots({ chargerLot: api(source(6200), 1000), max: 5000, tailleLot: 1000, cle: l => l.id });
    expect(plus.lignes).toHaveLength(5000);
    expect(plus.tronque).toBe(true);
    expect(plus.lignes.at(-1)?.n).toBe(4999);
    // Exactement le plafond : complet, pas tronqué (l'ancien test « length >= 5000 » l'aurait déclaré tronqué).
    const exact = await lireParLots({ chargerLot: api(source(5000), 1000), max: 5000, tailleLot: 1000, cle: l => l.id });
    expect(exact.lignes).toHaveLength(5000);
    expect(exact.tronque).toBe(false);
  });
  it("écarte les doublons qui se glisseraient entre deux lots", async () => {
    const donnees = source(30);
    // Une ligne est insérée en tête pendant la lecture : tout ce qui suit est décalé d'un
    // cran, donc la dernière ligne du lot précédent repasse au début du lot suivant.
    const avecDoublons = async (offset: number, taille: number) => {
      const decalage = offset >= 10 ? 1 : 0;
      return donnees.slice(offset - decalage, offset - decalage + taille);
    };
    const r = await lireParLots({ chargerLot: avecDoublons, max: 5000, tailleLot: 10, cle: l => l.id });
    expect(r.lignes.map(l => l.n)).toEqual(donnees.map(l => l.n));
  });
  it("gère une source vide", async () => {
    expect(await lireParLots({ chargerLot: async () => [], max: 5000, tailleLot: 1000 })).toEqual({ lignes: [], tronque: false, lignesLues: 0 });
  });
});
