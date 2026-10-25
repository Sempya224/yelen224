import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calculerHashContenu, dateIsoUtc, serialiserCanonique, serialiserEnveloppe, type EnveloppeExport } from "./canonique";
import { lireCleSignature, signerHash, verifierSignature, ErreurCleSignature } from "./signature";
import { verifierEnveloppe } from "./verifier";

// Clé de test fabriquée ici (jamais une vraie clé, jamais lue depuis .env).
const CLE_TEST = "cle-de-test-uniquement-0123456789abcdef0123456789";

function enveloppe(surcharge: Partial<EnveloppeExport> = {}): EnveloppeExport {
  return {
    reference: "YL-EXP-2026-00000001", type: "journal", format: "xlsx",
    institution_id: "11111111-1111-1111-1111-111111111111", auteur_id: "22222222-2222-2222-2222-222222222222",
    role: "admin", filtres: { categorie: "rdv", periode: { du: "2026-10-01", au: "2026-10-24" } },
    nb_lignes: 2, version_gabarit: "1", cree_le: "2026-10-24T17:51:00.000Z",
    lignes: [
      { audit_id: "YL-AUD-2026-00000001", membre_nom: "Aïssatou Diallo", ip: null, details: { b: 2, a: 1 } },
      { audit_id: "YL-AUD-2026-00000002", membre_nom: "Mamadou Barry", ip: "", details: {} },
    ],
    ...surcharge,
  };
}

