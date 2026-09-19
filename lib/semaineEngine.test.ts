// Scénarios d'acceptation du brief "Cette semaine" (§19), traduits en
// spécification exécutable — même discipline que attentionEngine.test.ts
// et discoveryEngine.test.ts.
import { describe, it, expect } from "vitest";
import { calculerSemaine, etatSemaineVide, type SemaineState } from "./semaineEngine";
import type { EngagementEntry } from "./discoveryEngine";

const DEBUT = "2026-08-24T00:00:00.000Z";
const FIN = "2026-08-30T23:59:59.000Z";

function ilYaNJours(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString();
}
function engagement(partial: Partial<EngagementEntry>): EngagementEntry {
  return { confiance: "vu", ignorances_consecutives: 0, derniere_vue_le: null, derniere_interaction_le: null, derniere_signature: null, ...partial };
}
function vide(citoyen: string): SemaineState {
  return etatSemaineVide(citoyen, DEBUT, FIN);
}

describe("Cette semaine — scénarios d'acceptation", () => {
  it("1. Nouveau compte sans historique → rien à afficher", () => {
    const r = calculerSemaine(vide("c1"));
    expect(r).toHaveLength(0);
  });

  it("2. Citoyen avec dépenses uniquement (catégorie dominante nette) → carte niveau 1", () => {
    const state: SemaineState = { ...vide("c2"), categorie_dominante: { categorie: "logement", label: "Logement", montant: 400000, part_pct: 42 } };
    const r = calculerSemaine(state);
    expect(r).toHaveLength(1);
    expect(r[0].source_type).toBe("depense");
    expect(r[0].niveau).toBe(1);
    expect(r[0].observation).toContain("42%");
  });

  it("3. Citoyen avec démarches uniquement (nouvelle démarche) → carte niveau 1", () => {
    const state: SemaineState = { ...vide("c3"), nouvelle_demarche: { id: "d1", titre: "Renouvellement CNI" } };
    const r = calculerSemaine(state);
    expect(r).toHaveLength(1);
    expect(r[0].source_type).toBe("demarche");
    expect(r[0].categorie).toBe("nouvelle");
  });

  it("4. Citoyen avec rendez-vous à venir cette semaine uniquement → carte niveau 2", () => {
    const state: SemaineState = { ...vide("c4"), rdv_a_venir_semaine: { id: "r1", institution: "Mairie de Matoto", date: "28 août" } };
    const r = calculerSemaine(state);
    expect(r).toHaveLength(1);
    expect(r[0].niveau).toBe(2);
  });

  it("5. Citoyen avec gain Reward significatif → carte niveau 1", () => {
    const state: SemaineState = { ...vide("c5"), points_gagnes_semaine: 120 };
    const r = calculerSemaine(state);
    expect(r.some((c) => c.source_type === "reward")).toBe(true);
  });

  it("6. Citoyen avec plusieurs activités → diversifié et borné à 2, niveau 1 prioritaire", () => {
    const state: SemaineState = { ...vide("c6"),
      categorie_dominante: { categorie: "transport", label: "Transport", montant: 150000, part_pct: 55 },
      demarche_avancee: { id: "d2", titre: "Passeport" },
      rdv_a_venir_semaine: { id: "r2", institution: "Banque", date: "29 août" },
      points_gagnes_semaine: 80,
    };
    const r = calculerSemaine(state);
    expect(r).toHaveLength(2);
    expect(r.every((c) => c.niveau === 1)).toBe(true);
    const familles = new Set(r.map((c) => c.source_type));
    expect(familles.size).toBe(2);
  });

  it("7. Citoyen sans événement pertinent → silence, pas de carte artificielle", () => {
    const r = calculerSemaine(vide("c7"));
    expect(r).toHaveLength(0);
  });

  it("8. Carte déjà affichée plusieurs fois sans interaction récente → cooldown, ne revient pas immédiatement", () => {
    const state: SemaineState = { ...vide("c8"), avis_en_attente: [{ id: "a1", institution: "Ecobank" }],
      engagement: { avis: engagement({ ignorances_consecutives: 2, derniere_vue_le: ilYaNJours(1), derniere_signature: "a1" }) } };
    const r = calculerSemaine(state);
    expect(r.some((c) => c.source_type === "avis")).toBe(false);
  });

  it("9. Nouvel avis à laisser (signature différente) → réapparaît malgré un cooldown précédent", () => {
    const state: SemaineState = { ...vide("c9"), avis_en_attente: [{ id: "a1", institution: "Ecobank" }, { id: "a2", institution: "BICIGUI" }],
      engagement: { avis: engagement({ ignorances_consecutives: 3, derniere_vue_le: ilYaNJours(1), derniere_signature: "a1" }) } };
    const r = calculerSemaine(state);
    expect(r.some((c) => c.source_type === "avis")).toBe(true);
  });

  it("10. Action utilisateur rend une carte obsolète (démarche terminée → plus de demarche_avancee) → carte disparaît", () => {
    const state: SemaineState = { ...vide("c10") }; // demarche_avancee redevenu null après action
    const r = calculerSemaine(state);
    expect(r.some((c) => c.source_type === "demarche")).toBe(false);
  });

  it("11. Nouvel événement apparaît (dépense ajoutée) → carte résumé dépenses apparaît", () => {
    const state: SemaineState = { ...vide("c11"), nb_depenses_semaine: 2, montant_total_semaine: 45000 };
    const r = calculerSemaine(state);
    expect(r.some((c) => c.source_type === "depense" && c.categorie === "resume")).toBe(true);
  });

  it("12. Plusieurs cartes concurrentes de même niveau → effort le plus faible d'abord, jamais deux fois la même famille", () => {
    const state: SemaineState = { ...vide("c12"),
      avis_en_attente: [{ id: "a3", institution: "Ecobank" }],
      rdv_a_venir_semaine: { id: "r3", institution: "Mairie", date: "30 août" },
    };
    const r = calculerSemaine(state);
    expect(r.length).toBeLessThanOrEqual(2);
    const familles = new Set(r.map((c) => c.source_type));
    expect(familles.size).toBe(r.length);
  });

  it("13. Dépense dominante déjà signalée par l'État d'attention (budget dépassé), aucune autre dépense connue → jamais dupliquée ici", () => {
    const state: SemaineState = { ...vide("c13"),
      categorie_dominante: { categorie: "transport", label: "Transport", montant: 150000, part_pct: 60 },
      categorie_dominante_deja_signalee_attention: true,
    };
    const r = calculerSemaine(state);
    expect(r.some((c) => c.source_type === "depense")).toBe(false);
  });

  it("13b. Dépense dominante déjà signalée par l'État d'attention MAIS activité réelle de la semaine → repli résumé, jamais silence total (régression 27/08/2026)", () => {
    const state: SemaineState = { ...vide("c13b"),
      categorie_dominante: { categorie: "transport", label: "Transport", montant: 75000, part_pct: 95 },
      categorie_dominante_deja_signalee_attention: true,
      nb_depenses_semaine: 2, montant_total_semaine: 79000,
    };
    const r = calculerSemaine(state);
    expect(r.some((c) => c.source_type === "depense" && c.categorie === "resume")).toBe(true);
    expect(r.some((c) => c.categorie === "transport")).toBe(false);
  });

  it("14. Carousel avec 2 cartes → jamais plus de 2 renvoyées", () => {
    const state: SemaineState = { ...vide("c14"),
      categorie_dominante: { categorie: "sante", label: "Santé", montant: 90000, part_pct: 50 },
      nouvelle_demarche: { id: "d3", titre: "Extrait de naissance" },
      points_gagnes_semaine: 200,
    };
    const r = calculerSemaine(state);
    expect(r.length).toBe(2);
  });

  it("15. Une seule carte disponible → carousel à 1 carte (pas d'erreur, pas de remplissage artificiel)", () => {
    const state: SemaineState = { ...vide("c15"), points_gagnes_semaine: 60 };
    const r = calculerSemaine(state);
    expect(r).toHaveLength(1);
  });
});
