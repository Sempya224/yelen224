import { describe, it, expect } from "vitest";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import { absenceDeclarable, rdvNonTraite } from "@/lib/rdvGating";
import {
  getRdvDecision,
  type RdvDecision,
  type RdvDecisionAction,
  type RdvDecisionContext,
  type RdvDecisionEvent,
  type RdvDecisionInput,
} from "@/lib/rdvDecision";

// Dates construites en heure locale, comme rdvGating.ts — les tests ne
// dépendent donc pas du fuseau de la machine. RDV de référence : 21/10/2026
// à 10:00 ; grâce « non traité » = 10:30 ; fenêtre de présence dès 09:50.
const JOUR = "2026-10-21";
const a = (hh: number, mm = 0) => new Date(2026, 9, 21, hh, mm, 0, 0);

// Fixtures nommées — `nouveau` et `confirme` n'existent dans aucune ligne de
// production aujourd'hui (seuls annule/termine/en_attente), elles servent donc
// de seule preuve de ces chemins.
function rdv(over: Partial<RdvDecisionInput> = {}): RdvDecisionInput {
  return { statut: "en_attente", date_rdv: JOUR, heure_rdv: "10:00", presence_status: null, ...over };
}
const FIXTURE_NOUVEAU = rdv({ statut: "nouveau" });
const FIXTURE_CONFIRME = rdv({ statut: "confirme", presence_status: "present" });

function ctx(role: MembreRole, over: Partial<RdvDecisionContext> = {}): RdvDecisionContext {
  return { can: (p) => can(role, p), suspendu: false, events: [], ...over };
}
const admin = ctx("admin");

const ids = (d: RdvDecision) => [d.actionPrincipale, ...d.actionsSecondaires].filter((x): x is RdvDecisionAction => !!x).map((x) => x.id);
const trouver = (d: RdvDecision, id: string) => [d.actionPrincipale, ...d.actionsSecondaires].find((x) => x?.id === id);

