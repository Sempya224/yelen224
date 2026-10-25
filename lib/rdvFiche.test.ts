import { describe, it, expect } from "vitest";
import {
  ajouterPhrase, autresRdvMemeHeure, construireHistorique, heureFinPrevue, horodatageCourt, libelleParDefaut,
  LIMITE_LISTE_RDV, nuitsSejour, peutVoirDemande, plageHoraire, separerUrgent, statsClient, type RdvStat,
} from "@/lib/rdvFiche";

const iso = (hh: number, mm = 0, ss = 0) => new Date(Date.UTC(2026, 9, 21, hh, mm, ss)).toISOString();

describe("construireHistorique : dédoublonnage", () => {
  it("un fait écrit par trois sources devient une seule ligne, avec le nom du membre", () => {
    const h = construireHistorique(
      { created_at: iso(7), termine_at: iso(10, 0, 1) },
      [{ action: "termine", auteur_type: "institution", motif: null, created_at: iso(10, 0, 2) }],
      [{ action: "rdv_termine", membre_nom: "Aissatou Camara", created_at: iso(10, 0, 3) }],
    );
    expect(h.map((x) => x.type)).toEqual(["termine", "creation"]);
    expect(h[0]).toMatchObject({ label: "Rendez-vous terminé", acteur: "Aissatou Camara", acteurNomme: true });
  });

  it("deux faits de même type éloignés de plus de 2 minutes restent séparés", () => {
    const h = construireHistorique({}, [
      { action: "report", auteur_type: "citoyen", motif: "a", created_at: iso(8, 0) },
      { action: "report", auteur_type: "citoyen", motif: "b", created_at: iso(8, 5) },
    ], []);
    expect(h).toHaveLength(2);
  });

  it("deux types différents ne fusionnent jamais, même simultanés", () => {
    const h = construireHistorique({}, [
      { action: "confirmation", auteur_type: "institution", motif: null, created_at: iso(9) },
      { action: "preparation", auteur_type: "institution", motif: null, created_at: iso(9) },
    ], []);
    expect(h).toHaveLength(2);
  });

  it("sans nom de membre, l'acteur reste le rôle (événement) plutôt que rien", () => {
    const h = construireHistorique({ termine_at: iso(10) }, [{ action: "termine", auteur_type: "institution", motif: null, created_at: iso(10, 0, 5) }], []);
    expect(h[0].acteur).toBe("Votre établissement");
    expect(h[0].acteurNomme).toBe(false);
  });

  it("refus journalisé (rdv_refuse) et annulation (rdv_events) = un seul fait", () => {
    const h = construireHistorique({}, [{ action: "annulation", auteur_type: "institution", motif: "Complet", created_at: iso(9) }], [{ action: "rdv_refuse", membre_nom: "Mamadou Bah", created_at: iso(9, 0, 2) }]);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ type: "annulation", label: "Annulé par l'établissement", acteur: "Mamadou Bah" });
  });

  it("le long message d'annulation n'apparaît jamais dans l'historique", () => {
    const long = "Votre rendez-vous du 21/10/2026 a été annulé — ce n'est pas lié à vous. Vous pouvez réserver un nouveau créneau dès maintenant.";
    const h = construireHistorique({}, [{ action: "annulation", auteur_type: "system", motif: long, created_at: iso(9) }], []);
    expect(h[0].label).toBe("Annulé automatiquement par Yelen");
    expect(h[0].detail).toBeUndefined();
    expect(JSON.stringify(h)).not.toContain("ce n'est pas lié");
  });

  it("le motif d'absence est conservé comme détail", () => {
    const h = construireHistorique({}, [{ action: "absent", auteur_type: "institution", motif: "Ne s'est pas présenté", created_at: iso(11) }], []);
    expect(h[0].detail).toBe("Ne s'est pas présenté");
  });

  it("présence : colonne marquée absent → « absent », sinon « présence confirmée »", () => {
    expect(construireHistorique({ presence_status: "absent", presence_confirmed_at: iso(10) }, [], [])[0].type).toBe("absent");
    expect(construireHistorique({ presence_status: "present", presence_confirmed_at: iso(10) }, [], [])[0].type).toBe("presence");
  });

  it("ordre : du plus récent au plus ancien, dates invalides ignorées", () => {
    const h = construireHistorique({ created_at: iso(7), accepte_le: iso(8), termine_at: "pas une date" }, [], []);
    expect(h.map((x) => x.type)).toEqual(["accepte", "creation"]);
  });
});

