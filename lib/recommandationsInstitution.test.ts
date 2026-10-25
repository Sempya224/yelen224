// Tests du moteur de règles du système de recommandation institutionnel
// (Phase 2, architecture validée CEO 13/10/2026) — même discipline que
// semaineEngine.test.ts/attentionEngine.test.ts : scénarios d'acceptation
// traduits en spécification exécutable, zéro mock Supabase (fonctions
// pures uniquement).
import { describe, it, expect } from "vitest";
import {
  evaluerRdvNonTraites,
  evaluerBaisseConversion,
  evaluerPerteTunnel,
  genererRecommandations,
  SEUIL_RDV_NON_TRAITES_ATTENTION,
  SEUIL_RDV_NON_TRAITES_CRITIQUE,
  SEUIL_VOLUME_MINIMUM_POURCENTAGE,
  type RdvOuvert,
} from "./recommandationsInstitution";
import type { VueEnsemble } from "./analyseAggregation";
import type { AnalyseTunnel, PerteEtape, CauseAbandon } from "./analyseTunnel";

const MAINTENANT = new Date(2026, 9, 13, 12, 0, 0); // 13/10/2026 12:00

function kpi(valeur: number | null, delta: number | null = null): VueEnsemble["vues"] {
  return { valeur, delta, serie: [] };
}
function vueEnsembleVide(): VueEnsemble {
  return {
    vues: kpi(0), clics: kpi(0), rdvGeneres: kpi(0), tauxConversion: kpi(0), citoyensAtteints: kpi(0), satisfaction: kpi(null),
  };
}

function perteEtape(partial: Partial<PerteEtape>): PerteEtape {
  return { etape: "confirmation", label: "Demande → Confirmation", perteCount: 0, deltaPct: 0, niveau: "faible", ...partial };
}
function cause(partial: Partial<CauseAbandon>): CauseAbandon {
  return { type: "refus", motif: "Non précisé", count: 0, pct: 0, ...partial };
}
function tunnelVide(): AnalyseTunnel {
  return {
    demandes: kpi(0), confirmes: kpi(0), termines: kpi(0), enAttente: kpi(0),
    conversionGlobale: kpi(0), perteTotale: kpi(0), pertes: [], causesAbandon: [],
  };
}

// RDV "nouveau" dont l'heure est dépassée de `minutesDepuisHeure` minutes par
// rapport à MAINTENANT — avec minutesDepuisHeure > 30, dépasse la fenêtre de
// grâce (lib/rdvGating.ts::MINUTES_GRACE_NON_TRAITE) et compte comme non traité.
function rdvNonTraiteFixture(id: string, minutesDepuisHeure: number): RdvOuvert {
  const d = new Date(MAINTENANT.getTime() - minutesDepuisHeure * 60000);
  const heure = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { id, statut: "nouveau", presence_status: null, date_rdv: date, heure_rdv: heure };
}

describe("evaluerRdvNonTraites", () => {
  it("sous le seuil d'attention → aucune recommandation", () => {
    const rows = Array.from({ length: SEUIL_RDV_NON_TRAITES_ATTENTION - 1 }, (_, i) => rdvNonTraiteFixture(`r${i}`, 45));
    expect(evaluerRdvNonTraites(rows, MAINTENANT)).toBeNull();
  });

  it("ignore un RDV encore dans sa fenêtre de grâce (heure dépassée de 15 min seulement)", () => {
    const rows = Array.from({ length: 10 }, (_, i) => rdvNonTraiteFixture(`r${i}`, 15));
    expect(evaluerRdvNonTraites(rows, MAINTENANT)).toBeNull();
  });

  it("au seuil d'attention mais sous le seuil critique → priorité attention", () => {
    const rows = Array.from({ length: SEUIL_RDV_NON_TRAITES_ATTENTION }, (_, i) => rdvNonTraiteFixture(`r${i}`, 45));
    const r = evaluerRdvNonTraites(rows, MAINTENANT);
    expect(r).not.toBeNull();
    expect(r!.priorite).toBe("attention");
    expect(r!.action).toEqual({ label: "Voir les rendez-vous concernés", cible: "rdv" });
    expect(r!.donnees.nbRdvNonTraites).toBe(SEUIL_RDV_NON_TRAITES_ATTENTION);
  });

  it("au-delà du seuil critique → priorité critique", () => {
    const rows = Array.from({ length: SEUIL_RDV_NON_TRAITES_CRITIQUE }, (_, i) => rdvNonTraiteFixture(`r${i}`, 45));
    const r = evaluerRdvNonTraites(rows, MAINTENANT);
    expect(r!.priorite).toBe("critique");
  });

  it("un RDV déjà confirmé n'est jamais compté, même avec une heure très ancienne", () => {
    const rows: RdvOuvert[] = Array.from({ length: 10 }, (_, i) => ({ ...rdvNonTraiteFixture(`r${i}`, 500), statut: "confirme" }));
    expect(evaluerRdvNonTraites(rows, MAINTENANT)).toBeNull();
  });
});

