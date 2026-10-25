// Moteur du rapport hebdomadaire — jeux d'essai documentés dans
// docs/rapport-hebdomadaire/AUDIT_LOT1.md (§7) et cas réels du lot du
// 15/09/2026 (V5/V6). Les valeurs attendues sont calculées à la main, pas
// recopiées de la sortie du moteur.
import { describe, it, expect } from "vitest";
import {
  calculerRapportHebdo, classerRdv, derniereSemaineComplete, periodeDepuisLundi,
  MOTIF_DONNEES_INSUFFISANTES,
  type AvisLigne, type EntreeRapportHebdo, type PaiementLigne, type RdvEvenementLigne, type RdvLigne,
} from "./rapportHebdo";

const MAINT = "2026-10-19T06:00:00.000Z";

let seq = 0;
function rdv(p: Partial<RdvLigne> = {}): RdvLigne {
  seq += 1;
  return {
    id: `auto-${seq}`, citoyen_id: null, date_rdv: "2026-10-14", heure_rdv: "10:00:00", statut: "en_attente",
    presence_status: null, created_at: "2026-10-13T08:00:00.000Z", accepte_le: null,
    non_traite_marque_le: null, annule_par: null, ...p,
  };
}
function evt(rdvId: string, action: string, auteur: string, ancien: string | null, nouveau: string | null, createdAt: string): RdvEvenementLigne {
  return { rdv_id: rdvId, action, auteur_type: auteur, ancien_statut: ancien, nouveau_statut: nouveau, created_at: createdAt };
}
function paiement(p: Partial<PaiementLigne>): PaiementLigne {
  seq += 1;
  return {
    id: `pb-${seq}`, citoyen_id: null, statut: "confirme", date_rdv: "2026-10-14", heure_rdv: "10:00:00",
    created_at: "2026-10-13T08:00:00.000Z", traite_le: null, montant_paye: null, montant_declare_citoyen: null,
    declare_le: null, service_id: "s1", service_nom: "Service", ...p,
  };
}
function avis(p: Partial<AvisLigne>): AvisLigne {
  seq += 1;
  return { id: `av-${seq}`, note: 5, created_at: "2026-10-13T08:00:00.000Z", masque: false, brouillon: false, reponse_institution: null, ...p };
}
function entree(lundi: string, p: Partial<EntreeRapportHebdo> = {}): EntreeRapportHebdo {
  return { lundi, maintenant: MAINT, rdv: [], evenements: [], paiements: [], avis: [], clientsServisAvant: [], ...p };
}

describe("Périodes lundi-dimanche (UTC)", () => {
  it("un lundi donne le dimanche suivant, 7 jours exacts", () => {
    const p = periodeDepuisLundi("2026-10-12");
    expect(p.dimanche).toBe("2026-10-18");
    expect(p.finMs - p.debutMs).toBe(7 * 86_400_000);
  });
  it("refuse une date qui n'est pas un lundi ou invalide", () => {
    expect(() => periodeDepuisLundi("2026-10-13")).toThrow("n'est pas un lundi");
    expect(() => periodeDepuisLundi("2026-02-30")).toThrow("Date invalide");
  });
  it("lundi 06:00 UTC -> semaine précédente complète", () => {
    expect(derniereSemaineComplete(new Date("2026-10-19T06:00:00.000Z")).lundi).toBe("2026-10-12");
  });
  it("dimanche soir -> la semaine en cours n'est pas terminée, on reste sur la précédente", () => {
    expect(derniereSemaineComplete(new Date("2026-10-18T23:00:00.000Z")).lundi).toBe("2026-10-05");
  });
  it("refuse de générer une semaine non terminée", () => {
    expect(() => calculerRapportHebdo({ ...entree("2026-10-12"), maintenant: "2026-10-18T12:00:00.000Z" })).toThrow("n'est pas terminée");
  });
  it("borne exacte : un instant à 00:00:00.000 du lundi suivant n'appartient pas à la semaine", () => {
    const r = calculerRapportHebdo(entree("2026-10-12", {
      rdv: [rdv({ id: "limite", created_at: "2026-10-19T00:00:00.000Z", date_rdv: "2026-10-19" })],
    }));
    expect(r.rdvGratuits.actuel.demandesRecues).toBe(0);
  });
});

