// Scénarios d'acceptation du brief "suggestions personnalisées" (§19),
// traduits en spécification exécutable — même discipline que
// attentionEngine.test.ts.
//
// Rappel de périmètre : ce fichier ne teste QUE la couche 2 (Guidance/
// Découverte). L'arbitrage "l'urgence gagne toujours" face à la couche 1
// (État d'attention) se fait à l'intégration accueil, jamais dans ce
// moteur — discoveryEngine.ts est volontairement agnostique de l'état
// d'attention.
import { describe, it, expect } from "vitest";
import { calculerDecouverte, etatDecouverteVide, type DiscoveryState, type EngagementEntry } from "./discoveryEngine";

function ilYaNJours(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString();
}
function dansNJours(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString();
}
function engagement(partial: Partial<EngagementEntry>): EngagementEntry {
  return { confiance: "vu", ignorances_consecutives: 0, derniere_vue_le: null, derniere_interaction_le: null, derniere_signature: null, ...partial };
}

describe("Suggestions personnalisées — scénarios d'acceptation", () => {
  it("1. Nouveau citoyen sans aucune activité → 2-3 possibilités max, jamais un catalogue", () => {
    const r = calculerDecouverte(etatDecouverteVide("citoyen1"));
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.some((c) => c.source_type === "rdv" && c.niveau === "D")).toBe(true);
  });

  it("2. Après une première action réelle (RDV pris) → une seule fonctionnalité complémentaire, niveau A", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen2"), stade_decouverte: "decouverte", nb_rdv_total: 1 };
    const r = calculerDecouverte(state);
    expect(r).toHaveLength(1);
    expect(r[0].source_type).toBe("demarche");
    expect(r[0].niveau).toBe("A");
  });

  it("3. Historique riche + centre d'intérêt déclaré → Leçons, niveau C (découverte personnalisée)", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen3"), stade_decouverte: "historique_riche", centres_interet: ["mobile_money"] };
    const r = calculerDecouverte(state);
    const lecon = r.find((c) => c.source_type === "lecon");
    expect(lecon?.niveau).toBe("C");
  });

  it("4. Historique riche + ≥3 dépenses réelles → Calculatrice, niveau B (opportunité comportementale)", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen4"), stade_decouverte: "historique_riche", nb_depenses_total: 3 };
    const r = calculerDecouverte(state);
    const calc = r.find((c) => c.source_type === "calculatrice");
    expect(calc?.niveau).toBe("B");
  });

  it("5. Offre correspondant à un centre d'intérêt réel → expires_at reprend la date d'expiration réelle de l'offre si plus proche", () => {
    const dansDeuxJours = dansNJours(2);
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen5"), stade_decouverte: "historique_riche",
      offre_interet: { id: "offre1", titre: "Cashback télécom", categorie: "telecom_media", date_expiration: dansDeuxJours } };
    const r = calculerDecouverte(state);
    const offre = r.find((c) => c.source_type === "offre");
    expect(offre?.expires_at).toBe(dansDeuxJours);
  });

  it("6. Ignorée une seule fois très récemment → cooldown actif, ne revient pas immédiatement", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen6"), stade_decouverte: "historique_riche",
      nb_depenses_total: 3, engagement: { calculatrice: engagement({ ignorances_consecutives: 1, derniere_vue_le: ilYaNJours(1), derniere_signature: "nb_depenses_total=3" }) } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "calculatrice")).toBe(false);
  });

  it("7. Ignorée une fois mais le cooldown de base est écoulé → redevient candidate", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen7"), stade_decouverte: "historique_riche",
      nb_depenses_total: 3, engagement: { calculatrice: engagement({ ignorances_consecutives: 1, derniere_vue_le: ilYaNJours(10), derniere_signature: "nb_depenses_total=3" }) } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "calculatrice")).toBe(true);
  });

  it("8. Ignorée 4 fois de suite (même signature) → suppression tant qu'aucun nouveau signal n'apparaît, même après un long délai", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen8"), stade_decouverte: "historique_riche",
      nb_depenses_total: 3, engagement: { calculatrice: engagement({ ignorances_consecutives: 4, derniere_vue_le: ilYaNJours(60), derniere_signature: "nb_depenses_total=3" }) } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "calculatrice")).toBe(false);
  });

  it("9. Nouveau signal réel (signature différente) → réactive la suggestion malgré une suppression en cours", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen9"), stade_decouverte: "historique_riche",
      nb_depenses_total: 7, // signature devient "nb_depenses_total=7", différente de la dernière exposition
      engagement: { calculatrice: engagement({ ignorances_consecutives: 4, derniere_vue_le: ilYaNJours(1), derniere_signature: "nb_depenses_total=3" }) } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "calculatrice")).toBe(true);
  });

  it("10. Fonctionnalité déjà utilisée régulièrement → jamais reproposée en découverte, quel que soit le cooldown", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen10"), stade_decouverte: "historique_riche",
      nb_rdv_total: 5, engagement: { reward: engagement({ confiance: "utilise_regulierement" }) } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "reward")).toBe(false);
  });

  it("11. Aucune recommandation suffisamment pertinente → tableau vide, le silence est une sortie valide", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen11"), stade_decouverte: "historique_riche" };
    const r = calculerDecouverte(state);
    expect(r).toHaveLength(0);
  });

  it("12. Plusieurs suggestions pertinentes simultanément → diversifiées (jamais deux fois la même famille), bornées à 2", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen12"), stade_decouverte: "historique_riche",
      centres_interet: ["mobile_money"], nb_depenses_total: 3, nb_rdv_total: 2,
      secteur_top: { secteur: "financier", label: "Institutions financières" },
      offre_interet: { id: "offre2", titre: "Offre X", categorie: "telecom_media", date_expiration: null },
    };
    const r = calculerDecouverte(state);
    expect(r.length).toBeLessThanOrEqual(2);
    const familles = new Set(r.map((c) => c.source_type));
    expect(familles.size).toBe(r.length);
  });

  it("13. Jamais vu auparavant → toujours éligible (aucun cooldown ne s'applique à une première exposition)", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen13"), stade_decouverte: "historique_riche", nb_depenses_total: 3 };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "calculatrice")).toBe(true);
  });

  it("14. Famille déjà couverte par « À faire »/« Cette semaine » aujourd'hui → jamais répétée dans « Pour vous » (régression 27/08/2026)", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen14"), stade_decouverte: "historique_riche",
      nb_depenses_total: 3, familles_deja_couvertes: ["calculatrice"] };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "calculatrice")).toBe(false);
  });

  it("15. Chaque type de recommandation porte le bon badge (ou aucun pour une simple progression)", () => {
    const reprise: DiscoveryState = { ...etatDecouverteVide("citoyen15a"), stade_decouverte: "decouverte", nb_rdv_total: 1 };
    expect(calculerDecouverte(reprise).find((c) => c.source_type === "demarche")?.badge).toBe("RECOMMANDÉ");

    const comportementale: DiscoveryState = { ...etatDecouverteVide("citoyen15b"), stade_decouverte: "historique_riche", nb_depenses_total: 3 };
    expect(calculerDecouverte(comportementale).find((c) => c.source_type === "calculatrice")?.badge).toBe("POUR VOUS");

    const premiereSession: DiscoveryState = etatDecouverteVide("citoyen15c");
    expect(calculerDecouverte(premiereSession).find((c) => c.source_type === "rdv")?.badge).toBe("À DÉCOUVRIR");
  });
});

