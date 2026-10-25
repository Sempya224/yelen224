import { describe, it, expect } from "vitest";
import { controlesValidation, raisonBlocage, interpreterErreur, lireEtat, type EntreeControles } from "./ValiderRdvUi";

// ─────────────────────────────────────────────────────────────────────────
// Mission B, étape B1 (22/10/2026) — logique pure de la fiche de validation :
// contrôles réels avec raison d'échec, raison de blocage du bouton, lecture des
// erreurs serveur. L'horloge est toujours injectée. Données fictives.
// ─────────────────────────────────────────────────────────────────────────

const JOUR = "2026-08-06";
// Heures locales (le gating serveur raisonne en heure locale, comme ces tests).
// Rendez-vous à 12:30 : le créneau s'ouvre à 12:20.
const midi = new Date(2026, 7, 6, 12, 25);
const onzeHeures = new Date(2026, 7, 6, 11, 0);
const lendemain = new Date(2026, 7, 7, 9, 0);

function entree(extra: Partial<EntreeControles> = {}): EntreeControles {
  return {
    statut: "en_attente", date_rdv: JOUR, heure_rdv: "12:30:00", date_depart: null, service_prix: 2000,
    declare_le: "2026-08-06T10:15:00Z", montant_declare: 2000, prix_courant: 2000, ...extra,
  };
}
const parId = (c: ReturnType<typeof controlesValidation>, id: string) => c.find((x) => x.id === id)!;