describe("canonique", () => {
  it("trie les clés récursivement, y compris les clés entières", () => {
    expect(serialiserCanonique({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
    expect(serialiserCanonique({ "10": "x", "2": "y", a: "z" })).toBe('{"10":"x","2":"y","a":"z"}');
  });
  it("traite undefined, null et chaîne vide comme null", () => {
    expect(serialiserCanonique({ a: undefined, b: null, c: "" })).toBe('{"a":null,"b":null,"c":null}');
  });
  it("écrit les dates en ISO UTC avec millisecondes", () => {
    expect(serialiserCanonique({ d: new Date("2026-10-24T17:51:00+00:00") })).toBe('{"d":"2026-10-24T17:51:00.000Z"}');
    expect(dateIsoUtc("2026-10-24T18:51:00+01:00")).toBe("2026-10-24T17:51:00.000Z");
  });
  it("normalise les chaînes en NFC", () => {
    expect(serialiserCanonique("é")).toBe(serialiserCanonique("é"));
  });
  it("refuse les valeurs non sérialisables", () => {
    expect(() => serialiserCanonique({ n: NaN })).toThrow();
    expect(() => serialiserCanonique({ n: Infinity })).toThrow();
    expect(() => serialiserCanonique({ f: () => 1 })).toThrow();
    expect(() => serialiserCanonique({ g: BigInt(1) })).toThrow();
    expect(() => dateIsoUtc("pas une date")).toThrow();
  });
  it("donne la même empreinte quel que soit l'ordre des lignes et des clés", () => {
    const a = enveloppe();
    const b = enveloppe({
      lignes: [
        { details: {}, ip: "", membre_nom: "Mamadou Barry", audit_id: "YL-AUD-2026-00000002" },
        { details: { a: 1, b: 2 }, ip: null, membre_nom: "Aïssatou Diallo", audit_id: "YL-AUD-2026-00000001" },
      ],
      filtres: { periode: { au: "2026-10-24", du: "2026-10-01" }, categorie: "rdv" },
    });
    expect(calculerHashContenu(a)).toBe(calculerHashContenu(b));
    expect(calculerHashContenu(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("change d'empreinte si une seule valeur change", () => {
    const alteree = enveloppe();
    alteree.lignes[0] = { ...alteree.lignes[0], membre_nom: "Autre" };
    expect(calculerHashContenu(alteree)).not.toBe(calculerHashContenu(enveloppe()));
    expect(calculerHashContenu(enveloppe({ reference: "YL-EXP-2026-00000002" }))).not.toBe(calculerHashContenu(enveloppe()));
  });
  it("refuse un nb_lignes incohérent", () => {
    expect(() => serialiserEnveloppe(enveloppe({ nb_lignes: 5 }))).toThrow();
  });
});

describe("clé de signature", () => {
  const avant = process.env.EXPORT_SIGNING_SECRET;
  beforeEach(() => { delete process.env.EXPORT_SIGNING_SECRET; });
  afterEach(() => { if (avant === undefined) delete process.env.EXPORT_SIGNING_SECRET; else process.env.EXPORT_SIGNING_SECRET = avant; });

  it("échoue explicitement si la variable est absente, vide ou trop courte, sans citer la valeur", () => {
    expect(() => lireCleSignature()).toThrow(ErreurCleSignature);
    process.env.EXPORT_SIGNING_SECRET = "   ";
    expect(() => lireCleSignature()).toThrow(/vide/);
    process.env.EXPORT_SIGNING_SECRET = "secret-trop-court";
    try { lireCleSignature(); throw new Error("aurait dû échouer"); } catch (e) {
      expect(e).toBeInstanceOf(ErreurCleSignature);
      expect((e as Error).message).toMatch(/trop courte/);
      expect((e as Error).message).not.toContain("secret-trop-court");
    }
  });
  it("retire les espaces autour de la valeur et lit les versions suivantes dans EXPORT_SIGNING_SECRET_V{n}", () => {
    process.env.EXPORT_SIGNING_SECRET = `${CLE_TEST}\n`;
    expect(lireCleSignature().cle.toString("utf8")).toBe(CLE_TEST);
    expect(() => lireCleSignature(2)).toThrow(/EXPORT_SIGNING_SECRET_V2/);
    expect(() => lireCleSignature(0)).toThrow(ErreurCleSignature);
  });
});

describe("signature et vérification", () => {
  const cle = Buffer.from(CLE_TEST, "utf8");
  const avant = process.env.EXPORT_SIGNING_SECRET;
  beforeEach(() => { process.env.EXPORT_SIGNING_SECRET = CLE_TEST; });
  afterEach(() => { if (avant === undefined) delete process.env.EXPORT_SIGNING_SECRET; else process.env.EXPORT_SIGNING_SECRET = avant; });

  it("valide la bonne signature et refuse toute autre", () => {
    const hash = calculerHashContenu(enveloppe());
    const sig = signerHash(hash, cle);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifierSignature(hash, sig, cle)).toBe(true);
    expect(verifierSignature(hash, sig.toUpperCase(), cle)).toBe(true);
    expect(verifierSignature(hash, sig.replace(/.$/, sig.endsWith("0") ? "1" : "0"), cle)).toBe(false);
    expect(verifierSignature(hash, "abc", cle)).toBe(false);
    expect(verifierSignature("pas-un-hash", sig, cle)).toBe(false);
    expect(verifierSignature(hash, sig, Buffer.from("une-autre-cle-de-test-0123456789abcdef012345", "utf8"))).toBe(false);
  });
  it("authentifie l'enveloppe d'origine et détecte une altération", () => {
    const env = enveloppe();
    const hash = calculerHashContenu(env);
    const enregistre = { hash_contenu: hash, signature_hmac: signerHash(hash, cle), cle_version: 1 };
    expect(verifierEnveloppe(env, enregistre)).toEqual({ hashCorrespond: true, signatureValide: true, authentique: true });

    const falsifiee = enveloppe();
    falsifiee.lignes[1] = { ...falsifiee.lignes[1], membre_nom: "Quelqu'un d'autre" };
    expect(verifierEnveloppe(falsifiee, enregistre)).toMatchObject({ hashCorrespond: false, authentique: false });

    const autreHash = calculerHashContenu(falsifiee);
    expect(verifierEnveloppe(falsifiee, { hash_contenu: autreHash, signature_hmac: enregistre.signature_hmac, cle_version: 1 }))
      .toMatchObject({ hashCorrespond: true, signatureValide: false, authentique: false });
  });
});
