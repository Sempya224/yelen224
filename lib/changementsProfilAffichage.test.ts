import { describe, it, expect } from "vitest";
import { estChampDemande, etatComplement, formaterValeurDemande, idsActiviteReferences, libelleRelance, LIBELLE_CHAMP, palierRelance } from "./changementsProfilAffichage";

describe("relance automatique : paliers et libellés", () => {
  it("palierRelance : 0 avant 7 jours, 7 de 7 à 13, 14 dès 14 jours", () => {
    expect(palierRelance(0)).toBe(0);
    expect(palierRelance(6.9)).toBe(0);
    expect(palierRelance(7)).toBe(7);
    expect(palierRelance(13.9)).toBe(7);
    expect(palierRelance(14)).toBe(14);
    expect(palierRelance(90)).toBe(14);
  });
  it("libelleRelance lit le marqueur SQL, repli générique sinon", () => {
    expect(libelleRelance("relance_7j")).toContain("7 jours");
    expect(libelleRelance("relance_14j")).toContain("14 jours");
    expect(libelleRelance(null)).toBe("Relance automatique envoyée à l'établissement");
    expect(libelleRelance("autre")).toBe("Relance automatique envoyée à l'établissement");
  });
  it("une relance ne change pas l'état d'un échange de complément", () => {
    expect(etatComplement([{ type: "relance_envoyee", created_at: "2026-10-20T10:00:00Z" }])).toBe("aucun");
    expect(etatComplement([
      { type: "complement_demande", created_at: "2026-10-20T10:00:00Z" },
      { type: "relance_envoyee", created_at: "2026-10-27T10:00:00Z" },
    ])).toBe("demande");
  });
});

const LIBELLES = {
  categories: new Map([["cat-1", "Santé"]]),
  activites: new Map([["act-1", "Clinique privée"]]),
};

describe("formaterValeurDemande", () => {
  it("affiche les textes tels quels, tiret si vide ou absent", () => {
    expect(formaterValeurDemande("name", "Clinique Aurore", LIBELLES)).toBe("Clinique Aurore");
    expect(formaterValeurDemande("adresse", null, LIBELLES)).toBe("—");
    expect(formaterValeurDemande("ville", "   ", LIBELLES)).toBe("—");
  });
  it("formate les coordonnées à 6 décimales, tiret pour une valeur absente", () => {
    expect(formaterValeurDemande("coordonnees", { latitude: 9.537, longitude: -13.677 }, LIBELLES)).toBe("9.537000, -13.677000");
    expect(formaterValeurDemande("coordonnees", { latitude: null, longitude: null }, LIBELLES)).toBe("—, —");
    expect(formaterValeurDemande("coordonnees", "n'importe quoi", LIBELLES)).toBe("—");
  });
  it("traduit catégorie et activité en libellés, jamais d'identifiant brut", () => {
    expect(formaterValeurDemande("activite", { activite_categorie_id: "cat-1", activite_principale_id: "act-1" }, LIBELLES)).toBe("Santé › Clinique privée");
    const inconnu = formaterValeurDemande("activite", { activite_categorie_id: "cat-x", activite_principale_id: "act-1" }, LIBELLES);
    expect(inconnu).toBe("Catégorie inconnue › Clinique privée");
    expect(inconnu).not.toContain("cat-x");
    expect(formaterValeurDemande("activite", { activite_categorie_id: null, activite_principale_id: null }, LIBELLES)).toBe("—");
  });
});

describe("idsActiviteReferences / estChampDemande", () => {
  it("collecte les identifiants distincts des valeurs avant/après", () => {
    const ids = idsActiviteReferences([
      { activite_categorie_id: "cat-1", activite_principale_id: "act-1" },
      { activite_categorie_id: "cat-1", activite_principale_id: "act-2" },
      "texte", null,
    ]);
    expect(ids.categories).toEqual(["cat-1"]);
    expect(ids.activites.sort()).toEqual(["act-1", "act-2"]);
  });
  it("ne reconnaît que les champs prévus par la table", () => {
    for (const c of Object.keys(LIBELLE_CHAMP)) expect(estChampDemande(c)).toBe(true);
    for (const c of ["statut", "badge_verifie", "quartier", 3, null]) expect(estChampDemande(c)).toBe(false);
  });
});