describe("getRdvDecision : phases", () => {
  it("nouveau à venir : accepter (principal) / refuser (motif optionnel), échéance = heure + 30 min", () => {
    const d = getRdvDecision(FIXTURE_NOUVEAU, a(8), admin);
    expect(d.phase).toBe("nouveau_a_venir");
    expect(d.urgence).toBe("attention");
    expect(d.actionPrincipale?.id).toBe("accepter");
    expect(d.actionsSecondaires.map((x) => x.id)).toEqual(["refuser"]);
    expect(trouver(d, "refuser")?.motif).toBe("optionnel");
    expect(d.echeance).toEqual(a(10, 30));
  });

  it("nouveau en retard dans la grâce : critique, échéance conservée", () => {
    const d = getRdvDecision(FIXTURE_NOUVEAU, a(10, 10), admin);
    expect(d.phase).toBe("nouveau_en_retard");
    expect(d.urgence).toBe("critique");
    expect(d.echeance).toEqual(a(10, 30));
    expect(d.actionPrincipale?.id).toBe("accepter");
  });

  it("nouveau non traité : plus d'action principale, seul refuser reste", () => {
    const d = getRdvDecision(FIXTURE_NOUVEAU, a(10, 31), admin);
    expect(d.phase).toBe("non_traite");
    expect(d.actionPrincipale).toBeUndefined();
    expect(ids(d)).toEqual(["refuser"]);
  });

  it("accepté à venir : préparer la venue en principal, ni terminer ni absent", () => {
    const d = getRdvDecision(rdv(), a(8), admin);
    expect(d.phase).toBe("accepte_a_venir");
    expect(d.actionPrincipale?.id).toBe("preparer");
    expect(d.actionPrincipale?.label).toBe("Préparer la venue");
    expect(ids(d)).toEqual(["preparer"]);
  });

  it("accepté à venir, lieu renseigné mais client non informé : « Informer le client »", () => {
    const d = getRdvDecision(rdv({ guichet: "Guichet 3" }), a(8), admin);
    expect(d.actionPrincipale?.label).toBe("Informer le client");
  });

  it("accepté à venir, client déjà informé : plus d'action principale, « Modifier la préparation » en secondaire", () => {
    const d = getRdvDecision(rdv({ guichet: "Guichet 3", preparation_confirmee_le: "2026-10-20T15:00:00Z" }), a(8), admin);
    expect(d.actionPrincipale).toBeUndefined();
    expect(d.actionsSecondaires[0]?.label).toBe("Modifier la préparation");
  });

  it("reporté : phase dédiée tant que le créneau n'est pas atteint", () => {
    const d = getRdvDecision(rdv({ motif_report: "Empêchement de dernière minute" }), a(8), admin);
    expect(d.phase).toBe("reporte");
    expect(d.detail).toContain("Empêchement de dernière minute");
  });

  it("reporté mais créneau ouvert : la phase temporelle prime", () => {
    const d = getRdvDecision(rdv({ motif_report: "x motif" }), a(9, 55), admin);
    expect(d.phase).toBe("presence_ouverte");
  });

  it("fenêtre de présence ouverte (09:50) : confirmer la présence, terminer et absent désactivés avec raison", () => {
    const d = getRdvDecision(rdv(), a(9, 50), admin);
    expect(d.phase).toBe("presence_ouverte");
    expect(d.actionPrincipale).toMatchObject({ id: "confirmer_presence", disabled: false });
    expect(trouver(d, "terminer")).toMatchObject({ disabled: true, raison: "Confirmez d'abord la présence du client." });
    expect(trouver(d, "absent")?.disabled).toBe(true);
    expect(d.blocages.map((b) => b.action)).toEqual(["terminer", "absent"]);
  });

  it("09:49 : fenêtre pas encore ouverte", () => {
    expect(getRdvDecision(rdv(), a(9, 49), admin).phase).toBe("accepte_a_venir");
  });

  it("en retard dans la grâce : critique, absent actif avec motif obligatoire de 5 caractères", () => {
    const d = getRdvDecision(rdv(), a(10, 10), admin);
    expect(d.phase).toBe("en_retard_grace");
    expect(d.urgence).toBe("critique");
    expect(d.echeance).toEqual(a(10, 30));
    expect(trouver(d, "absent")).toMatchObject({ disabled: false, motif: "obligatoire", motifMinCaracteres: 5 });
    expect(trouver(d, "terminer")?.disabled).toBe(true);
  });

  it("non traité (en_attente, 10:31) : aucune action, explication", () => {
    const d = getRdvDecision(rdv(), a(10, 31), admin);
    expect(d.phase).toBe("non_traite");
    expect(d.actionPrincipale).toBeUndefined();
    expect(d.actionsSecondaires).toEqual([]);
    expect(d.detail).toContain("ce retard vous incombe");
  });

  it("présent : marquer terminé actif (fixture confirme)", () => {
    const d = getRdvDecision(FIXTURE_CONFIRME, a(10, 5), admin);
    expect(d.phase).toBe("present");
    expect(d.actionPrincipale).toMatchObject({ id: "terminer", disabled: false });
  });

  it("présent même si l'heure de grâce est dépassée (la présence prime)", () => {
    expect(getRdvDecision(rdv({ presence_status: "present" }), a(12), admin).phase).toBe("present");
  });

  it("terminé / absent : aucune action", () => {
    const t = getRdvDecision(rdv({ statut: "termine", presence_status: "present" }), a(12), admin);
    expect(t.phase).toBe("termine");
    expect(ids(t)).toEqual([]);
    const ab = getRdvDecision(rdv({ presence_status: "absent" }), a(12), admin);
    expect(ab.phase).toBe("absent");
    expect(ids(ab)).toEqual([]);
  });

  it("absent prime sur annulé (statut annule + presence absent)", () => {
    expect(getRdvDecision(rdv({ statut: "annule", presence_status: "absent" }), a(12), admin).phase).toBe("absent");
  });

  it("refusé (valeur historique « refuse »)", () => {
    const d = getRdvDecision(rdv({ statut: "refuse", motif_annulation: "Complet" }), a(12), admin);
    expect(d.phase).toBe("refuse");
    expect(d.detail).toContain("Complet");
  });

  it("statut inconnu : message neutre, jamais le code brut", () => {
    const d = getRdvDecision(rdv({ statut: "effectue" }), a(12), admin);
    expect(d.phase).toBe("inconnu");
    expect(d.detail).not.toContain("effectue");
  });
});