describe("construireHistorique : libellés lisibles pour tous les codes", () => {
  const events = ["creation", "confirmation", "annulation", "report", "termine", "absent", "message", "depasse", "preparation", "inconnu_xyz"];
  const journal = ["rdv_accepte", "rdv_refuse", "rdv_termine", "rdv_absent", "rdv_confirme", "rdv_annule", "rdv_validation_annulee", "suivi_rdv_modifie", "rdv_code_secours_utilise"];

  it("aucun libellé ne contient de code brut (underscore ou préfixe rdv_)", () => {
    const h = construireHistorique(
      {},
      events.map((action, i) => ({ action, auteur_type: "institution", motif: null, created_at: iso(1, i * 5) })),
      journal.map((action, i) => ({ action, membre_nom: null, created_at: iso(3, i * 5) })),
    );
    expect(h.length).toBeGreaterThan(10);
    for (const x of h) {
      expect(x.label).not.toMatch(/_/);
      expect(x.label).not.toMatch(/^rdv/i);
      expect(x.label.charAt(0)).toBe(x.label.charAt(0).toUpperCase());
    }
  });

  it("libellés explicites des codes cités", () => {
    const h = construireHistorique({}, [], [
      { action: "rdv_confirme", membre_nom: null, created_at: iso(1) },
      { action: "rdv_annule", membre_nom: null, created_at: iso(2) },
      { action: "rdv_validation_annulee", membre_nom: null, created_at: iso(3) },
      { action: "suivi_rdv_modifie", membre_nom: null, created_at: iso(4) },
    ]);
    expect(h.map((x) => x.label)).toEqual(["Suivi modifié", "Validation annulée", "Rendez-vous annulé", "Présence confirmée"]);
  });

  it("repli générique", () => {
    expect(libelleParDefaut("rdv_code_secours_utilise")).toBe("Code secours utilise");
    expect(libelleParDefaut("rdv_")).toBe("Événement");
  });
});

describe("horodatageCourt (fuseau Conakry)", () => {
  it("jour et heure 12 h", () => {
    expect(horodatageCourt("2026-10-21T08:01:00Z")).toBe("21 oct., 8:01 AM");
    expect(horodatageCourt("2026-10-21T23:30:00Z")).toBe("21 oct., 11:30 PM");
    expect(horodatageCourt("nope")).toBe("");
  });
});

describe("statsClient", () => {
  const r = (over: Partial<RdvStat>): RdvStat => ({ id: Math.random().toString(), citoyen_id: "c1", statut: "termine", date_rdv: "2026-09-01", ...over });
  const liste: RdvStat[] = [
    r({ date_rdv: "2026-08-10" }),
    r({ statut: "termine" }),
    r({ statut: "en_attente", presence_status: "absent" }),
    r({ statut: "en_attente", presence_status: "absent" }),
    r({ statut: "annule", annule_par: "citoyen" }),
    r({ statut: "annule", annule_par: null }),
    r({ statut: "annule", annule_par: "institution" }),
    r({ statut: "annule", annule_par: "citoyen", presence_status: "absent" }),
    r({ citoyen_id: "autre" }),
  ];

  it("compteurs chez cet établissement", () => {
    expect(statsClient(liste, "c1")).toEqual({
      total: 8, termines: 2, absences: 3, annulationsCitoyen: 1, annulationsOrigineInconnue: 1, premierRdv: "2026-08-10", tronque: false, taillePeriode: 9,
    });
  });
  it("absences : presence_status = 'absent' uniquement — ni annulation auto, ni « non traité », ni autre citoyen", () => {
    const hier = "2020-01-01";
    const liste: RdvStat[] = [
      { id: "a", citoyen_id: "c1", statut: "en_attente", date_rdv: hier, heure_rdv: "10:00", presence_status: "absent" },
      // annulé automatiquement par Yelen (suspension) : pas une absence
      { id: "b", citoyen_id: "c1", statut: "annule", date_rdv: hier, heure_rdv: "10:00", annule_par: "system", presence_status: null },
      // jamais traité (« non traité » est dérivé, presence_status reste NULL) : pas une absence
      { id: "c", citoyen_id: "c1", statut: "en_attente", date_rdv: hier, heure_rdv: "10:00", presence_status: null },
      { id: "d", citoyen_id: "c1", statut: "nouveau", date_rdv: hier, heure_rdv: "10:00", presence_status: undefined },
      // présent : pas une absence
      { id: "e", citoyen_id: "c1", statut: "termine", date_rdv: hier, heure_rdv: "10:00", presence_status: "present" },
      // absence d'un autre citoyen : ignorée
      { id: "f", citoyen_id: "c2", statut: "en_attente", date_rdv: hier, heure_rdv: "10:00", presence_status: "absent" },
      // valeur voisine mais différente : ignorée
      { id: "g", citoyen_id: "c1", statut: "en_attente", date_rdv: hier, heure_rdv: "10:00", presence_status: "Absent" },
    ];
    const s = statsClient(liste, "c1");
    expect(s?.absences).toBe(1);
    expect(s?.taillePeriode).toBe(7);
  });
  it("citoyen supprimé (id null) : pas d'indicateurs", () => {
    expect(statsClient(liste, null)).toBeNull();
    expect(statsClient(liste, undefined)).toBeNull();
  });
  it("signale la troncature à 300 RDV", () => {
    const grosse = Array.from({ length: LIMITE_LISTE_RDV }, () => r({}));
    expect(statsClient(grosse, "c1")?.tronque).toBe(true);
    expect(statsClient(grosse.slice(1), "c1")?.tronque).toBe(false);
  });
});