describe("Exemple 1 — bloc RDV gratuits (AUDIT_LOT1 §7)", () => {
  const rows = [
    rdv({ id: "r1", citoyen_id: "c1", created_at: "2026-10-13T08:00:00.000Z", date_rdv: "2026-10-14", heure_rdv: "10:00:00", statut: "termine", presence_status: "present", accepte_le: "2026-10-13T09:00:00.000Z" }),
    rdv({ id: "r2", citoyen_id: "c2", created_at: "2026-10-13T08:30:00.000Z", date_rdv: "2026-10-14", heure_rdv: "11:00:00", statut: "termine", presence_status: "present", accepte_le: "2026-10-13T09:30:00.000Z" }),
    rdv({ id: "r3", citoyen_id: "c3", created_at: "2026-10-12T08:00:00.000Z", date_rdv: "2026-10-15", heure_rdv: "09:00:00", statut: "annule", accepte_le: "2026-10-12T09:00:00.000Z" }),
    rdv({ id: "r4", citoyen_id: "c4", created_at: "2026-10-14T08:00:00.000Z", date_rdv: "2026-10-16", heure_rdv: "09:00:00", statut: "en_attente", presence_status: "absent", accepte_le: "2026-10-14T09:00:00.000Z" }),
    rdv({ id: "r5", citoyen_id: "c5", created_at: "2026-10-15T08:00:00.000Z", date_rdv: "2026-10-20", heure_rdv: "09:00:00", statut: "nouveau" }),
    rdv({ id: "r6", citoyen_id: "c6", created_at: "2026-10-10T08:00:00.000Z", date_rdv: "2026-10-16", heure_rdv: "14:00:00", statut: "annule", accepte_le: "2026-10-10T09:00:00.000Z" }),
    rdv({ id: "r7", citoyen_id: "c7", created_at: "2026-10-08T08:00:00.000Z", date_rdv: "2026-10-13", heure_rdv: "09:00:00", statut: "annule", presence_status: "absent", accepte_le: "2026-10-08T09:00:00.000Z" }),
    rdv({ id: "r8", citoyen_id: "c8", created_at: "2026-10-16T10:00:00.000Z", date_rdv: "2026-10-17", heure_rdv: "08:00:00", statut: "nouveau", non_traite_marque_le: "2026-10-17T08:30:00.000Z" }),
  ];
  const evenements = [
    evt("r3", "annulation", "citoyen", "en_attente", "annule", "2026-10-14T08:00:00.000Z"),
    evt("r6", "annulation", "system", "en_attente", "annule", "2026-10-16T06:00:00.000Z"),
    evt("r7", "annulation", "system", "en_attente", "annule", "2026-10-15T09:00:00.000Z"),
  ];
  const r = calculerRapportHebdo(entree("2026-10-12", { rdv: rows, evenements, clientsServisAvant: ["c1"] }));
  const g = r.rdvGratuits.actuel;

  it("demandes reçues = 6 (created_at dans la semaine)", () => expect(g.demandesRecues).toBe(6));
  it("acceptations = 4 (accepte_le dans la semaine : r1, r2, r3, r4)", () => expect(g.acceptees).toBe(4));
  it("prestations réalisées = 2", () => expect(g.realisees).toBe(2));
  it("annulations hors suspension = 1, auteur citoyen", () => {
    expect(g.annulations.total).toBe(1);
    expect(g.annulations.citoyen).toBe(1);
  });
  it("annulation système AVANT l'heure du RDV = suspension (r6)", () => expect(g.annulationsParSuspension).toBe(1));
  it("annulation système APRÈS l'heure du RDV = écrasement : l'absence de r7 est conservée", () => {
    expect(classerRdv(rows[6], evenements.filter(e => e.rdv_id === "r7")).issue).toBe("absence");
    expect(g.absences).toBe(2);
  });
  it("non traités = 1 (marqueur dans la semaine)", () => expect(g.nonTraites).toBe(1));
  it("base 5 < 10 : aucun taux affiché, comptes bruts conservés", () => {
    expect(g.tauxRealisation).toMatchObject({ disponible: false, motif: MOTIF_DONNEES_INSUFFISANTES, base: 5 });
    expect(g.tauxAbsence).toMatchObject({ disponible: false, base: 5 });
    expect(g.tauxAnnulation).toMatchObject({ disponible: false, base: 6 });
  });
  it("clients : 2 servis, 1 nouveau (c2), 1 déjà connu (c1)", () => {
    expect(g.clientsDistinctsServis).toBe(2);
    expect(g.nouveauxClients).toBe(1);
    expect(g.clientsConnus).toBe(1);
  });
  it("créneaux : 09h en tête (r4 et r7), puis 08h et 10h", () => {
    expect(g.creneauxSollicites).toEqual([{ heure: "09", nb: 2 }, { heure: "08", nb: 1 }, { heure: "10", nb: 1 }]);
  });
  it("demande sans réponse > 24 h = 1 (r5) ; r8 exclu car déjà non traité", () => expect(r.rdvGratuits.demandesSansReponse24h).toBe(1));
  it("non traités sur 30 jours = 1", () => expect(r.nonTraites30Jours).toBe(1));
  it("plan d'action : non traités puis demandes sans réponse, rien d'autre", () => {
    expect(r.planAction.map(a => a.regle)).toEqual(["non_traites", "demandes_sans_reponse"]);
    expect(r.planAction[0].constat).toContain("1 rendez-vous non traité cette semaine (1 sur les 30 derniers jours)");
  });
  it("la semaine n'est pas vide", () => expect(r.vide).toBe(false));
});

