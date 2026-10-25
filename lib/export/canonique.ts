// Contenu canonique d'un export (module d'export commun, 24/10/2026).
//
// Objectif : un contenu qui se sérialise de façon IDENTIQUE quel que soit
// l'ordre des clés ou des lignes, afin que l'empreinte SHA-256 soit
// recalculable indépendamment à partir des données exportées. Règles :
//  - clés d'objet triées (comparaison par unités de code, jamais par locale),
//    récursivement ; sérialisation écrite à la main parce que JavaScript
//    réordonne les clés « entières » ("10", "2") quel que soit l'ordre
//    d'insertion, ce qui rendrait JSON.stringify non déterministe ici ;
//  - dates en ISO 8601 UTC avec millisecondes ;
//  - undefined, null et chaîne vide sont équivalents : null ;
//  - chaînes normalisées en NFC ;
//  - lignes triées par leur propre sérialisation canonique (tri indépendant
//    de l'ordre d'affichage du fichier, des lignes identiques sont
//    interchangeables) ;
//  - toute valeur non sérialisable (NaN, Infinity, bigint, fonction, symbole)
//    lève une erreur plutôt que d'être écrasée silencieusement.
import { createHash } from "crypto";

export type ValeurCanonique = null | boolean | number | string | ValeurCanonique[] | { [cle: string]: ValeurCanonique };

export class ErreurContenuCanonique extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurContenuCanonique";
  }
}

// Date → « 2026-10-24T17:51:00.000Z ». Accepte un objet Date ou une chaîne
// datable (par ex. « 2026-10-24T17:51:00+00:00 » renvoyé par Postgres).
export function dateIsoUtc(valeur: Date | string): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) throw new ErreurContenuCanonique("Date invalide dans le contenu d'un export.");
  return d.toISOString();
}

function comparerCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function normaliserValeur(v: unknown): ValeurCanonique {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return dateIsoUtc(v);
  switch (typeof v) {
    case "string": return v.normalize("NFC");
    case "boolean": return v;
    case "number":
      if (!Number.isFinite(v)) throw new ErreurContenuCanonique("Nombre non fini dans le contenu d'un export.");
      return v;
    case "object": {
      if (Array.isArray(v)) return v.map(normaliserValeur);
      const source = v as Record<string, unknown>;
      const sortie: { [cle: string]: ValeurCanonique } = {};
      for (const cle of Object.keys(source)) sortie[cle.normalize("NFC")] = normaliserValeur(source[cle]);
      return sortie;
    }
    default:
      throw new ErreurContenuCanonique(`Type non sérialisable (${typeof v}) dans le contenu d'un export.`);
  }
}

function ecrire(v: ValeurCanonique): string {
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(ecrire).join(",")}]`;
  const cles = Object.keys(v).sort(comparerCodeUnits);
  return `{${cles.map(c => `${JSON.stringify(c)}:${ecrire(v[c])}`).join(",")}}`;
}

// Sérialisation canonique d'une valeur quelconque.
export function serialiserCanonique(v: unknown): string {
  return ecrire(normaliserValeur(v));
}

export type EnveloppeExport = {
  reference: string;
  type: string;
  format: string;
  institution_id: string;
  auteur_id: string | null;
  role: string;
  filtres: Record<string, unknown>;
  nb_lignes: number;
  version_gabarit: string;
  cree_le: Date | string;
  lignes: Record<string, unknown>[];
};

// Texte canonique de l'enveloppe complète. Les lignes sont triées par leur
// sérialisation canonique ; nb_lignes doit correspondre exactement.
export function serialiserEnveloppe(env: EnveloppeExport): string {
  if (!Number.isInteger(env.nb_lignes) || env.nb_lignes !== env.lignes.length) {
    throw new ErreurContenuCanonique("nb_lignes ne correspond pas au nombre de lignes de l'export.");
  }
  const lignes = env.lignes.map(serialiserCanonique).sort(comparerCodeUnits);
  // Chaque champ est sérialisé séparément (les lignes sont déjà triées et
  // sérialisées), puis l'objet est assemblé avec ses clés triées, « lignes »
  // comprise : le résultat est exactement serialiserCanonique() de l'objet
  // complet, sans re-parser les lignes.
  const champs: Record<string, string> = {
    reference: serialiserCanonique(env.reference),
    type: serialiserCanonique(env.type),
    format: serialiserCanonique(env.format),
    institution_id: serialiserCanonique(env.institution_id),
    auteur_id: serialiserCanonique(env.auteur_id),
    role: serialiserCanonique(env.role),
    filtres: serialiserCanonique(env.filtres),
    nb_lignes: serialiserCanonique(env.nb_lignes),
    version_gabarit: serialiserCanonique(env.version_gabarit),
    cree_le: serialiserCanonique(dateIsoUtc(env.cree_le)),
    lignes: `[${lignes.join(",")}]`,
  };
  return `{${Object.keys(champs).sort(comparerCodeUnits).map(c => `${JSON.stringify(c)}:${champs[c]}`).join(",")}}`;
}

// SHA-256 (hex) du texte canonique de l'enveloppe.
export function calculerHashContenu(env: EnveloppeExport): string {
  return createHash("sha256").update(serialiserEnveloppe(env), "utf8").digest("hex");
}