describe("evaluerBaisseConversion", () => {
  it("volume insuffisant → aucune recommandation même avec une forte baisse", () => {
    const v = { ...vueEnsembleVide(), rdvGeneres: kpi(SEUIL_VOLUME_MINIMUM_POURCENTAGE - 1), tauxConversion: kpi(10, -40) };
    expect(evaluerBaisseConversion(v, 30)).toBeNull();
  });

  it("volume suffisant mais baisse en dessous du seuil → aucune recommandation", () => {
    const v = { ...vueEnsembleVide(), rdvGeneres: kpi(50), tauxConversion: kpi(60, -5) };
    expect(evaluerBaisseConversion(v, 30)).toBeNull();
  });

  it("aucun delta disponible (première période) → aucune recommandation", () => {
    const v = { ...vueEnsembleVide(), rdvGeneres: kpi(50), tauxConversion: kpi(60, null) };
    expect(evaluerBaisseConversion(v, 30)).toBeNull();
  });

  it("baisse significative avec volume suffisant → priorité attention", () => {
    const v = { ...vueEnsembleVide(), rdvGeneres: kpi(50), tauxConversion: kpi(40, -12) };
    const r = evaluerBaisseConversion(v, 30);
    expect(r).not.toBeNull();
    expect(r!.priorite).toBe("attention");
    expect(r!.constat).toContain("12 points");
    expect(r!.action).toEqual({ label: "Vérifier vos disponibilités", cible: "disponibilites" });
  });

  it("baisse très forte → priorité critique", () => {
    const v = { ...vueEnsembleVide(), rdvGeneres: kpi(50), tauxConversion: kpi(20, -25) };
    const r = evaluerBaisseConversion(v, 30);
    expect(r!.priorite).toBe("critique");
  });
});

describe("evaluerPerteTunnel", () => {
  it("volume de demandes insuffisant → aucune recommandation", () => {
    const t: AnalyseTunnel = { ...tunnelVide(), demandes: kpi(SEUIL_VOLUME_MINIMUM_POURCENTAGE - 1), pertes: [perteEtape({ deltaPct: 50, niveau: "critique" })] };
    expect(evaluerPerteTunnel(t, 30)).toBeNull();
  });

  it("pire étape de niveau moyen ou faible → aucune recommandation", () => {
    const t: AnalyseTunnel = { ...tunnelVide(), demandes: kpi(50), pertes: [perteEtape({ deltaPct: 15, niveau: "moyen" })] };
    expect(evaluerPerteTunnel(t, 30)).toBeNull();
  });

  it("aucune étape de perte (tunnel vide) → aucune recommandation", () => {
    const t: AnalyseTunnel = { ...tunnelVide(), demandes: kpi(50), pertes: [] };
    expect(evaluerPerteTunnel(t, 30)).toBeNull();
  });

  it("perte critique sans cause dominante claire → constat seul, aucune action fabriquée", () => {
    const t: AnalyseTunnel = {
      ...tunnelVide(), demandes: kpi(50),
      pertes: [perteEtape({ etape: "confirmation", label: "Demande → Confirmation", deltaPct: 35, niveau: "critique" })],
      causesAbandon: [cause({ motif: "Non précisé", pct: 80 })],
    };
    const r = evaluerPerteTunnel(t, 30);
    expect(r).not.toBeNull();
    expect(r!.action).toBeNull();
    expect(r!.donnees.causeDominanteMotif).toBeNull();
    expect(r!.constat).not.toContain("Cause principale");
  });

  it("perte critique avec cause dominante claire (≥40%) → constat cite le motif réel", () => {
    const t: AnalyseTunnel = {
      ...tunnelVide(), demandes: kpi(50),
      pertes: [perteEtape({ etape: "confirmation", label: "Demande → Confirmation", deltaPct: 30, niveau: "critique" })],
      causesAbandon: [cause({ motif: "Créneau indisponible finalement", pct: 55 })],
    };
    const r = evaluerPerteTunnel(t, 30);
    expect(r!.constat).toContain("Créneau indisponible finalement");
    expect(r!.donnees.causeDominanteMotif).toBe("Créneau indisponible finalement");
  });

  it("cause dominante 'Autres' ignorée même si ≥40%", () => {
    const t: AnalyseTunnel = {
      ...tunnelVide(), demandes: kpi(50),
      pertes: [perteEtape({ deltaPct: 30, niveau: "critique" })],
      causesAbandon: [cause({ motif: "Autres", pct: 60 })],
    };
    const r = evaluerPerteTunnel(t, 30);
    expect(r!.action).toBeNull();
    expect(r!.donnees.causeDominanteMotif).toBeNull();
  });

  it("deltaPct >= 40 → priorité critique, en dessous → attention", () => {
    const base = tunnelVide();
    const rAttention = evaluerPerteTunnel({ ...base, demandes: kpi(50), pertes: [perteEtape({ deltaPct: 25, niveau: "critique" })] }, 30);
    const rCritique = evaluerPerteTunnel({ ...base, demandes: kpi(50), pertes: [perteEtape({ deltaPct: 45, niveau: "critique" })] }, 30);
    expect(rAttention!.priorite).toBe("attention");
    expect(rCritique!.priorite).toBe("critique");
  });
});

describe("genererRecommandations", () => {
  it("établissement stable, zéro volume partout → aucune recommandation, aucun crash", () => {
    const r = genererRecommandations({
      vueEnsemble: vueEnsembleVide(),
      analyseTunnel: tunnelVide(),
      rdvOuverts: [],
      periodeJours: 30,
      maintenant: MAINTENANT,
    });
    expect(r).toHaveLength(0);
  });

  it("plusieurs signaux actifs → triés critique en premier", () => {
    const rdvOuverts = Array.from({ length: SEUIL_RDV_NON_TRAITES_ATTENTION }, (_, i) => rdvNonTraiteFixture(`r${i}`, 45)); // attention
    const vueEnsemble: VueEnsemble = { ...vueEnsembleVide(), rdvGeneres: kpi(50), tauxConversion: kpi(20, -25) }; // critique
    const analyseTunnel = tunnelVide();

    const r = genererRecommandations({ vueEnsemble, analyseTunnel, rdvOuverts, periodeJours: 30, maintenant: MAINTENANT });
    expect(r).toHaveLength(2);
    expect(r[0].type).toBe("baisse_conversion");
    expect(r[0].priorite).toBe("critique");
    expect(r[1].type).toBe("rdv_non_traites");
    expect(r[1].priorite).toBe("attention");
  });
});