describe("getRdvDecision : annulations", () => {
  const ev = (auteur: string, motif: string | null, at = "2026-10-20T10:00:00Z"): RdvDecisionEvent => ({ action: "annulation", auteur_type: auteur, motif, created_at: at });
  const annule = rdv({ statut: "annule", annule_par: null });

  it("auteur citoyen (rdv_events)", () => {
    const d = getRdvDecision(annule, a(12), ctx("admin", { events: [ev("citoyen", "Voyage")] }));
    expect(d.titre).toBe("Annulé par le citoyen");
    expect(d.detail).toContain("Voyage");
  });

  it("auteur établissement", () => {
    expect(getRdvDecision(annule, a(12), ctx("admin", { events: [ev("institution", null)] })).titre).toBe("Annulé par votre établissement");
  });

  it("auteur système + motif de suspension", () => {
    const d = getRdvDecision(annule, a(12), ctx("admin", { events: [ev("system", "Votre établissement était suspendu")] }));
    expect(d.titre).toBe("Annulé automatiquement : établissement suspendu");
    expect(d.motifComplet).toContain("suspendu");
  });

  it("auteur système sans mention de suspension : titre générique, jamais « suspendu »", () => {
    const d = getRdvDecision(annule, a(12), ctx("admin", { events: [ev("system", "Votre rendez-vous a été annulé, ce n'est pas lié à vous.")] }));
    expect(d.titre).toBe("Annulé automatiquement par Yelen");
  });

  it("sans événement ni annule_par : « Annulé » sans auteur", () => {
    const d = getRdvDecision(annule, a(12), admin);
    expect(d.titre).toBe("Annulé");
    expect(d.detail).toContain("n'est pas enregistrée");
  });

  it("repli sur annule_par quand aucun événement", () => {
    expect(getRdvDecision(rdv({ statut: "annule", annule_par: "citoyen" }), a(12), admin).titre).toBe("Annulé par le citoyen");
  });

  it("plusieurs annulations : la plus récente gagne", () => {
    const d = getRdvDecision(annule, a(12), ctx("admin", { events: [ev("citoyen", "ancien", "2026-10-19T10:00:00Z"), ev("institution", "récent", "2026-10-20T10:00:00Z")] }));
    expect(d.titre).toBe("Annulé par votre établissement");
  });

  it("auteur_type inconnu : retombe sur « Annulé »", () => {
    expect(getRdvDecision(annule, a(12), ctx("admin", { events: [ev("robot", null)] })).titre).toBe("Annulé");
  });
});