describe("Cas réels du lot du 15/09/2026 (V5/V6)", () => {
  const ECRASEMENT = "2026-09-15T09:04:41.972Z";

  it("absence + écrasement après coup (RDV-2026-000001) : absence conservée, pas d'annulation", () => {
    const r = rdv({ id: "rdv1", statut: "annule", presence_status: "absent", date_rdv: "2026-07-21", heure_rdv: "15:00:00" });
    const c = classerRdv(r, [evt("rdv1", "annulation", "system", "en_attente", "annule", ECRASEMENT)]);
    expect(c.issue).toBe("absence");
  });
  it("annule + absent sans aucun événement (RDV-2026-000015) : absence", () => {
    const r = rdv({ id: "rdv15", statut: "annule", presence_status: "absent" });
    expect(classerRdv(r, []).issue).toBe("absence");
  });
  it("non traité écrasé (RDV-2026-000026) : classe non_traite_ecrase, jamais annulation", () => {
    const r = rdv({ id: "rdv26", statut: "annule", date_rdv: "2026-09-07", heure_rdv: "06:30:00", non_traite_marque_le: "2026-09-15T07:45:00.331Z" });
    expect(classerRdv(r, [evt("rdv26", "annulation", "system", "en_attente", "annule", ECRASEMENT)]).issue).toBe("non_traite_ecrase");
  });
  it("écrasement sans aucune trace d'origine : filet 'ecrasement_non_qualifie', hors taux", () => {
    const r = rdv({ id: "x", statut: "annule", date_rdv: "2026-09-07" });
    expect(classerRdv(r, [evt("x", "annulation", "system", "en_attente", "annule", ECRASEMENT)]).issue).toBe("ecrasement_non_qualifie");
  });
  it("événement d'annulation mais statut rétabli (RDV-2026-000029) : n'est PAS une annulation", () => {
    const r = rdv({ id: "rdv29", statut: "en_attente", date_rdv: "2026-09-14", heure_rdv: "06:30:00", accepte_le: "2026-09-14T08:22:17.542Z", non_traite_marque_le: "2026-09-15T07:45:00.331Z" });
    expect(classerRdv(r, [evt("rdv29", "annulation", "system", "en_attente", "annule", ECRASEMENT)]).issue).toBe("autre");
  });
  it("suspension réelle (RDV-2026-000031) : événement 08:53 avant le RDV de 10:50", () => {
    const r = rdv({ id: "rdv31", statut: "annule", date_rdv: "2026-09-15", heure_rdv: "10:50:00" });
    expect(classerRdv(r, [evt("rdv31", "annulation", "system", "nouveau", "annule", "2026-09-15T08:53:35.891Z")]).issue).toBe("suspension");
  });
  it("semaine du 14/09 : 2 non traités, 0 annulation, 1 suspension, aucune absence", () => {
    const rows = [
      rdv({ id: "rdv29", statut: "en_attente", date_rdv: "2026-09-14", heure_rdv: "06:30:00", created_at: "2026-09-14T07:14:44.452Z", accepte_le: "2026-09-14T08:22:17.542Z", non_traite_marque_le: "2026-09-15T07:45:00.331Z" }),
      rdv({ id: "rdv30", statut: "annule", date_rdv: "2026-09-15", heure_rdv: "07:00:00", created_at: "2026-09-15T07:22:44.137Z", non_traite_marque_le: "2026-09-15T07:45:00.331Z" }),
      rdv({ id: "rdv31", statut: "annule", date_rdv: "2026-09-15", heure_rdv: "10:50:00", created_at: "2026-09-15T06:00:00.000Z" }),
    ];
    const evts = [
      evt("rdv29", "annulation", "system", "en_attente", "annule", ECRASEMENT),
      evt("rdv30", "annulation", "system", "nouveau", "annule", ECRASEMENT),
      evt("rdv31", "annulation", "system", "nouveau", "annule", "2026-09-15T08:53:35.891Z"),
    ];
    const r = calculerRapportHebdo({ ...entree("2026-09-14", { rdv: rows, evenements: evts }), maintenant: "2026-09-21T06:00:00.000Z" });
    const g = r.rdvGratuits.actuel;
    expect(g.nonTraites).toBe(2);
    expect(g.annulations.total).toBe(0);
    expect(g.annulationsParSuspension).toBe(1);
    expect(g.absences).toBe(0);
    expect(r.nonTraites30Jours).toBe(2);
    expect(r.planAction[0].regle).toBe("non_traites");
  });
  it("les non traités se mesurent à la date de marquage, pas à la date du RDV (RDV du 07/09 marqué le 15/09)", () => {
    const rows = [rdv({ id: "rdv26", statut: "annule", date_rdv: "2026-09-07", heure_rdv: "06:30:00", created_at: "2026-09-06T08:51:18.267Z", non_traite_marque_le: "2026-09-15T07:45:00.331Z" })];
    const evts = [evt("rdv26", "annulation", "system", "en_attente", "annule", ECRASEMENT)];
    const semaine07 = calculerRapportHebdo({ ...entree("2026-09-07", { rdv: rows, evenements: evts }), maintenant: "2026-09-21T06:00:00.000Z" });
    const semaine14 = calculerRapportHebdo({ ...entree("2026-09-14", { rdv: rows, evenements: evts }), maintenant: "2026-09-21T06:00:00.000Z" });
    expect(semaine07.rdvGratuits.actuel.nonTraites).toBe(0);
    expect(semaine14.rdvGratuits.actuel.nonTraites).toBe(1);
    expect(semaine07.rdvGratuits.actuel.annulations.total).toBe(0);
  });
});