describe("Comptes existants sans activité — scénarios d'acceptation (brief 27/08/2026)", () => {
  it("16. Compte ancien jamais activé (État B) → mêmes candidats qu'un nouveau compte, texte différent", () => {
    const compteAncienVide: DiscoveryState = { ...etatDecouverteVide("citoyen16"), compte_cree_le: ilYaNJours(90) };
    const r = calculerDecouverte(compteAncienVide);
    expect(r.length).toBeGreaterThan(0);
    expect(r.find((c) => c.source_type === "rdv")?.titre).toBe("Toujours aucun rendez-vous pris");
  });

  it("17. Compte nouveau (État A) → texte d'accueil, pas le texte 'compte ancien'", () => {
    const compteNeuf: DiscoveryState = { ...etatDecouverteVide("citoyen17"), compte_cree_le: ilYaNJours(1) };
    const r = calculerDecouverte(compteNeuf);
    expect(r.find((c) => c.source_type === "rdv")?.titre).toBe("Prendre votre premier rendez-vous");
  });

  it("18. Compte sans aucune activité mais centre d'intérêt déclaré → Leçons proposées dès premiere_session (signal Niveau 1 du profil)", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen18"), centres_interet: ["mobile_money"] };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "lecon")).toBe(true);
  });

  it("19. Compte durablement inactif (4+ affichages ignorés) → le pool élargi évite l'écran vide (régression exacte du brief)", () => {
    const cooldownEpuise = engagement({ ignorances_consecutives: 4, derniere_vue_le: ilYaNJours(200), derniere_signature: "premiere_session" });
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen19"),
      engagement: { rdv: cooldownEpuise, demarche: cooldownEpuise, community: cooldownEpuise } };
    const r = calculerDecouverte(state);
    // rdv/demarche/community sont épuisés (même signature, 4e ignorance) mais
    // depense n'a jamais été montrée — le pool élargi garantit un résultat.
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((c) => c.source_type === "depense")).toBe(true);
  });

  it("20. Retour après absence prolongée avec secteur habituel connu → réactivation basée sur cet historique, pas un onboarding générique", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen20"), stade_decouverte: "historique_riche",
      nb_rdv_total: 5, derniere_activite_le: ilYaNJours(90), secteur_top: { secteur: "financier", label: "Institutions financières" } };
    const r = calculerDecouverte(state);
    const retour = r.find((c) => c.categorie === "retour_secteur");
    expect(retour).toBeDefined();
    expect(retour?.interpretation).toContain("Institutions financières");
  });

  it("21. Retour après absence, aucun secteur mais une fonctionnalité déjà régulièrement utilisée → réactive celle-ci", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen21"), stade_decouverte: "historique_riche",
      nb_rdv_total: 5, derniere_activite_le: ilYaNJours(90),
      engagement: { calculatrice: engagement({ confiance: "utilise_regulierement" }) } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.categorie === "retour_habitude" && c.source_type === "calculatrice")).toBe(true);
  });

  it("22. Activité récente (< 60 jours) → jamais traité comme un retour, même avec un historique riche", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen22"), stade_decouverte: "historique_riche",
      nb_rdv_total: 5, derniere_activite_le: ilYaNJours(10), secteur_top: { secteur: "financier", label: "Institutions financières" } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.categorie === "retour_secteur")).toBe(false);
  });
});

