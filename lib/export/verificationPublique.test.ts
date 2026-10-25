import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { base64urlVersHex, baseUrlApplication, hexVersBase64url, urlVerificationExport, urlVerificationExportAvecEmpreinte } from "./empreinteUrl";
import { calculerHashContenu, type EnveloppeExport } from "./canonique";
import { ErreurCleSignature, lireCleSignature, signerHash } from "./signature";
import {
  TEXTE_LIMITE_VERIFICATION, reponsePublique, verifierExportPublic, type DependancesVerification, type LigneExportPublique,
} from "./verificationPublique";

const CLE_TEST = "cle-de-test-uniquement-0123456789abcdef0123456789";
const REF = "YL-EXP-2026-00000001";

function enveloppe(): EnveloppeExport {
  return {
    reference: REF, type: "journal", format: "certifie", institution_id: "11111111-1111-1111-1111-111111111111", auteur_id: null,
    role: "admin", filtres: {}, nb_lignes: 1, version_gabarit: "journal-1", cree_le: "2026-10-25T00:43:19.487Z",
    lignes: [{ reference: "YL-AUD-2026-00000001", membre: "Aïssatou Diallo" }],
  };
}

const HASH = calculerHashContenu(enveloppe());
const SIGNATURE = signerHash(HASH, Buffer.from(CLE_TEST, "utf8"));

function ligne(surcharge: Partial<LigneExportPublique> = {}): LigneExportPublique {
  return {
    id: "22222222-2222-2222-2222-222222222222", reference: REF, type: "journal", institution_id: "11111111-1111-1111-1111-111111111111",
    hash_contenu: HASH, signature_hmac: SIGNATURE, cle_version: 1, nb_lignes: 1, version_gabarit: "journal-1",
    cree_le: "2026-10-25T00:43:19.487+00:00", ...surcharge,
  };
}

function deps(stockee: LigneExportPublique | null): DependancesVerification & { appelsNom: number } {
  const d = {
    appelsNom: 0,
    charger: async (reference: string) => (stockee && stockee.reference === reference ? stockee : null),
    lireCle: (version: number) => lireCleSignature(version),
    nomEtablissement: async () => { d.appelsNom++; return "ECOBANK"; },
  };
  return d;
}