describe("Exemple 2 — seuil de 10 observations", () => {
  function lot(n: number, date: string, created: string, termines: number): RdvLigne[] {
    return Array.from({ length: n }, (_, i) => rdv({
      date_rdv: date, created_at: created, accepte_le: created,
      statut: i < termines ? "termine" : "en_attente", presence_status: i < termines ? "present" : null,
    }));
  }

  it("12 échus acceptés dont 9 réalisés : taux de réalisation 75 % affiché ; semaine précédente 8 : tendance masquée", () => {
    const rows = [...lot(12, "2026-10-14", "2026-10-13T08:00:00.000Z", 9), ...lot(8, "2026-10-07", "2026-10-06T08:00:00.000Z", 8)];
    const r = calculerRapportHebdo(entree("2026-10-12", { rdv: rows }));
    expect(r.rdvGratuits.actuel.tauxRealisation).toEqual({ disponible: true, pct: 75, numerateur: 9, base: 12 });
    expect(r.rdvGratuits.precedent.tauxRealisation.disponible).toBe(false);
    expect(r.rdvGratuits.variations.tauxRealisation).toEqual({ disponible: false, motif: MOTIF_DONNEES_INSUFFISANTES });
    expect(r.rdvGratuits.variations.demandesRecues).toEqual({ disponible: false, motif: MOTIF_DONNEES_INSUFFISANTES });
  });
  it("variation des demandes affichée quand les deux semaines ont >= 10 observations : 12 vs 10 = +20 %", () => {
    const rows = [...lot(12, "2026-10-14", "2026-10-13T08:00:00.000Z", 0), ...lot(10, "2026-10-07", "2026-10-06T08:00:00.000Z", 0)];
    const r = calculerRapportHebdo(entree("2026-10-12", { rdv: rows }));
    expect(r.rdvGratuits.variations.demandesRecues).toEqual({ disponible: true, pct: 20 });
  });
  it("règle d'annulation : 30 % vs 10 % sur 10 RDV chaque semaine -> +20 points et action au plan", () => {
    const sem = (date: string, annules: number) => Array.from({ length: 10 }, (_, i) => rdv({
      date_rdv: date, created_at: "2026-10-01T08:00:00.000Z",
      statut: i < annules ? "annule" : "termine", annule_par: i < annules ? "citoyen" : null, presence_status: i < annules ? null : "present",
    }));
    const r = calculerRapportHebdo(entree("2026-10-12", { rdv: [...sem("2026-10-14", 3), ...sem("2026-10-07", 1)] }));
    expect(r.rdvGratuits.actuel.tauxAnnulation).toMatchObject({ disponible: true, pct: 30 });
    expect(r.rdvGratuits.variations.tauxAnnulation).toEqual({ disponible: true, points: 20 });
    const regle = r.planAction.find(a => a.regle === "annulations");
    expect(regle?.constat).toContain("30 %");
    expect(regle?.constat).toContain("+20 points");
    expect(regle?.hypothese).toContain("à vérifier");
  });
  it("le plan d'action ne dépasse jamais 3 priorités", () => {
    // 4 règles déclenchées : non traités, demande sans réponse, avis bas, paiement non traité.
    const rows = [
      ...Array.from({ length: 4 }, () => rdv({ statut: "nouveau", non_traite_marque_le: "2026-10-14T09:00:00.000Z", date_rdv: "2026-10-13", created_at: "2026-10-12T08:00:00.000Z" })),
      rdv({ statut: "nouveau", date_rdv: "2026-10-25", created_at: "2026-10-17T08:00:00.000Z" }),
    ];
    const avisBas = [avis({ note: 1 })];
    const attente = [paiement({ statut: "en_attente", date_rdv: "2026-10-13", montant_paye: 1000 })];
    const r = calculerRapportHebdo(entree("2026-10-12", { rdv: rows, avis: avisBas, paiements: attente }));
    expect(r.planAction.length).toBe(3);
    expect(r.planAction.map(a => a.regle)).toEqual(["non_traites", "demandes_sans_reponse", "avis_sans_reponse"]);
  });
});

