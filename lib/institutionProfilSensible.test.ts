import { describe, it, expect } from "vitest";
import {
  normaliserTexteProfil, versCoordonnee, champsSensiblesModifies, estErreurReauthRpc,
  extraireDemandesCreees, estCleRpcProfil, type ProfilSensibleActuel,
} from "./institutionProfilSensible";

const ACTUEL: ProfilSensibleActuel = {
  name: "Clinique Aurore", ville: "Conakry", adresse: "Rue 1", latitude: 9.5, longitude: -13.7,
  activite_categorie_id: "cat-1", activite_principale_id: "act-1",
};

describe("normaliserTexteProfil", () => {
  it("ignore casse, espaces multiples et bords, garde les accents", () => {
    expect(normaliserTexteProfil("  CLINIQUE   Aurore ")).toBe("clinique aurore");
    expect(normaliserTexteProfil("Hôpital")).not.toBe(normaliserTexteProfil("Hopital"));
  });
  it("réduit toute valeur non texte à une chaîne vide", () => {
    expect(normaliserTexteProfil(null)).toBe("");
    expect(normaliserTexteProfil(12)).toBe("");
  });
  it("unifie les formes Unicode (NFC)", () => {
    expect(normaliserTexteProfil("é")).toBe(normaliserTexteProfil("é"));
  });
});

describe("versCoordonnee", () => {
  it("convertit nombres, chaînes numériques et vides", () => {
    expect(versCoordonnee(9.5)).toBe(9.5);
    expect(versCoordonnee("9.5")).toBe(9.5);
    expect(versCoordonnee("")).toBeNull();
    expect(versCoordonnee(null)).toBeNull();
  });
  it("renvoie undefined pour une valeur inexploitable", () => {
    expect(versCoordonnee("abc")).toBeUndefined();
    expect(versCoordonnee(Number.NaN)).toBeUndefined();
    expect(versCoordonnee({})).toBeUndefined();
  });
});

describe("champsSensiblesModifies", () => {
  it("valeurs identiques → aucun champ", () => {
    expect(champsSensiblesModifies(ACTUEL, { name: "Clinique Aurore", ville: "Conakry", adresse: "Rue 1", latitude: 9.5, longitude: -13.7 })).toEqual([]);
  });
  it("casse/espaces seuls → aucun champ", () => {
    expect(champsSensiblesModifies(ACTUEL, { name: "clinique   AURORE ", ville: " conakry" })).toEqual([]);
  });
  it("détecte nom, ville, adresse", () => {
    expect(champsSensiblesModifies(ACTUEL, { name: "Autre", ville: "Kindia", adresse: "Rue 2" })).toEqual(["name", "ville", "adresse"]);
  });
  it("adresse vide équivaut à adresse absente", () => {
    expect(champsSensiblesModifies({ ...ACTUEL, adresse: null }, { adresse: "" })).toEqual([]);
  });
  it("coordonnées : bruit < 1e-6 ignoré, déplacement réel détecté, une seule entrée logique", () => {
    expect(champsSensiblesModifies(ACTUEL, { latitude: 9.5000000001 })).toEqual([]);
    expect(champsSensiblesModifies(ACTUEL, { latitude: 9.6, longitude: -13.8 })).toEqual(["coordonnees"]);
  });
  it("une seule coordonnée fournie complète l'autre avec la valeur actuelle", () => {
    expect(champsSensiblesModifies(ACTUEL, { latitude: 9.5 })).toEqual([]);
    expect(champsSensiblesModifies(ACTUEL, { longitude: -14 })).toEqual(["coordonnees"]);
  });
  it("catégorie ou activité principale différente → activite", () => {
    expect(champsSensiblesModifies(ACTUEL, { activite_categorie_id: "cat-2" })).toEqual(["activite"]);
    expect(champsSensiblesModifies(ACTUEL, { activite_categorie_id: "cat-1", activite_principale_id: "act-2" })).toEqual(["activite"]);
  });
  it("activités secondaires seules (niveau A) ne sont jamais sensibles", () => {
    expect(champsSensiblesModifies(ACTUEL, { activites_secondaires_ids: ["a", "b"] })).toEqual([]);
    expect(champsSensiblesModifies(ACTUEL, { activite_categorie_id: "cat-1", activite_principale_id: "act-1", activites_secondaires_ids: ["a"] })).toEqual([]);
  });
  it("champ absent du corps → jamais modifié", () => {
    expect(champsSensiblesModifies(ACTUEL, {})).toEqual([]);
  });
});

describe("estCleRpcProfil", () => {
  it("reconnaît les clés de niveau B et refuse quartier / statut / statut_juridique", () => {
    for (const cle of ["name", "ville", "adresse", "latitude", "longitude", "activite_categorie_id", "activite_principale_id", "activites_secondaires_ids"]) {
      expect(estCleRpcProfil(cle)).toBe(true);
    }
    for (const cle of ["quartier", "statut", "badge_verifie", "statut_juridique", "plan", "description"]) {
      expect(estCleRpcProfil(cle)).toBe(false);
    }
  });
});

describe("estErreurReauthRpc", () => {
  it("reconnaît le code YR001 ou le message dédié", () => {
    expect(estErreurReauthRpc({ code: "YR001", message: "x" })).toBe(true);
    expect(estErreurReauthRpc({ code: "P0001", message: "REAUTH_REQUIRED" })).toBe(true);
  });
  it("ignore les autres erreurs et l'absence d'erreur", () => {
    expect(estErreurReauthRpc({ code: "23503", message: "fk" })).toBe(false);
    expect(estErreurReauthRpc(null)).toBe(false);
    expect(estErreurReauthRpc(undefined)).toBe(false);
  });
});

describe("extraireDemandesCreees", () => {
  it("ne garde que numéro et champ, jamais l'identifiant", () => {
    expect(extraireDemandesCreees({ demandes: [{ id: "x", numero: "YL-CHG-2026-00000001", champ: "name" }], absorbees: [] }))
      .toEqual([{ numero: "YL-CHG-2026-00000001", champ: "name" }]);
  });
  it("tolère une réponse absente ou mal formée", () => {
    expect(extraireDemandesCreees(null)).toEqual([]);
    expect(extraireDemandesCreees({})).toEqual([]);
    expect(extraireDemandesCreees({ demandes: [null, 3, { numero: 5 }] })).toEqual([]);
  });
});