describe("controlesValidation", () => {
  it("jour du rendez-vous, créneau ouvert, déclaration reçue : tout est conforme", () => {
    const c = controlesValidation(entree(), midi);
    expect(c.map((x) => x.etat)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(raisonBlocage(c, { traiter: true }, false)).toBeNull();
  });

  it("citoyen en avance : le créneau échoue avec l'heure d'ouverture, le bouton est bloqué", () => {
    const c = controlesValidation(entree(), onzeHeures);
    expect(parId(c, "aujourdhui").etat).toBe("ok");
    expect(parId(c, "creneau")).toMatchObject({ etat: "echec", bloquant: true });
    expect(parId(c, "creneau").detail).toContain("Ouvre à 12:20");
    expect(raisonBlocage(c, { traiter: true }, false)).toContain("Ouvre à 12:20");
  });

  it("journée terminée : ni aujourd'hui ni créneau, raison explicite", () => {
    const c = controlesValidation(entree(), lendemain);
    expect(parId(c, "aujourdhui").etat).toBe("echec");
    expect(parId(c, "creneau").detail).toBe("La journée du rendez-vous est terminée");
    expect(raisonBlocage(c, { traiter: true }, false)).toBe("La journée du rendez-vous est terminée");
  });

  it("déclaration manquante sur un service payant : échec bloquant avec la raison", () => {
    const c = controlesValidation(entree({ declare_le: null, montant_declare: null }), midi);
    expect(parId(c, "declaration")).toMatchObject({ etat: "echec", bloquant: true });
    expect(parId(c, "montant").etat).toBe("na");
    expect(raisonBlocage(c, { traiter: true }, false)).toBe("Le citoyen n'a pas encore déclaré remettre le paiement");
  });

  it("service sans paiement : déclaration et montant sans objet, rien ne bloque", () => {
    const c = controlesValidation(entree({ service_prix: 0, declare_le: null, montant_declare: null, prix_courant: 0 }), midi);
    expect(parId(c, "declaration").etat).toBe("na");
    expect(raisonBlocage(c, { traiter: true }, false)).toBeNull();
  });

  it("montant déclaré différent du prix actuel : avertissement chiffré, jamais bloquant", () => {
    const c = controlesValidation(entree({ montant_declare: 2000, prix_courant: 2500 }), midi);
    const montant = parId(c, "montant");
    expect(montant).toMatchObject({ etat: "attention", bloquant: false });
    expect(montant.detail).toContain("Déclaré");
    expect(montant.detail).toContain("prix actuel");
    expect(montant.detail).toMatch(/écart \+500/);
    expect(raisonBlocage(c, { traiter: true }, false)).toBeNull();
  });

  it("prix actuel plus bas que le montant déclaré : écart négatif", () => {
    const montant = parId(controlesValidation(entree({ montant_declare: 2500, prix_courant: 2000 }), midi), "montant");
    expect(montant.detail).toMatch(/écart −500/);
  });

  it("réservation déjà traitée (y compris un statut inconnu comme « rembourse ») : bloquée", () => {
    for (const statut of ["confirme", "annule", "no_show", "rembourse"]) {
      const c = controlesValidation(entree({ statut }), midi);
      expect(parId(c, "attente")).toMatchObject({ etat: "echec", bloquant: true });
      expect(raisonBlocage(c, { traiter: true }, false)).toBe("Cette réservation a déjà été traitée");
    }
  });

  it("réservation d'hôtel : libellé d'arrivée", () => {
    const c = controlesValidation(entree({ date_depart: "2026-08-08" }), midi);
    expect(parId(c, "aujourdhui").label).toBe("Arrivée aujourd'hui");
  });
});

describe("raisonBlocage", () => {
  const ok = controlesValidation(entree(), midi);

  it("établissement suspendu : prioritaire", () => {
    expect(raisonBlocage(ok, { traiter: true }, true)).toContain("suspendu");
  });
  it("rôle sans droit de traiter", () => {
    expect(raisonBlocage(ok, { traiter: false }, false)).toContain("rôle");
  });
  it("suspension inconnue (null) ou droits inconnus (null) : ne bloque pas, le serveur tranchera", () => {
    expect(raisonBlocage(ok, null, null)).toBeNull();
  });
});

describe("interpreterErreur", () => {
  it("coupure réseau (status 0)", () => {
    expect(interpreterErreur(0, null)).toMatchObject({ genre: "reseau" });
  });
  it("401 : session expirée", () => {
    expect(interpreterErreur(401, { error: "Non authentifié" }).genre).toBe("session");
  });
  it("429 : message neutre du serveur et délai", () => {
    const e = interpreterErreur(429, { error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "TROP_DE_TENTATIVES" }, 60);
    expect(e).toMatchObject({ genre: "tentatives", message: "Trop de tentatives. Réessayez dans quelques minutes.", retrySecondes: 60 });
    expect(interpreterErreur(429, null).retrySecondes).toBe(60);
  });
  it("PRIX_MODIFIE et MONTANT_VU_DIFFERENT : « Rouvrez la fiche pour vérifier le montant »", () => {
    for (const code of ["PRIX_MODIFIE", "MONTANT_VU_DIFFERENT"]) {
      const e = interpreterErreur(409, { code, error: "texte serveur" });
      expect(e.genre).toBe("montant");
      expect(e.message).toContain("Rouvrez la fiche pour vérifier le montant");
    }
  });
  it("DEJA_TRAITEE : l'état réel est récupéré (etat, sinon statut_actuel)", () => {
    const avecEtat = interpreterErreur(409, { code: "DEJA_TRAITEE", etat: { statut: "confirme", traite_le: "2026-08-06T10:00:00Z" } });
    expect(avecEtat).toMatchObject({ genre: "deja_traitee", etat: { statut: "confirme", traite_le: "2026-08-06T10:00:00Z" } });
    expect(interpreterErreur(409, { code: "DEJA_TRAITEE", statut_actuel: "annule" }).etat?.statut).toBe("annule");
  });
  it("ANNULATION_PAYEE, RECU_ARCHIVE_EXISTANT, CODE_EN_DOUBLE : message du serveur tel quel", () => {
    for (const code of ["ANNULATION_PAYEE", "RECU_ARCHIVE_EXISTANT", "CODE_EN_DOUBLE"]) {
      const e = interpreterErreur(409, { code, error: `Message exact ${code}` });
      expect(e).toMatchObject({ genre: "message_serveur", message: `Message exact ${code}` });
    }
  });
  it("hors créneau (403) : titre et message conservés", () => {
    const e = interpreterErreur(403, { hors_creneau: true, titre: "Le citoyen est en avance", error: "Trop tôt" });
    expect(e).toMatchObject({ genre: "hors_creneau", titre: "Le citoyen est en avance", message: "Trop tôt" });
  });
  it("autres erreurs : message du serveur, sinon message générique", () => {
    expect(interpreterErreur(500, { error: "Erreur serveur" })).toMatchObject({ genre: "generique", message: "Erreur serveur" });
    expect(interpreterErreur(500, null).message).toBe("Erreur lors de la mise à jour.");
  });
});

describe("lireEtat", () => {
  it("lit l'état complet et ignore les types inattendus", () => {
    expect(lireEtat({ statut: "confirme", traite_le: "2026-08-06T10:00:00Z", montant_paye: 2000, montant_declare: 2000, declare_le: "x", rdv_id: "r1" }))
      .toEqual({ statut: "confirme", traite_le: "2026-08-06T10:00:00Z", montant_paye: 2000, montant_declare: 2000, declare_le: "x", rdv_id: "r1" });
    expect(lireEtat({ statut: "rembourse", traite_le: 5 })?.traite_le).toBeNull();
  });
  it("sans statut : null", () => {
    expect(lireEtat(null)).toBeNull();
    expect(lireEtat({ traite_le: "x" })).toBeNull();
  });
});
