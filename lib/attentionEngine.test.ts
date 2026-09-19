// Les 20 citoyens de l'échange d'architecture, traduits en spécification
// exécutable — c'est la preuve du moteur, pas une démonstration en prose.
// Nécessite `npm install -D vitest` (non installé, voir le plan Lot 0).
import { describe, it, expect } from "vitest";
import { calculerEtatDattention, etatCitoyenVide, type CitizenState, type BehaviorMemoryEntry } from "./attentionEngine";

function dansNJours(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function ilYaNJours(n: number): string {
  return dansNJours(-n);
}

describe("État d'attention Yelen — 20 citoyens", () => {
  it("1. Fatoumata — nouvelle utilisatrice, aucun événement", () => {
    const r = calculerEtatDattention(etatCitoyenVide("fatoumata"));
    expect(r.priorites).toHaveLength(0);
    expect(r.prochainGeste).toBeNull();
    expect(r.etatDeVie.synthese).toBe("Tout est sous contrôle.");
  });

  it("2. Mamadou — RDV demain, document manquant → Tier 1 unique", () => {
    const state: CitizenState = { ...etatCitoyenVide("mamadou"),
      rdv_a_venir: [{ id: "rdv1", institution: "Mairie de Matoto", date: dansNJours(1), documents_manquants: ["copie CNI"] }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(1);
    expect(r.priorites[0].tier).toBe(1);
    expect(r.prochainGeste?.source_type).toBe("document");
  });

  it("3. Aïssatou — deux Tier 1 (document proche vs identité à échéance lointaine) → le document gagne", () => {
    const state: CitizenState = { ...etatCitoyenVide("aissatou"),
      rdv_a_venir: [{ id: "rdv2", institution: "Banque", date: dansNJours(1), documents_manquants: ["justificatif"] }],
      service_requiert_identite: true, identite_verifiee: false,
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(2);
    expect(r.priorites.every((p) => p.tier === 1)).toBe(true);
    expect(r.prochainGeste?.action_proposee?.effort).toBe("faible");
  });

  it("4. Ibrahima Sory — dépense transport +45%, sans historique d'ignorance → Tier 3", () => {
    const state: CitizenState = { ...etatCitoyenVide("ibrahima"),
      depenses_anomalies: [{ id: "an1", categorie: "transport", variation_pct: 45 }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(1);
    expect(r.priorites[0].tier).toBe(3);
  });

  it("5. Kadiatou — budget alimentation dépassé → Tier 2 avec résultat attendu chiffré", () => {
    const state: CitizenState = { ...etatCitoyenVide("kadiatou"),
      budgets_depasses: [{ id: "bud1", categorie: "alimentation", total: 520000, limite: 450000 }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites[0].tier).toBe(2);
    expect(r.priorites[0].interpretation).toContain("450000");
  });

  it("6. Sékou — dépense récurrente ignorée 2 fois → plus proposée du tout", () => {
    const state: CitizenState = { ...etatCitoyenVide("sekou"),
      depenses_anomalies: [{ id: "an2", categorie: "electricite", variation_pct: 10 }],
    };
    const memoire: BehaviorMemoryEntry[] = [{ source_type: "depense", categorie: "electricite", compteur_ignorance: 2 }];
    const r = calculerEtatDattention(state, memoire);
    expect(r.priorites).toHaveLength(0);
  });

  it("7. Mariam — démarche terminée hier, rien d'autre en cours → silence total", () => {
    const r = calculerEtatDattention(etatCitoyenVide("mariam"));
    expect(r.priorites).toHaveLength(0);
    expect(r.etatDeVie.problemes_reels).toBe(0);
  });

  it("8. Alpha — palier débloqué → Tier 4, jamais dans la file de priorité", () => {
    const state: CitizenState = { ...etatCitoyenVide("alpha"),
      recompenses_disponibles: [{ id: "rec1", label: "Badge Confiance" }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(0); // Tier 4 filtré de la file active
  });

  it("9. Bintou — recrée une démarche similaire (Yelen Memory testé côté état, pas côté moteur ici)", () => {
    // Le pré-remplissage est une responsabilité de l'assemblage du
    // CitizenState (Lot 1), pas du moteur de priorité — ce test confirme
    // seulement qu'une nouvelle démarche avec échéance normale produit un
    // Tier 2 standard, rien de spécial à ce niveau.
    const state: CitizenState = { ...etatCitoyenVide("bintou"),
      demarches_ouvertes: [{ id: "dem1", titre: "Extrait de naissance (2e enfant)", categorie: "personnel", echeance: dansNJours(2), en_retard: false }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites[0].tier).toBe(2);
  });

  it("10. Ousmane — démarche récurrente (facture téléphone) à échéance → Tier 2, action en un geste", () => {
    const state: CitizenState = { ...etatCitoyenVide("ousmane"),
      depenses_recurrentes_a_venir: [{ id: "rec2", libelle: "Facture téléphone", montant: 60000, date: dansNJours(1) }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites[0].action_proposee?.label).toBe("J'ai payé — renouveler");
  });

  it("11. Djénabou — publication d'établissement suivi liée à un RDV réel → Tier 2", () => {
    const state: CitizenState = { ...etatCitoyenVide("djenabou"),
      rdv_a_venir: [{ id: "rdv3", institution: "Clinique X", date: dansNJours(5), documents_manquants: [] }],
      publications_etablissements_suivis: [{ id: "pub1", institution: "Clinique X", rdv_lie_id: "rdv3", texte: "Fermeture exceptionnelle mardi" }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites.some((p) => p.source_type === "institution_suivie")).toBe(true);
  });

  it("11bis. publication SANS RDV lié → jamais poussée (anti contenu générique)", () => {
    const state: CitizenState = { ...etatCitoyenVide("djenabou2"),
      publications_etablissements_suivis: [{ id: "pub2", institution: "Clinique Y", rdv_lie_id: null, texte: "Nouvelle offre" }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(0);
  });

  it("12. Thierno — avis en attente AVEC RDV prochain chez la même institution → Tier 3", () => {
    const state: CitizenState = { ...etatCitoyenVide("thierno"),
      avis_en_attente: [{ id: "avis1", institution: "Mairie", rdv_prochain_id: "rdv4" }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites[0].tier).toBe(3);
  });

  it("12bis. avis en attente SANS RDV prochain → jamais relancé", () => {
    const state: CitizenState = { ...etatCitoyenVide("thierno2"),
      avis_en_attente: [{ id: "avis2", institution: "Mairie", rdv_prochain_id: null }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(0);
  });

  it("13. Hawa — démarche en retard depuis 3 semaines → reste Tier 2, ne descend jamais", () => {
    const state: CitizenState = { ...etatCitoyenVide("hawa"),
      demarches_ouvertes: [{ id: "dem2", titre: "Renouvellement passeport", categorie: "personnel", echeance: ilYaNJours(21), en_retard: true }],
    };
    // Même avec une mémoire d'ignorance élevée sur une AUTRE catégorie, le
    // retard réel n'est jamais rétrogradé (la règle de silence ne
    // s'applique qu'au Tier 3, jamais au Tier 1-2).
    const r = calculerEtatDattention(state, [{ source_type: "demarche", categorie: "personnel", compteur_ignorance: 5 }]);
    expect(r.priorites[0].tier).toBe(2);
  });

  it("14. Boubacar — document envoyé à l'instant → aucun élément actif, recalcul immédiat", () => {
    // L'état fourni représente déjà l'instant "après" l'événement — le RDV
    // n'a plus de documents_manquants.
    const state: CitizenState = { ...etatCitoyenVide("boubacar"),
      rdv_a_venir: [{ id: "rdv5", institution: "Mairie", date: dansNJours(1), documents_manquants: [] }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(0);
  });

  it("15. Fanta — utilisatrice établie, tout à jour → état de vie riche mais file vide", () => {
    const state: CitizenState = { ...etatCitoyenVide("fanta"),
      demarches_ouvertes: [{ id: "dem3", titre: "Suivi loyer", categorie: "personnel", echeance: dansNJours(20), en_retard: false }],
      rdv_a_venir: [{ id: "rdv6", institution: "Banque", date: dansNJours(21), documents_manquants: [] }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(0);
    expect(r.etatDeVie.demarches_en_cours).toBe(1);
    expect(r.etatDeVie.prochain_evenement?.date).toBe(dansNJours(21));
  });

  it("16. Amadou — objectif à 80% → Tier 4 seul, jamais poussé", () => {
    const state: CitizenState = { ...etatCitoyenVide("amadou"),
      objectifs_en_cours: [{ id: "obj1", titre: "Épargne voyage", progression_pct: 80 }],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(0);
  });

  it("17. Ramata — deux RDV la semaine, rien de manquant → file vide, état de vie informatif", () => {
    const state: CitizenState = { ...etatCitoyenVide("ramata"),
      rdv_a_venir: [
        { id: "rdv7", institution: "Hôpital", date: dansNJours(4), documents_manquants: [] },
        { id: "rdv8", institution: "Ambassade", date: dansNJours(6), documents_manquants: [] },
      ],
    };
    const r = calculerEtatDattention(state);
    expect(r.priorites).toHaveLength(0);
    expect(r.etatDeVie.prochain_evenement?.date).toBe(dansNJours(4));
  });

  it("18. Sidiki — dépense inhabituelle (Tier 3) et document manquant (Tier 1) → le document gagne toujours", () => {
    const state: CitizenState = { ...etatCitoyenVide("sidiki"),
      rdv_a_venir: [{ id: "rdv9", institution: "Mairie", date: dansNJours(1), documents_manquants: ["photo"] }],
      depenses_anomalies: [{ id: "an3", categorie: "loisirs", variation_pct: 60 }],
    };
    const r = calculerEtatDattention(state);
    expect(r.prochainGeste?.tier).toBe(1);
    expect(r.priorites.some((p) => p.tier === 3)).toBe(true); // reste visible, juste pas prioritaire
  });

  it("19. Néné — identité non vérifiée requise pour un service → Tier 1 pur", () => {
    const state: CitizenState = { ...etatCitoyenVide("nene"), service_requiert_identite: true, identite_verifiee: false };
    const r = calculerEtatDattention(state);
    expect(r.priorites[0].source_type).toBe("identite");
  });

  it("20. Yaya — a résolu son dernier blocage, rien de nouveau → silence honnête, pas de contenu fabriqué", () => {
    const r = calculerEtatDattention(etatCitoyenVide("yaya"));
    expect(r.priorites).toHaveLength(0);
    expect(r.prochainGeste).toBeNull();
    expect(r.etatDeVie.synthese).toBe("Tout est sous contrôle.");
  });
});