describe("vérification publique d'un export", () => {
  const avant = process.env.EXPORT_SIGNING_SECRET;
  beforeEach(() => { process.env.EXPORT_SIGNING_SECRET = CLE_TEST; });
  afterEach(() => { if (avant === undefined) delete process.env.EXPORT_SIGNING_SECRET; else process.env.EXPORT_SIGNING_SECRET = avant; });

  it("vérifie une référence et une empreinte justes, et ne renvoie que les champs publics", async () => {
    const r = await verifierExportPublic({ reference: REF, empreinte: HASH }, deps(ligne()));
    expect(r.verifie).toBe(true);
    const pub = reponsePublique(r);
    expect(pub).toEqual({
      verifie: true, reference: REF, type: "Journal d'activité", etablissement: "ECOBANK",
      date: "25 octobre 2026 · 12:43 AM", nb_lignes: 1, version_gabarit: "journal-1",
    });
    const texte = JSON.stringify(pub);
    expect(texte).not.toContain(HASH);
    expect(texte).not.toContain(SIGNATURE);
    expect(texte).not.toContain("institution_id");
  });
  it("accepte l'empreinte en majuscules", async () => {
    const r = await verifierExportPublic({ reference: REF, empreinte: HASH.toUpperCase() }, deps(ligne()));
    expect(r.verifie).toBe(true);
  });
  it("refuse une fausse empreinte", async () => {
    const fausse = HASH.replace(/^./, HASH[0] === "a" ? "b" : "a");
    const r = await verifierExportPublic({ reference: REF, empreinte: fausse }, deps(ligne()));
    expect(r).toEqual({ verifie: false, raison: "empreinte" });
  });
  it("refuse une signature HMAC altérée même si l'empreinte est juste, et le signale en interne", async () => {
    const alteree = SIGNATURE.replace(/^./, SIGNATURE[0] === "a" ? "b" : "a");
    const r = await verifierExportPublic({ reference: REF, empreinte: HASH }, deps(ligne({ signature_hmac: alteree })));
    expect(r).toEqual({ verifie: false, raison: "signature" });
  });
  it("refuse une signature produite avec une autre clé", async () => {
    const autre = signerHash(HASH, Buffer.from("une-autre-cle-de-test-0123456789abcdef012345", "utf8"));
    const r = await verifierExportPublic({ reference: REF, empreinte: HASH }, deps(ligne({ signature_hmac: autre })));
    expect(r.verifie).toBe(false);
  });
  it("refuse les entrées mal formées sans interroger la base", async () => {
    let appels = 0;
    const d: DependancesVerification = { ...deps(ligne()), charger: async () => { appels++; return null; } };
    for (const entree of [
      { reference: "YL-EXP-2026-1", empreinte: HASH },
      { reference: REF, empreinte: "abc" },
      { reference: REF, empreinte: `${HASH}0` },
      { reference: REF, empreinte: "g".repeat(64) },
      { reference: 42, empreinte: HASH },
      { reference: REF, empreinte: null },
      { reference: undefined, empreinte: undefined },
    ]) {
      expect(await verifierExportPublic(entree, d)).toEqual({ verifie: false, raison: "forme" });
    }
    expect(appels).toBe(0);
  });
  it("donne exactement la même réponse publique pour toutes les issues négatives", async () => {
    const fausse = HASH.replace(/^./, HASH[0] === "a" ? "b" : "a");
    const alteree = SIGNATURE.replace(/^./, SIGNATURE[0] === "a" ? "b" : "a");
    const resultats = await Promise.all([
      verifierExportPublic({ reference: "YL-EXP-2026-99999999", empreinte: HASH }, deps(ligne())),          // inexistante
      verifierExportPublic({ reference: REF, empreinte: fausse }, deps(ligne())),                            // mauvaise empreinte
      verifierExportPublic({ reference: "pas une référence", empreinte: "x" }, deps(ligne())),               // mal formée
      verifierExportPublic({ reference: REF, empreinte: HASH }, deps(ligne({ signature_hmac: alteree }))),   // HMAC invalide
    ]);
    const publiques = resultats.map(r => JSON.stringify(reponsePublique(r)));
    expect(new Set(publiques).size).toBe(1);
    expect(publiques[0]).toBe('{"verifie":false}');
  });
  it("ne cherche pas le nom de l'établissement sur un échec", async () => {
    const d = deps(ligne());
    await verifierExportPublic({ reference: REF, empreinte: "0".repeat(64) }, d);
    expect(d.appelsNom).toBe(0);
  });
  it("lève une erreur explicite (et ne répond pas « non vérifié ») si la clé est absente", async () => {
    delete process.env.EXPORT_SIGNING_SECRET;
    await expect(verifierExportPublic({ reference: REF, empreinte: HASH }, deps(ligne()))).rejects.toThrow(ErreurCleSignature);
    await expect(verifierExportPublic({ reference: "YL-EXP-2026-99999999", empreinte: HASH }, deps(null))).rejects.toThrow(ErreurCleSignature);
  });
  it("affiche le texte de limite imposé, sans mention de valeur probante", () => {
    expect(TEXTE_LIMITE_VERIFICATION).toBe(
      "Cette vérification confirme l'enregistrement du document par Yelen224. Elle ne garantit pas, à elle seule, que le contenu du fichier est resté inchangé.",
    );
    expect(TEXTE_LIMITE_VERIFICATION.toLowerCase()).not.toMatch(/probant|signature électronique|légalis/);
  });
});

describe("empreinte dans l'URL du QR", () => {
  it("convertit hex ↔ base64url sans perte, en 43 caractères", () => {
    const b64 = hexVersBase64url(HASH);
    expect(b64).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(base64urlVersHex(b64)).toBe(HASH);
  });
  it("refuse une empreinte ou un fragment invalide", () => {
    expect(() => hexVersBase64url("abc")).toThrow();
    expect(base64urlVersHex("trop-court")).toBeNull();
    expect(base64urlVersHex(`${"A".repeat(42)}!`)).toBeNull();
  });
  it("construit l'URL avec le fragment et sans lui", () => {
    expect(urlVerificationExport("https://exemple.test", REF)).toBe(`https://exemple.test/verify/export/${REF}`);
    expect(urlVerificationExportAvecEmpreinte("https://exemple.test", REF, HASH)).toBe(`https://exemple.test/verify/export/${REF}#e=${hexVersBase64url(HASH)}`);
  });
  it("retombe sur l'origine de la requête quand NEXT_PUBLIC_APP_URL est absente", () => {
    const avant = process.env.NEXT_PUBLIC_APP_URL;
    try {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(baseUrlApplication("https://deploy-preview-1.netlify.app/")).toEqual({ base: "https://deploy-preview-1.netlify.app", viaEnv: false });
      process.env.NEXT_PUBLIC_APP_URL = "https://yelen224.com/";
      expect(baseUrlApplication("https://x.test")).toEqual({ base: "https://yelen224.com", viaEnv: true });
    } finally {
      if (avant === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = avant;
    }
  });
});