describe("composerMessageExamen", () => {
  it("conforme : aucune action demandée, libellé du champ cité", async () => {
    const { composerMessageExamen } = await import("./changementsProfilAffichage");
    const m = composerMessageExamen("name", "conforme", null);
    expect(m).toContain("approuvé");
    expect(m).toContain("(Nom)");
    expect(m).toContain("visible par les citoyens");
    expect(m).toContain("Aucune action");
  });
  it("a_corriger : reprend le commentaire et renvoie vers l'écran Entreprise", async () => {
    const { composerMessageExamen } = await import("./changementsProfilAffichage");
    const m = composerMessageExamen("adresse", "a_corriger", "  Adresse incomplète  ");
    expect(m).toContain("n'a pas publié");
    expect(m).toContain("continuent de voir l'information précédente");
    expect(m).toContain("« Adresse incomplète »");
    expect(m).toContain("Entreprise");
  });
  it("tronque un commentaire trop long et tolère un champ inconnu", async () => {
    const { composerMessageExamen } = await import("./changementsProfilAffichage");
    const long = "x".repeat(500);
    const m = composerMessageExamen("inconnu", "a_corriger", long);
    expect(m).toContain("…");
    expect(m).toContain("(profil)");
    expect(m.length).toBeLessThan(500);
  });
});

describe("compléments répétables", () => {
  it("l'état se déduit du DERNIER événement, quel que soit l'ordre de réception", async () => {
    const { etatComplement } = await import("./changementsProfilAffichage");
    expect(etatComplement([])).toBe("aucun");
    expect(etatComplement([{ type: "complement_demande", created_at: "2026-10-20T10:00:00Z" }])).toBe("demande");
    expect(etatComplement([
      { type: "complement_fourni", created_at: "2026-10-20T11:00:00Z" },
      { type: "complement_demande", created_at: "2026-10-20T10:00:00Z" },
    ])).toBe("fourni");
    expect(etatComplement([
      { type: "complement_demande", created_at: "2026-10-20T10:00:00Z" },
      { type: "complement_fourni", created_at: "2026-10-20T11:00:00Z" },
      { type: "complement_demande", created_at: "2026-10-21T09:00:00Z" },
    ])).toBe("demande");
  });
  it("le message de complément cite le champ, le motif, les pièces attendues et rassure sur la valeur publiée", async () => {
    const { composerMessageComplement } = await import("./changementsProfilAffichage");
    const m = composerMessageComplement("name", "  Le RCCM porte l'ancien nom  ", ["Registre de Commerce (RCCM)"]);
    expect(m).toContain("(Nom)");
    expect(m).toContain("« Le RCCM porte l'ancien nom »");
    expect(m).toContain("Documents attendus : Registre de Commerce (RCCM).");
    expect(m).toContain("onglet Documents");
    expect(m).toContain("continuent de voir l'information précédente");
  });
  it("sans pièce précise : pas de phrase « Documents attendus » ; motif trop long tronqué", async () => {
    const { composerMessageComplement } = await import("./changementsProfilAffichage");
    expect(composerMessageComplement("ville", "Précisez", [])).not.toContain("Documents attendus");
    expect(composerMessageComplement("ville", "x".repeat(500), [])).toContain("…");
  });
});

describe("restriction d'accès (Lot 3)", () => {
  it("un événement acces_restreint ne change pas l'état d'un échange de complément", async () => {
    const { etatComplement } = await import("./changementsProfilAffichage");
    expect(etatComplement([{ type: "acces_restreint", created_at: "2026-10-20T10:00:00Z" }])).toBe("aucun");
    expect(etatComplement([
      { type: "complement_demande", created_at: "2026-10-20T10:00:00Z" },
      { type: "acces_restreint", created_at: "2026-10-20T11:00:00Z" },
    ])).toBe("demande");
  });
  it("le message de restriction cite le champ, le motif, la référence et la voie de révision", async () => {
    const { composerMessageRestriction } = await import("./changementsProfilAffichage");
    const m = composerMessageRestriction("name", "Documents non conformes", "SUS-2026-00000042", null);
    expect(m).toContain("(Nom)");
    expect(m).toContain("« Documents non conformes »");
    expect(m).toContain("SUS-2026-00000042");
    expect(m).toContain("jusqu'à nouvel ordre");
    expect(m).toContain("demander une révision");
    expect(composerMessageRestriction("ville", "x", "SUS-1", "2026-11-19T10:00:00Z")).toContain("jusqu'au");
    expect(composerMessageRestriction("ville", "x".repeat(500), "SUS-1", null)).toContain("…");
  });
});
