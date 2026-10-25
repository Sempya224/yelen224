import { describe, it, expect } from "vitest";
import { validerChampsService, SERVICE_LIMITES } from "./servicesValidation";

const OPTIONS = { codesEquipementsValides: ["wifi", "clim"] as const };
const valide = { nom: "Consultation", prix: 5000, duree_minutes: 30 };

function creation(extra: Record<string, unknown> = {}) {
  return validerChampsService({ ...valide, ...extra }, "creation", OPTIONS);
}
function modification(corps: unknown) {
  return validerChampsService(corps, "modification", OPTIONS);
}
function code(r: ReturnType<typeof creation>) {
  return r.ok ? null : r.code;
}

describe("création — champs obligatoires et bornes", () => {
  it("corps minimal valide : défauts posés, promo jamais écrite", () => {
    const r = creation({ prix_promo: 100, promo_actif: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.champs).toMatchObject({ nom: "Consultation", prix: 5000, duree_minutes: 30, is_active: true, taux_taxe: 0, est_chambre: false, photos: [], inclus: [] });
    expect(r.champs).not.toHaveProperty("prix_promo");
    expect(r.champs).not.toHaveProperty("promo_actif");
  });

  it("corps absent ou non objet : CORPS_INVALIDE", () => {
    for (const corps of [null, undefined, "x", 3, []]) expect(code(validerChampsService(corps, "creation", OPTIONS))).toBe("CORPS_INVALIDE");
  });

  it("nom : vide, espaces, trop long, non texte → NOM_INVALIDE ; 120 caractères accepté", () => {
    for (const nom of ["", "   ", "x".repeat(SERVICE_LIMITES.NOM_MAX + 1), 42, undefined]) expect(code(creation({ nom }))).toBe("NOM_INVALIDE");
    expect(creation({ nom: "x".repeat(SERVICE_LIMITES.NOM_MAX) }).ok).toBe(true);
  });

  it("prix : 0, négatif, décimal, NaN, texte, au-dessus de 100 000 000 → PRIX_INVALIDE ; borne haute acceptée", () => {
    for (const prix of [0, -5, 10.5, Number.NaN, "5000", null, SERVICE_LIMITES.PRIX_MAX + 1, undefined]) expect(code(creation({ prix }))).toBe("PRIX_INVALIDE");
    expect(creation({ prix: SERVICE_LIMITES.PRIX_MAX }).ok).toBe(true);
  });

  it("durée : hors 1..1440, décimale, texte → DUREE_INVALIDE ; bornes acceptées", () => {
    for (const duree_minutes of [0, -1, 1441, 30.5, "30", undefined]) expect(code(creation({ duree_minutes }))).toBe("DUREE_INVALIDE");
    expect(creation({ duree_minutes: 1 }).ok).toBe(true);
    expect(creation({ duree_minutes: 1440 }).ok).toBe(true);
  });

  it("description > 2000 → DESCRIPTION_TROP_LONGUE ; 2000 accepté ; vide → null", () => {
    expect(code(creation({ description: "x".repeat(2001) }))).toBe("DESCRIPTION_TROP_LONGUE");
    expect(creation({ description: "x".repeat(2000) }).ok).toBe(true);
    const r = creation({ description: "   " });
    expect(r.ok && r.champs.description).toBe(null);
  });

  it("taux de taxe : hors 0..100 ou non numérique → TAXE_INVALIDE ; 0 et 100 acceptés", () => {
    for (const taux_taxe of [-1, 100.01, Number.NaN, "18", null]) expect(code(creation({ taux_taxe }))).toBe("TAXE_INVALIDE");
    expect(creation({ taux_taxe: 0 }).ok).toBe(true);
    expect(creation({ taux_taxe: 100 }).ok).toBe(true);
  });

  it("catégorie > 80 → CATEGORIE_INVALIDE ; 80 accepté", () => {
    expect(code(creation({ categorie: "x".repeat(81) }))).toBe("CATEGORIE_INVALIDE");
    expect(creation({ categorie: "x".repeat(80) }).ok).toBe(true);
  });

  it("champs hôtel invalides : 400 avec code stable, plus d'effacement silencieux", () => {
    expect(code(creation({ nombre_unites: 0 }))).toBe("NOMBRE_UNITES_INVALIDE");
    expect(code(creation({ nombre_unites: 2.5 }))).toBe("NOMBRE_UNITES_INVALIDE");
    expect(code(creation({ capacite_max: 0 }))).toBe("CAPACITE_INVALIDE");
    expect(code(creation({ capacite_adultes: -1 }))).toBe("CAPACITE_INVALIDE");
    expect(code(creation({ capacite_enfants: 1.5 }))).toBe("CAPACITE_INVALIDE");
    expect(code(creation({ superficie_m2: 0 }))).toBe("SUPERFICIE_INVALIDE");
    expect(code(creation({ superficie_m2: -3 }))).toBe("SUPERFICIE_INVALIDE");
    expect(code(creation({ superficie_m2: 10000 }))).toBe("SUPERFICIE_INVALIDE");
    expect(creation({ capacite_adultes: 0, capacite_max: 4, nombre_unites: 3, superficie_m2: 25.5 }).ok).toBe(true);
  });

  it("champs complémentaires : forme contrôlée, rejet sinon", () => {
    expect(creation({ champs_complementaires: [{ label: " N° client ", type: "numero", requis: true }] }).ok).toBe(true);
    expect(code(creation({ champs_complementaires: [{ label: "", type: "texte", requis: true }] }))).toBe("CHAMP_INVALIDE");
    expect(code(creation({ champs_complementaires: [{ label: "x", type: "autre", requis: true }] }))).toBe("CHAMP_INVALIDE");
    expect(code(creation({ champs_complementaires: "x" }))).toBe("CHAMP_INVALIDE");
    expect(code(creation({ champs_complementaires: Array.from({ length: 11 }, () => ({ label: "x", type: "texte", requis: false })) }))).toBe("CHAMP_INVALIDE");
  });

  it("est_chambre est posé à la création ; équipements inconnus filtrés ; photos plafonnées à 5", () => {
    const r = creation({ est_chambre: true, equipements_chambre: ["wifi", "inconnu", "wifi"], photos: ["a", "b", "c", "d", "e", "f", ""] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.champs.est_chambre).toBe(true);
    expect(r.champs.equipements_chambre).toEqual(["wifi"]);
    expect(r.champs.photos).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("modification", () => {
  it("corps vide ou sans champ reconnu : CORPS_VIDE", () => {
    expect(code(modification({}))).toBe("CORPS_VIDE");
    expect(code(modification({ id: "x" }))).toBe("CORPS_VIDE");
    expect(code(modification({ id: "x", prix_promo: 10, promo_actif: true, est_chambre: true }))).toBe("CORPS_VIDE");
  });

  it("seuls les champs fournis sont validés et renvoyés", () => {
    const r = modification({ id: "x", prix: 7000 });
    expect(r).toEqual({ ok: true, champs: { prix: 7000 } });
  });

  it("est_chambre est immuable : ignoré en modification, même mélangé à d'autres champs", () => {
    const r = modification({ nom: "Suite", est_chambre: true });
    expect(r).toEqual({ ok: true, champs: { nom: "Suite" } });
  });

  it("prix_promo / promo_actif sont ignorés (aucune écriture)", () => {
    const r = modification({ nom: "Suite", prix_promo: -5, promo_actif: true });
    expect(r).toEqual({ ok: true, champs: { nom: "Suite" } });
  });

  it("valeurs invalides fournies : 400 au lieu d'être ignorées en silence", () => {
    expect(code(modification({ prix: 0 }))).toBe("PRIX_INVALIDE");
    expect(code(modification({ prix: -1 }))).toBe("PRIX_INVALIDE");
    expect(code(modification({ duree_minutes: 0 }))).toBe("DUREE_INVALIDE");
    expect(code(modification({ nom: "  " }))).toBe("NOM_INVALIDE");
    expect(code(modification({ taux_taxe: -1 }))).toBe("TAXE_INVALIDE");
    expect(code(modification({ type_prestation: "bidon" }))).toBe("CHAMP_INVALIDE");
    expect(code(modification({ is_active: "oui" }))).toBe("CHAMP_INVALIDE");
    expect(code(modification({ nombre_unites: 0 }))).toBe("NOMBRE_UNITES_INVALIDE");
    expect(code(modification({ capacite_max: -2 }))).toBe("CAPACITE_INVALIDE");
    expect(code(modification({ superficie_m2: 0 }))).toBe("SUPERFICIE_INVALIDE");
  });

  it("null explicite sur un champ facultatif = effacement volontaire, accepté", () => {
    const r = modification({ nombre_unites: null, capacite_max: null, superficie_m2: null, localisation: null, horaires: null, type_prestation: null, description: null });
    expect(r).toEqual({
      ok: true,
      champs: { nombre_unites: null, capacite_max: null, superficie_m2: null, localisation: null, horaires: null, type_prestation: null, description: null },
    });
  });
});
