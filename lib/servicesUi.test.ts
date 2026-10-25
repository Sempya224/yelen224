import { describe, it, expect } from "vitest";
import { nomCopie, descriptionRecopiable, messageErreurApi } from "./servicesUi";

describe("nomCopie", () => {
  it("ajoute (copie) à un nom ordinaire", () => {
    expect(nomCopie("Massage", ["Massage"])).toBe("Massage (copie)");
  });
  it("n'empile jamais le suffixe", () => {
    expect(nomCopie("Massage (copie)", ["Massage", "Massage (copie)"])).toBe("Massage (copie 2)");
    expect(nomCopie("Massage (copie) (copie)", ["Massage"])).toBe("Massage (copie)");
    expect(nomCopie("Massage (copie 2)", ["Massage", "Massage (copie)", "Massage (copie 2)"])).toBe("Massage (copie 3)");
  });
  it("respecte la limite de 120 caractères", () => {
    const r = nomCopie("x".repeat(120), []);
    expect(r.length).toBeLessThanOrEqual(120);
    expect(r.endsWith(" (copie)")).toBe(true);
  });
});

describe("descriptionRecopiable", () => {
  it("ne recopie pas un message d'erreur", () => {
    expect(descriptionRecopiable("Erreur : new row violates row-level security policy")).toBeNull();
    expect(descriptionRecopiable("new row violates row-level security policy for table")).toBeNull();
    expect(descriptionRecopiable('duplicate key value violates unique constraint "x"')).toBeNull();
  });
  it("conserve une vraie description, vide → null", () => {
    expect(descriptionRecopiable("  Massage relaxant 45 min ")).toBe("Massage relaxant 45 min");
    expect(descriptionRecopiable("   ")).toBeNull();
    expect(descriptionRecopiable(null)).toBeNull();
  });
});

describe("messageErreurApi", () => {
  it("utilise le message du serveur sinon le repli", () => {
    expect(messageErreurApi({ error: "Le prix doit être un nombre entier.", code: "PRIX_INVALIDE" }, "x")).toBe("Le prix doit être un nombre entier.");
    expect(messageErreurApi(null, "repli")).toBe("repli");
    expect(messageErreurApi({ error: "  " }, "repli")).toBe("repli");
  });
});