describe("créneau", () => {
  it("autres RDV à la même heure : ignore soi-même, annulés et refusés", () => {
    const me = { id: "a", date_rdv: "2026-10-21", heure_rdv: "10:00:00" };
    const liste: RdvStat[] = [
      { id: "a", statut: "en_attente", date_rdv: "2026-10-21", heure_rdv: "10:00:00" },
      { id: "b", statut: "en_attente", date_rdv: "2026-10-21", heure_rdv: "10:00" },
      { id: "c", statut: "nouveau", date_rdv: "2026-10-21", heure_rdv: "10:00:00" },
      { id: "d", statut: "annule", date_rdv: "2026-10-21", heure_rdv: "10:00:00" },
      { id: "e", statut: "refuse", date_rdv: "2026-10-21", heure_rdv: "10:00:00" },
      { id: "f", statut: "en_attente", date_rdv: "2026-10-21", heure_rdv: "10:30:00" },
      { id: "g", statut: "en_attente", date_rdv: "2026-10-22", heure_rdv: "10:00:00" },
    ];
    expect(autresRdvMemeHeure(liste, me)).toBe(2);
  });
  it("heure de fin et plage en 12 h", () => {
    expect(heureFinPrevue("10:00:00", 30)).toBe("10:30");
    expect(heureFinPrevue("23:45", 30)).toBe("00:15");
    expect(heureFinPrevue("10:00", null)).toBeNull();
    expect(heureFinPrevue("10:00", 0)).toBeNull();
    expect(plageHoraire("10:00:00", 30)).toBe("10:00 AM – 10:30 AM");
    expect(plageHoraire("13:00", null)).toBe("1:00 PM");
    expect(plageHoraire("", 30)).toBe("—");
  });
  it("nuits du séjour", () => {
    expect(nuitsSejour("2026-11-03", "2026-11-06")).toBe(3);
    expect(nuitsSejour("2026-11-03", "2026-11-03")).toBeNull();
    expect(nuitsSejour("x", "2026-11-03")).toBeNull();
  });
});

describe("demande", () => {
  it("balise [URGENT] détectée puis retirée", () => {
    expect(separerUrgent("[URGENT] [Ouverture de compte]")).toEqual({ urgent: true, objet: "[Ouverture de compte]" });
    expect(separerUrgent("[Ouverture de compte] [urgent]")).toEqual({ urgent: true, objet: "[Ouverture de compte] [urgent]".replace(/\[urgent\]\s*/i, "").trim() });
    expect(separerUrgent("[Ouverture de compte]")).toEqual({ urgent: false, objet: "[Ouverture de compte]" });
    expect(separerUrgent(null)).toEqual({ urgent: false, objet: "" });
  });
});

describe("confidentialité de la demande", () => {
  it.each(["admin", "superviseur", "dirigeant", "agent"] as const)("%s voit la demande", (role) => expect(peutVoirDemande(role)).toBe(true));
  it.each(["comptable", null, undefined] as const)("%s ne la voit pas", (role) => expect(peutVoirDemande(role)).toBe(false));
});

describe("ajouterPhrase (consignes de préparation)", () => {
  const P = "Apportez votre pièce d'identité";
  it("première phrase : pas de séparateur superflu", () => {
    expect(ajouterPhrase("", P, 300)).toEqual({ texte: P, ajoute: true });
    expect(ajouterPhrase("   \n", P, 300)).toEqual({ texte: P, ajoute: true });
  });
  it("phrase suivante : séparée par « · » (jamais un saut de ligne), texte libre conservé", () => {
    const r = ajouterPhrase("Sonnez à la porte", P, 300);
    expect(r).toEqual({ texte: `Sonnez à la porte · ${P}`, ajoute: true });
    expect(r.texte).not.toContain("\n");
  });
  it("enchaîner deux ajouts ne double pas le séparateur", () => {
    const a = ajouterPhrase("", P, 300).texte;
    expect(ajouterPhrase(`${a} · `, "Arrivez 10 minutes avant", 300).texte).toBe(`${P} · Arrivez 10 minutes avant`);
  });
  it("jamais de doublon, à la casse et aux espaces près", () => {
    expect(ajouterPhrase(P, P, 300).ajoute).toBe(false);
    expect(ajouterPhrase("apportez  VOTRE pièce d'identité", P, 300).ajoute).toBe(false);
  });
  it("respecte la limite de caractères", () => {
    const presque = "x".repeat(290);
    expect(ajouterPhrase(presque, P, 300)).toEqual({ texte: presque, ajoute: false });
    expect(ajouterPhrase("", P, P.length).ajoute).toBe(true);
    expect(ajouterPhrase("", P, P.length - 1).ajoute).toBe(false);
  });
  it("ne modifie pas la valeur saisie à la main (pas de correction)", () => {
    expect(ajouterPhrase("2 etage", P, 300).texte).toBe(`2 etage · ${P}`);
  });
});