describe("Exemple 3 — bloc payant et séparation stricte", () => {
  const paiements = [
    paiement({ id: "b1", citoyen_id: "cA", statut: "confirme", montant_paye: 2000, traite_le: "2026-10-14T10:00:00.000Z", created_at: "2026-10-13T08:00:00.000Z", date_rdv: "2026-10-15", heure_rdv: "10:00:00", service_id: "s1", service_nom: "Chambre" }),
    paiement({ id: "b2", citoyen_id: "cB", statut: "confirme", montant_paye: 3000, traite_le: null, created_at: "2026-10-15T09:00:00.000Z", date_rdv: "2026-10-16", heure_rdv: "09:00:00", service_id: "s1", service_nom: "Chambre" }),
    paiement({ id: "b3", citoyen_id: "cC", statut: "termine", montant_paye: 1000, traite_le: "2026-10-16T10:00:00.000Z", created_at: "2026-10-10T08:00:00.000Z", date_rdv: "2026-10-16", heure_rdv: "09:00:00", service_id: "s2", service_nom: "Petit-déjeuner" }),
    paiement({ id: "b4", citoyen_id: "cD", statut: "no_show", montant_paye: 2000, traite_le: null, created_at: "2026-10-11T08:00:00.000Z", date_rdv: "2026-10-13", heure_rdv: "09:00:00" }),
    paiement({ id: "b5", citoyen_id: "cE", statut: "en_attente", montant_paye: 1500, traite_le: null, created_at: "2026-10-17T08:00:00.000Z", date_rdv: "2026-10-17", heure_rdv: "08:00:00" }),
  ];
  // RDV gratuits jumeaux : b1 -> 1 candidat ; b2 -> 2 candidats ; b4 -> 1 ; b3 et b5 -> aucun.
  const rdvJumeaux = [
    rdv({ id: "j1", citoyen_id: "cA", date_rdv: "2026-10-15", heure_rdv: "10:00:00" }),
    rdv({ id: "j2a", citoyen_id: "cB", date_rdv: "2026-10-16", heure_rdv: "09:00:00" }),
    rdv({ id: "j2b", citoyen_id: "cB", date_rdv: "2026-10-16", heure_rdv: "09:00:00" }),
    rdv({ id: "j4", citoyen_id: "cD", date_rdv: "2026-10-13", heure_rdv: "09:00:00" }),
  ];
  const r = calculerRapportHebdo(entree("2026-10-12", { paiements, rdv: rdvJumeaux }));
  const p = r.paiements.actuel;

  it("encaissé = 2000 (traite_le) + 3000 (repli created_at) + 1000 = 6000 sur 3 paiements", () => {
    expect(p.encaisse).toEqual({ montant: 6000, nbEncaissements: 3 });
  });
  it("panier moyen 2000 avec sa base (3)", () => expect(p.panierMoyen).toEqual({ valeur: 2000, base: 3 }));
  it("no-show payant à part (2000), jamais dans l'encaissé", () => expect(p.noShow).toEqual({ nb: 1, montant: 2000 }));
  it("réservations reçues = 3 (b1, b2, b5)", () => expect(p.reservationsRecues).toBe(3));
  it("réservation non traitée instantanée : b5, 1500 enregistrés, non encaissés", () => {
    expect(r.paiements.reservationsNonTraitees).toEqual({ nb: 1, montant: 1500 });
  });
  it("services encaissés triés par montant : Chambre 5000 (2), Petit-déjeuner 1000 (1)", () => {
    expect(p.servicesEncaisses.map(s => [s.nom, s.nb, s.montant])).toEqual([["Chambre", 2, 5000], ["Petit-déjeuner", 1, 1000]]);
  });
  it("variation de revenu non affichée (3 paiements < 10)", () => {
    expect(r.paiements.variations.encaisse).toEqual({ disponible: false, motif: MOTIF_DONNEES_INSUFFISANTES });
  });
  it("rapprochement : 2 confirmés (b1, b4), 1 ambigu (b2), 2 sans RDV (b3, b5)", () => {
    expect(r.rapprochementPaiementsRdv).toEqual({ confirme: 2, ambigu: 1, sansRdv: 2, total: 5 });
  });
  it("aucune addition des deux systèmes : 4 RDV gratuits reçus, 3 réservations payantes, aucun champ 'total' fusionné", () => {
    expect(r.rdvGratuits.actuel.demandesRecues).toBe(4);
    expect(r.paiements.actuel.reservationsRecues).toBe(3);
    expect(Object.keys(r.rdvGratuits.actuel)).not.toContain("total");
    expect(Object.keys(r.paiements.actuel)).not.toContain("total");
    expect(JSON.stringify(r)).not.toContain("consolide");
  });
  it("le statut 'rembourse' sort de l'encaissé et est compté à part", () => {
    const rr = calculerRapportHebdo(entree("2026-10-12", {
      paiements: [paiement({ statut: "rembourse", montant_paye: 4000, traite_le: "2026-10-14T10:00:00.000Z" })],
    }));
    expect(rr.paiements.actuel.encaisse).toEqual({ montant: 0, nbEncaissements: 0 });
    expect(rr.paiements.actuel.rembourse).toEqual({ nb: 1, montant: 4000 });
    expect(rr.paiements.actuel.panierMoyen).toBeNull();
  });
  it("montant déclaré par le client : compté à part et jamais encaissé", () => {
    const rr = calculerRapportHebdo(entree("2026-10-12", {
      paiements: [paiement({ statut: "en_attente", montant_paye: null, montant_declare_citoyen: 2500, declare_le: "2026-10-14T10:00:00.000Z", date_rdv: "2026-10-30" })],
    }));
    expect(rr.paiements.actuel.declareParClient).toEqual({ nb: 1, montant: 2500 });
    expect(rr.paiements.actuel.encaisse.montant).toBe(0);
  });
  it("une ligne confirmée sans montant n'entre ni dans l'encaissé ni dans le panier moyen", () => {
    const rr = calculerRapportHebdo(entree("2026-10-12", {
      paiements: [paiement({ statut: "confirme", montant_paye: null, traite_le: "2026-10-14T10:00:00.000Z" })],
    }));
    expect(rr.paiements.actuel.encaisse.nbEncaissements).toBe(0);
  });
});

