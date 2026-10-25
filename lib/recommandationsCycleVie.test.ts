// Scénarios d'acceptation du cycle de vie (dédup/expiration/réapparition) —
// décision CEO section 6 : "éviter aussi bien les doublons que la
// réapparition intempestive d'une recommandation déjà traitée." Fonctions
// pures uniquement, aucun accès Supabase dans ce fichier.
import { describe, it, expect } from "vitest";
import { decisionCycleVie, transitionManuelleAutorisee } from "./recommandationsCycleVie";

describe("decisionCycleVie", () => {
  it("aucune ligne existante + signal actif → créer", () => {
    expect(decisionCycleVie(null, true)).toBe("creer");
  });

  it("aucune ligne existante + signal absent → ignorer (rien à créer)", () => {
    expect(decisionCycleVie(null, false)).toBe("ignorer");
  });

  it("ligne 'nouvelle' + signal toujours actif → rafraîchir (statut inchangé)", () => {
    expect(decisionCycleVie("nouvelle", true)).toBe("rafraichir");
  });

  it("ligne 'consultee' + signal toujours actif → rafraîchir", () => {
    expect(decisionCycleVie("consultee", true)).toBe("rafraichir");
  });

  it("ligne 'nouvelle' + signal retombé → expirer", () => {
    expect(decisionCycleVie("nouvelle", false)).toBe("expirer");
  });

  it("ligne 'consultee' + signal retombé → expirer", () => {
    expect(decisionCycleVie("consultee", false)).toBe("expirer");
  });

  it("ligne 'expiree' + signal revenu → réactiver (nouvelle occurrence)", () => {
    expect(decisionCycleVie("expiree", true)).toBe("reactiver");
  });

  it("ligne 'expiree' + signal toujours absent → ignorer", () => {
    expect(decisionCycleVie("expiree", false)).toBe("ignorer");
  });

  it("ligne 'traitee' + signal encore actif → laisser_traitee (jamais de réouverture automatique)", () => {
    expect(decisionCycleVie("traitee", true)).toBe("laisser_traitee");
  });

  it("ligne 'traitee' + signal retombé → ignorer (déjà résolue, rien à faire)", () => {
    expect(decisionCycleVie("traitee", false)).toBe("ignorer");
  });
});

describe("transitionManuelleAutorisee", () => {
  it("nouvelle → consultee : autorisé", () => {
    expect(transitionManuelleAutorisee("nouvelle", "consultee")).toBe(true);
  });
  it("nouvelle → traitee : autorisé (saut direct)", () => {
    expect(transitionManuelleAutorisee("nouvelle", "traitee")).toBe(true);
  });
  it("consultee → traitee : autorisé", () => {
    expect(transitionManuelleAutorisee("consultee", "traitee")).toBe(true);
  });
  it("consultee → consultee : refusé (déjà fait)", () => {
    expect(transitionManuelleAutorisee("consultee", "consultee")).toBe(false);
  });
  it("traitee → consultee : refusé (jamais de retour arrière manuel)", () => {
    expect(transitionManuelleAutorisee("traitee", "consultee")).toBe(false);
  });
  it("expiree → consultee : refusé", () => {
    expect(transitionManuelleAutorisee("expiree", "consultee")).toBe(false);
  });
  it("nouvelle → nouvelle : toujours refusé (jamais une cible manuelle)", () => {
    expect(transitionManuelleAutorisee("nouvelle", "nouvelle")).toBe(false);
  });
  it("nouvelle → expiree : toujours refusé (jamais une cible manuelle)", () => {
    expect(transitionManuelleAutorisee("nouvelle", "expiree")).toBe(false);
  });
});