describe("getRdvDecision : rôles et suspension", () => {
  it.each(["admin", "agent"] as const)("%s : peut accepter et confirmer la présence", (role) => {
    expect(getRdvDecision(FIXTURE_NOUVEAU, a(8), ctx(role)).actionPrincipale).toMatchObject({ id: "accepter", disabled: false });
    expect(getRdvDecision(rdv(), a(9, 55), ctx(role)).actionPrincipale).toMatchObject({ id: "confirmer_presence", disabled: false });
  });

  it("superviseur : traite les RDV mais ne peut pas confirmer la présence (appointment.check_in)", () => {
    const d = getRdvDecision(rdv(), a(9, 55), ctx("superviseur"));
    expect(d.lectureSeule).toBe(false);
    expect(d.actionPrincipale).toMatchObject({ id: "confirmer_presence", disabled: true });
    expect(getRdvDecision(FIXTURE_NOUVEAU, a(8), ctx("superviseur")).actionPrincipale?.disabled).toBe(false);
  });

  it.each(["dirigeant", "comptable"] as const)("%s : lecture seule, aucune action, un seul blocage « toutes »", (role) => {
    for (const r of [FIXTURE_NOUVEAU, rdv(), FIXTURE_CONFIRME]) {
      const d = getRdvDecision(r, a(10, 10), ctx(role));
      expect(d.lectureSeule).toBe(true);
      expect(d.actionPrincipale).toBeUndefined();
      expect(d.actionsSecondaires).toEqual([]);
      expect(d.blocages).toEqual([{ action: "toutes", raison: expect.stringContaining("Lecture seule") }]);
    }
  });

  it("lecture seule : le titre et l'urgence restent informatifs", () => {
    const d = getRdvDecision(FIXTURE_NOUVEAU, a(8), ctx("dirigeant"));
    expect(d.phase).toBe("nouveau_a_venir");
    expect(d.titre).toBeTruthy();
  });

  it("établissement suspendu : actions désactivées avec la raison, sauf préparer la venue", () => {
    const d = getRdvDecision(FIXTURE_NOUVEAU, a(8), ctx("admin", { suspendu: true }));
    expect(d.actionPrincipale).toMatchObject({ id: "accepter", disabled: true });
    expect(d.actionPrincipale?.raison).toContain("suspendu");
    expect(d.actionsSecondaires[0]?.disabled).toBe(true);
    expect(d.blocages[0]).toMatchObject({ action: "toutes" });

    const prep = getRdvDecision(rdv(), a(8), ctx("admin", { suspendu: true }));
    expect(prep.actionPrincipale).toMatchObject({ id: "preparer", disabled: false });
    expect(prep.blocages).toEqual([]);
  });
});

describe("cohérence avec les règles serveur (matrice exhaustive)", () => {
  const statuts = ["nouveau", "en_attente", "confirme", "annule", "termine", "refuse"];
  const presences: (string | null)[] = [null, "present", "absent"];
  const instants = [a(7), a(9, 49), a(9, 50), a(10), a(10, 29), a(10, 30), a(10, 31), a(23, 59), new Date(2026, 9, 22, 0, 5)];
  const roles: MembreRole[] = ["admin", "agent", "superviseur", "dirigeant", "comptable"];

  it("toute action activée serait acceptée par le serveur", () => {
    let verifiees = 0;
    for (const statut of statuts) for (const presence_status of presences) for (const now of instants) for (const role of roles) for (const suspendu of [false, true]) {
      const r = rdv({ statut, presence_status });
      const d = getRdvDecision(r, now, ctx(role, { suspendu }));
      for (const act of [d.actionPrincipale, ...d.actionsSecondaires]) {
        if (!act || act.disabled) continue;
        verifiees++;
        const id = act.id;
        // Règles 1 et 2
        if (id !== "preparer") expect(suspendu).toBe(false);
        expect(can(role, "rdv.write")).toBe(true);
        if (id === "terminer") expect(r.presence_status).toBe("present");
        if (id === "absent") {
          expect(absenceDeclarable(r.date_rdv, r.heure_rdv, now)).toBe(true);
          expect(rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv, now)).toBe(false);
          expect(act.motifMinCaracteres).toBe(5);
        }
        if (id === "confirmer_presence") {
          expect(can(role, "appointment.check_in")).toBe(true);
          expect(r.presence_status).not.toBe("present");
        }
      }
    }
    expect(verifiees).toBeGreaterThan(100);
  });

  it("aucune action sur un RDV terminé, annulé, refusé ou absent", () => {
    for (const r of [rdv({ statut: "termine" }), rdv({ statut: "annule" }), rdv({ statut: "refuse" }), rdv({ presence_status: "absent" })]) {
      for (const now of instants) expect(ids(getRdvDecision(r, now, admin))).toEqual([]);
    }
  });

  it("une action désactivée porte toujours une raison", () => {
    for (const statut of statuts) for (const now of instants) for (const role of roles) {
      const d = getRdvDecision(rdv({ statut }), now, ctx(role, { suspendu: true }));
      for (const act of [d.actionPrincipale, ...d.actionsSecondaires]) if (act?.disabled) expect(act.raison).toBeTruthy();
    }
  });
});