describe("Avis", () => {
  it("exclut masqués et brouillons ; note moyenne avec le nombre ; basses sans réponse", () => {
    const r = calculerRapportHebdo(entree("2026-10-12", {
      avis: [
        avis({ note: 5 }),
        avis({ note: 2 }),
        avis({ note: 1, reponse_institution: "Merci pour votre retour" }),
        avis({ note: 4, masque: true }),
        avis({ note: 3, brouillon: true }),
        avis({ note: 4, created_at: "2026-10-05T08:00:00.000Z" }),
      ],
    }));
    expect(r.avis).toEqual({ nouveaux: 3, noteMoyenne: 2.7, notesBasses: 2, notesBassesSansReponse: 1 });
    expect(r.planAction.map(a => a.regle)).toContain("avis_sans_reponse");
  });
  it("aucun avis : note moyenne null (non mesurable), jamais 0", () => {
    const r = calculerRapportHebdo(entree("2026-10-12", { rdv: [rdv()] }));
    expect(r.avis.noteMoyenne).toBeNull();
  });
});

describe("Exemple 4 — semaine vide", () => {
  const r = calculerRapportHebdo(entree("2026-10-12"));
  it("marquée vide, bilan explicite, aucune action", () => {
    expect(r.vide).toBe(true);
    expect(r.bilan).toContain("Aucune activité enregistrée sur la période.");
    expect(r.planAction).toEqual([]);
  });
  it("aucun taux n'est présenté comme un zéro : tous indisponibles", () => {
    expect(r.rdvGratuits.actuel.tauxRealisation.disponible).toBe(false);
    expect(r.paiements.actuel.panierMoyen).toBeNull();
  });
  it("porte la version du calcul et les dates affichées", () => {
    expect(r.version).toBe(1);
    expect(r.periode).toEqual({ lundi: "2026-10-12", dimanche: "2026-10-18" });
    expect(r.bilan[0]).toBe("Période : du lundi 12/10/2026 au dimanche 18/10/2026.");
  });
  it("une activité hors période ne rend pas la semaine non vide", () => {
    const hors = calculerRapportHebdo(entree("2026-10-12", { rdv: [rdv({ created_at: "2026-09-01T08:00:00.000Z", date_rdv: "2026-09-02" })] }));
    expect(hors.vide).toBe(true);
  });
});
