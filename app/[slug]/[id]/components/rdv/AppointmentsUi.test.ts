import { describe, it, expect } from "vitest";
import { correspondFiltreRdv, estEffectue, jourPrecedent, variationJour, libelleVariationJour, type LigneRdvFiltrable } from "./AppointmentsUi";

// ─────────────────────────────────────────────────────────────────────────
// Lot 1, étape 1.1 (23/10/2026) — définitions partagées des catégories de RDV
// (filtre « Effectués » = compteur) et variations « aujourd'hui / hier ».
// Données fictives.
// ─────────────────────────────────────────────────────────────────────────

const MAINTENANT = new Date("2026-10-23T12:00:00Z");
function rdv(statut: string, date = "2026-10-20", extra: Partial<LigneRdvFiltrable> = {}): LigneRdvFiltrable {
  return { statut, presence_status: null, date_rdv: date, heure_rdv: "10:00:00", ...extra };
}

describe("filtre « Effectués » : même définition que le compteur", () => {
  const liste = [rdv("termine"), rdv("effectue"), rdv("honore"), rdv("confirme"), rdv("annule"), rdv("en_attente"), rdv("nouveau")];

  it("termine, effectue et honore apparaissent tous dans « Effectués »", () => {
    const lignes = liste.filter((r) => correspondFiltreRdv(r, "effectue", MAINTENANT));
    expect(lignes.map((r) => r.statut).sort()).toEqual(["effectue", "honore", "termine"]);
  });

  it("le compteur égale le nombre de lignes affichées par le filtre (même fonction)", () => {
    const compteur = liste.filter((r) => correspondFiltreRdv(r, "effectue", MAINTENANT)).length;
    const affichees = liste.filter((r) => correspondFiltreRdv(r, "effectue", MAINTENANT));
    expect(compteur).toBe(3);
    expect(affichees).toHaveLength(compteur);
  });

  it("estEffectue est la source unique de la définition", () => {
    expect(["effectue", "termine", "honore"].every(estEffectue)).toBe(true);
    expect(["confirme", "annule", "nouveau", "en_attente", "refuse", ""].some(estEffectue)).toBe(false);
  });
});

describe("autres catégories : comportement inchangé", () => {
  it("tous, confirmé, annulé et absent", () => {
    expect(correspondFiltreRdv(rdv("annule"), "tous", MAINTENANT)).toBe(true);
    expect(correspondFiltreRdv(rdv("confirme"), "confirme", MAINTENANT)).toBe(true);
    expect(correspondFiltreRdv(rdv("annule"), "confirme", MAINTENANT)).toBe(false);
    expect(correspondFiltreRdv(rdv("termine", "2026-10-20", { presence_status: "absent" }), "absent", MAINTENANT)).toBe(true);
  });

  it("« nouveau » et « en attente » excluent les RDV non traités ; « Non traités » les retient", () => {
    const enRetard = rdv("nouveau", "2026-10-22");
    const aVenir = rdv("nouveau", "2026-10-25");
    expect(correspondFiltreRdv(enRetard, "en_retard", MAINTENANT)).toBe(true);
    expect(correspondFiltreRdv(enRetard, "nouveau", MAINTENANT)).toBe(false);
    expect(correspondFiltreRdv(aVenir, "nouveau", MAINTENANT)).toBe(true);
    expect(correspondFiltreRdv(aVenir, "en_retard", MAINTENANT)).toBe(false);
    const attenteRetard = rdv("en_attente", "2026-10-22");
    expect(correspondFiltreRdv(attenteRetard, "en_attente", MAINTENANT)).toBe(false);
    expect(correspondFiltreRdv(attenteRetard, "en_retard", MAINTENANT)).toBe(true);
  });
});

describe("variationJour : nombres bruts, jours de Conakry", () => {
  const rdvs = [
    rdv("confirme", "2026-10-23"), rdv("confirme", "2026-10-23"), rdv("confirme", "2026-10-22"),
    rdv("termine", "2026-10-22"), rdv("termine", "2026-10-22"), rdv("annule", "2026-10-21"),
  ];

  it("compte les RDV prévus aujourd'hui et hier dans la catégorie", () => {
    expect(variationJour(rdvs, "confirme", MAINTENANT)).toEqual({ aujourdhui: 2, hier: 1 });
    expect(variationJour(rdvs, "effectue", MAINTENANT)).toEqual({ aujourdhui: 0, hier: 2 });
    expect(variationJour(rdvs, "tous", MAINTENANT)).toEqual({ aujourdhui: 2, hier: 3 });
  });

  it("hier > 0 et aujourd'hui = 0 : deux nombres, jamais un pourcentage", () => {
    const v = variationJour(rdvs, "effectue", MAINTENANT);
    const texte = libelleVariationJour(v);
    expect(texte).toBe("Aujourd'hui : 0 · hier : 2");
    expect(texte).not.toContain("%");
    expect(texte).not.toContain("100");
  });

  it("aujourd'hui = 0 et hier = 0 : rien à afficher", () => {
    const v = variationJour(rdvs, "absent", MAINTENANT);
    expect(v).toEqual({ aujourdhui: 0, hier: 0 });
    expect(libelleVariationJour(v)).toBeNull();
  });

  it("aujourd'hui > 0 et hier = 0 : affiché tel quel", () => {
    expect(libelleVariationJour({ aujourdhui: 3, hier: 0 })).toBe("Aujourd'hui : 3 · hier : 0");
  });

  it("jour de Conakry autour de minuit : 23:59:59 reste la veille, 00:00:01 bascule", () => {
    const donnees = [rdv("confirme", "2026-10-23"), rdv("confirme", "2026-10-24"), rdv("confirme", "2026-10-22")];
    expect(variationJour(donnees, "confirme", new Date("2026-10-23T23:59:59Z"))).toEqual({ aujourdhui: 1, hier: 1 });
    expect(variationJour(donnees, "confirme", new Date("2026-10-24T00:00:01Z"))).toEqual({ aujourdhui: 1, hier: 1 });
    // 23:59:59 : aujourd'hui = 23 (1 RDV), hier = 22 (1 RDV) ; 00:00:01 : aujourd'hui = 24 (1 RDV), hier = 23 (1 RDV).
    expect(variationJour(donnees, "confirme", new Date("2026-10-22T23:59:59Z"))).toEqual({ aujourdhui: 1, hier: 0 });
  });

  it("jour précédent : changement de mois et d'année", () => {
    expect(jourPrecedent("2026-11-01")).toBe("2026-10-31");
    expect(jourPrecedent("2027-01-01")).toBe("2026-12-31");
    expect(jourPrecedent("")).toBe("");
  });
});
