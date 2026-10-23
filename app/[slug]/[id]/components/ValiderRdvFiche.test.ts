import { describe, it, expect } from "vitest";
import { badgeEtat, situationFiche, montantEncaisse, dateComplete, nombreNuits, libelleStatut, libelleResultat, type BookingFound } from "./ValiderRdvFiche";

// ─────────────────────────────────────────────────────────────────────────
// Mission B, étape B2 (23/10/2026) — logique pure de la fiche : badge d'état
// unique, bandeau de situation, montant à encaisser, dates. Données fictives.
// ─────────────────────────────────────────────────────────────────────────

const maintenant = new Date(2026, 7, 6, 12, 25);

function reservation(extra: Partial<BookingFound> = {}): BookingFound {
  return {
    id: "B1", confirmation_code: "111111", statut: "en_attente", rdv_lie: true, date_rdv: "2026-08-06", heure_rdv: "12:30:00",
    date_depart: null, traite_le: null, montant_declare_citoyen: 2000, montant_declare: 2000, prix_courant: 2000,
    declare_le: "2026-08-06T10:15:00Z", pour_autre: false, nom_autre: null, phone_autre: null,
    service_nom: "Transfert d'argent", service_prix: 2000, service_duree: 30,
    citoyen_prenom: "Aïssatou", citoyen_nom: "Test", citoyen_phone: "+224600000001", citoyen_photo_url: null,
    identite_verifiee: null, historique: null, recu_id: null, reference: null, guichet: null, instructions_accueil: null,
    droits: { traiter: true, annuler_validation: false }, etablissement_suspendu: false,
    ...extra,
  };
}

describe("badgeEtat", () => {
  it("en attente : « À encaisser » une fois la déclaration reçue, « En attente de déclaration » sinon", () => {
    expect(badgeEtat(reservation())).toEqual({ label: "À encaisser", ton: "info" });
    expect(badgeEtat(reservation({ declare_le: null }))).toEqual({ label: "En attente de déclaration", ton: "attention" });
  });
  it("service sans paiement : pas d'attente de déclaration", () => {
    expect(badgeEtat(reservation({ service_prix: 0, declare_le: null })).label).toBe("À encaisser");
  });
  it("statuts traités", () => {
    expect(badgeEtat(reservation({ statut: "confirme" }))).toEqual({ label: "Paiement validé", ton: "succes" });
    expect(badgeEtat(reservation({ statut: "no_show" })).label).toBe("Absent");
    expect(badgeEtat(reservation({ statut: "annule" }))).toEqual({ label: "Annulé", ton: "danger" });
    expect(badgeEtat(reservation({ statut: "termine" })).label).toBe("Déjà traitée");
  });
  it("statut non géré (« rembourse » ou inconnu) : repli neutre, jamais d'erreur", () => {
    for (const statut of ["rembourse", "autre", ""]) {
      expect(badgeEtat(reservation({ statut }))).toEqual({ label: "Statut inconnu", ton: "neutre" });
      expect(libelleStatut(statut)).toBe("Statut inconnu");
    }
  });
});

describe("situationFiche", () => {
  const dispo = { maintenant, checkIn: "CHECK_IN_AVAILABLE" as const };

  it("prêt à encaisser : montant déclaré dans le titre", () => {
    const s = situationFiche(reservation({ montant_declare: 2500 }), dispo);
    expect(s.ton).toBe("succes");
    expect(s.titre).toContain("Prêt à encaisser");
    expect(s.titre).toContain("2");
    expect(s.titre).toContain("500");
  });
  it("déclaration manquante : en attente de la déclaration du citoyen", () => {
    expect(situationFiche(reservation({ declare_le: null }), dispo)).toMatchObject({ ton: "attention", titre: "En attente de la déclaration du citoyen" });
  });
  it("citoyen en avance : avertissement avec la règle des 10 minutes", () => {
    const s = situationFiche(reservation(), { maintenant, checkIn: "CHECK_IN_NOT_YET_AVAILABLE" });
    expect(s).toMatchObject({ ton: "attention", titre: "Le citoyen est en avance" });
    expect(s.detail).toContain("10 minutes");
  });
  it("hôtel en avance : la date d'arrivée est donnée", () => {
    const s = situationFiche(reservation({ date_depart: "2026-08-08" }), { maintenant, checkIn: "CHECK_IN_NOT_YET_AVAILABLE" });
    expect(s.detail).toContain("Arrivée prévue le");
    expect(s.detail).toContain("2026");
  });
  it("journée terminée : rendez-vous expiré, ton danger", () => {
    expect(situationFiche(reservation(), { maintenant, checkIn: "CHECK_IN_EXPIRED" })).toMatchObject({ ton: "danger", titre: "Rendez-vous expiré" });
  });
  it("établissement suspendu : prioritaire sur le reste", () => {
    expect(situationFiche(reservation({ etablissement_suspendu: true }), { maintenant, checkIn: "CHECK_IN_EXPIRED" }).titre).toBe("Établissement suspendu");
  });
  it("rôle sans droit de traiter : lecture seule", () => {
    expect(situationFiche(reservation({ droits: { traiter: false, annuler_validation: false } }), dispo)).toMatchObject({ ton: "neutre", titre: "Lecture seule" });
  });
  it("déjà traitée : l'état réel et l'heure de traitement", () => {
    const s = situationFiche(reservation({ statut: "confirme", traite_le: "2026-08-06T12:26:00Z" }), dispo);
    expect(s).toMatchObject({ ton: "succes", titre: "Paiement validé" });
    expect(s.detail).toContain("Traité à");
  });
  it("statut non géré : message neutre, aucune action d'encaissement", () => {
    const s = situationFiche(reservation({ statut: "rembourse" }), dispo);
    expect(s).toMatchObject({ ton: "neutre", titre: "Statut non géré par cet écran" });
  });
});

describe("montantEncaisse", () => {
  it("montant déclaré s'il existe, sinon prix actuel", () => {
    expect(montantEncaisse({ declare_le: "x", montant_declare: 1500, service_prix: 2000 })).toBe(1500);
    expect(montantEncaisse({ declare_le: null, montant_declare: null, service_prix: 2000 })).toBe(2000);
    expect(montantEncaisse({ declare_le: "x", montant_declare: null, service_prix: 2000 })).toBe(2000);
  });
});

describe("libelleResultat", () => {
  const b = { service_prix: 2000, declare_le: "x", montant_declare: 2000 };
  it("paiement validé : montant et heure", () => {
    const t = libelleResultat(b, "confirme", "2:58 PM");
    expect(t).toMatch(/^Paiement validé · 2.000 GNF · 2:58 PM$/);
  });
  it("service sans paiement, absence, annulation", () => {
    expect(libelleResultat({ ...b, service_prix: 0 }, "confirme", "2:58 PM")).toBe("Présence confirmée · 2:58 PM");
    expect(libelleResultat(b, "no_show", "2:58 PM")).toBe("Client marqué absent · 2:58 PM");
    expect(libelleResultat(b, "annule", "")).toBe("Réservation annulée");
  });
});

describe("dates", () => {
  it("date complète avec jour de la semaine et année, sans décalage de fuseau", () => {
    expect(dateComplete("2026-08-06")).toBe("jeudi 6 août 2026");
  });
  it("nombre de nuits", () => {
    expect(nombreNuits("2026-08-06", "2026-08-09")).toBe(3);
  });
});