describe("Bandeau centres d'intérêt — scénarios d'acceptation (brief 27/08/2026)", () => {
  it("23. Compte ancien + aucune activité → bandeau proposé", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen23"), compte_cree_le: ilYaNJours(200) };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "interet")).toBe(true);
  });

  it("24. Compte ancien + historique important → pas de bandeau, même sans centres d'intérêt déclarés", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen24"), compte_cree_le: ilYaNJours(200),
      stade_decouverte: "historique_riche", nb_rdv_total: 5, derniere_activite_le: ilYaNJours(1) };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "interet")).toBe(false);
  });

  it("25. Nouveau compte + aucun signal → bandeau proposé", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen25"), compte_cree_le: ilYaNJours(1) };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "interet")).toBe(true);
  });

  it("26. Centres d'intérêt déjà configurés → jamais de bandeau", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen26"), centres_interet: ["mobile_money"] };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "interet")).toBe(false);
  });

  it("27. Bandeau ignoré plusieurs fois → fréquence limitée (même mécanisme de cooldown que les autres candidats, pas de logique parallèle)", () => {
    const state: DiscoveryState = { ...etatDecouverteVide("citoyen27"),
      engagement: { interet: engagement({ ignorances_consecutives: 1, derniere_vue_le: ilYaNJours(1), derniere_signature: "centres_interet_absent" }) } };
    const r = calculerDecouverte(state);
    expect(r.some((c) => c.source_type === "interet")).toBe(false);
  });
});
