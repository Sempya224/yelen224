// État d'attention Yelen — Lot 0 (25/08/2026). Moteur pur, déterministe,
// zéro LLM, zéro accès DB à l'intérieur de ce fichier : le CitizenState
// est toujours injecté par l'appelant, jamais chargé ici (voir le plan
// figé pour le contrat complet). Le "Tier 0" du contrat n'apparaît jamais
// comme valeur : un fait résolu n'a simplement plus de raison de figurer
// dans le CitizenState fourni en entrée — c'est une absence, pas un état
// à supprimer après coup.
//
// Toute règle de priorité doit rester dans ce fichier, jamais dans un
// trigger Postgres ou dupliquée ailleurs — c'est ce qui la rend testable
// contre les 20 scénarios (lib/attentionEngine.test.ts).

export type SourceType =
  | "rdv" | "demarche" | "etape" | "depense" | "budget" | "objectif"
  | "document" | "reward" | "institution_suivie" | "identite" | "avis";

export type Effort = "faible" | "moyen" | "eleve";

export type PriorityItem = {
  source_type: SourceType;
  source_id: string;
  // Clé de mémoire comportementale (avec source_type) — Lot 3. Toujours
  // renseignée, même par une valeur générique (ex. "document") pour les
  // familles qui n'ont pas de sous-catégorie métier naturelle.
  categorie: string;
  tier: 1 | 2 | 3 | 4;
  interpretation: string;
  action_proposee: { label: string; effort: Effort; destination: string } | null;
  resultat_attendu: string | null;
  rule_version: string;
  // Référence l'événement dont la résolution ferait aussi disparaître cet
  // élément (ex. un document manquant dépend du RDV qu'il sécurise) — sert
  // uniquement au calcul du prochain geste, jamais au tri par tier.
  depend_de?: { source_type: SourceType; source_id: string };
};

// Mémoire comportementale — persistante, séparée de PriorityItem (un
// élément disparaît quand sa condition disparaît ; la mémoire, elle,
// survit). Fournie en lecture par l'appelant dans ce Lot 0 ; son stockage
// réel est hors périmètre ici.
export type BehaviorMemoryEntry = {
  source_type: SourceType;
  categorie: string;
  compteur_ignorance: number;
};

export type EtatDeVie = {
  chose_prioritaire: 0 | 1;
  demarches_en_cours: number;
  a_surveiller: number;
  problemes_reels: number;
  prochain_evenement: { type: string; date: string } | null;
  synthese: string;
};

export type CitizenState = {
  citoyen_id: string;
  rdv_a_venir: { id: string; institution: string; date: string; documents_manquants: string[] }[];
  demarches_ouvertes: { id: string; titre: string; categorie: string; echeance: string | null; en_retard: boolean }[];
  service_requiert_identite: boolean;
  identite_verifiee: boolean;
  budgets_depasses: { id: string; categorie: string; total: number; limite: number }[];
  depenses_anomalies: { id: string; categorie: string; variation_pct: number }[];
  depenses_recurrentes_a_venir: { id: string; libelle: string; montant: number; date: string }[];
  objectifs_en_cours: { id: string; titre: string; progression_pct: number }[];
  recompenses_disponibles: { id: string; label: string }[];
  publications_etablissements_suivis: { id: string; institution: string; rdv_lie_id: string | null; texte: string }[];
  avis_en_attente: { id: string; institution: string; rdv_prochain_id: string | null }[];
};

// Incrémentée manuellement à chaque changement de règle ci-dessous —
// jamais calculée, c'est la preuve d'audit ("pourquoi Yelen me montre
// ceci maintenant" se répond par cette version + les faits ci-dessus).
const RULE_VERSION = "attention_v1";

const EFFORT_RANG: Record<Effort, number> = { faible: 0, moyen: 1, eleve: 2 };
const TIER_RANG = { 1: 0, 2: 1, 3: 2, 4: 3 } as const;

function estEcheanceProche(dateISO: string, joursSeuil = 3): boolean {
  const cible = new Date(dateISO); cible.setHours(0, 0, 0, 0);
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
  return jours >= 0 && jours <= joursSeuil;
}

function memoirePour(memoire: BehaviorMemoryEntry[], source_type: SourceType, categorie: string): number {
  return memoire.find((m) => m.source_type === source_type && m.categorie === categorie)?.compteur_ignorance ?? 0;
}

function construireItems(state: CitizenState, memoire: BehaviorMemoryEntry[]): PriorityItem[] {
  const items: PriorityItem[] = [];

  // --- Tier 1 — blocage direct (dépendance entre deux événements) -------
  for (const rdv of state.rdv_a_venir) {
    if (rdv.documents_manquants.length > 0) {
      items.push({
        source_type: "document", source_id: rdv.id, tier: 1,
        categorie: "document",
        interpretation: `Un document manquant peut compromettre votre RDV du ${rdv.date} chez ${rdv.institution}.`,
        action_proposee: { label: "Envoyer le document", effort: "faible", destination: `/mes-rdv?rdv_id=${rdv.id}` },
        resultat_attendu: "RDV sécurisé.",
        rule_version: RULE_VERSION,
        depend_de: { source_type: "rdv", source_id: rdv.id },
      });
    }
  }
  if (state.service_requiert_identite && !state.identite_verifiee) {
    items.push({
      source_type: "identite", source_id: state.citoyen_id, categorie: "identite", tier: 1,
      interpretation: "Ce service nécessite une identité vérifiée.",
      action_proposee: { label: "Vérifier mon identité", effort: "moyen", destination: "/compte/verification-identite" },
      resultat_attendu: "Service débloqué.",
      rule_version: RULE_VERSION,
    });
  }

  // --- Tier 2 — échéance à conséquence réelle ---------------------------
  for (const d of state.demarches_ouvertes) {
    if (!d.echeance) continue;
    if (d.en_retard) {
      items.push({
        source_type: "demarche", source_id: d.id, categorie: d.categorie, tier: 2,
        interpretation: `« ${d.titre} » a une échéance dépassée.`,
        action_proposee: { label: "Traiter la démarche", effort: "moyen", destination: `/compte/mes-demarches?id=${d.id}` },
        resultat_attendu: "Démarche à jour.",
        rule_version: RULE_VERSION,
      });
    } else if (estEcheanceProche(d.echeance)) {
      items.push({
        source_type: "demarche", source_id: d.id, categorie: d.categorie, tier: 2,
        interpretation: `« ${d.titre} » arrive à échéance le ${d.echeance}.`,
        action_proposee: { label: "Voir la démarche", effort: "faible", destination: `/compte/mes-demarches?id=${d.id}` },
        resultat_attendu: "Démarche traitée à temps.",
        rule_version: RULE_VERSION,
      });
    }
  }
  for (const b of state.budgets_depasses) {
    items.push({
      source_type: "budget", source_id: b.id, categorie: b.categorie, tier: 2,
      interpretation: `Budget ${b.categorie} dépassé : ${b.total} / ${b.limite} GNF.`,
      action_proposee: { label: "Ajuster le budget", effort: "faible", destination: "/menu/depenses" },
      resultat_attendu: "Budget ajusté ou dépassement assumé en connaissance de cause.",
      rule_version: RULE_VERSION,
    });
  }
  for (const r of state.depenses_recurrentes_a_venir) {
    items.push({
      source_type: "depense", source_id: r.id, categorie: "recurrente", tier: 2,
      interpretation: `« ${r.libelle} » (${r.montant} GNF) est prévue le ${r.date}.`,
      action_proposee: { label: "J'ai payé — renouveler", effort: "faible", destination: "/menu/depenses" },
      resultat_attendu: "Cycle suivant programmé.",
      rule_version: RULE_VERSION,
    });
  }
  for (const p of state.publications_etablissements_suivis) {
    // Une publication générique sans RDV réel à proximité n'a pas de
    // contexte pertinent — jamais poussée (cf. règle anti-contenu générique).
    if (!p.rdv_lie_id) continue;
    items.push({
      source_type: "institution_suivie", source_id: p.id, categorie: "publication", tier: 2,
      interpretation: `${p.institution} a publié une information qui pourrait concerner votre RDV : « ${p.texte} »`,
      action_proposee: { label: "Vérifier mon RDV", effort: "faible", destination: `/mes-rdv?rdv_id=${p.rdv_lie_id}` },
      resultat_attendu: "RDV confirmé ou reporté en connaissance de cause.",
      rule_version: RULE_VERSION,
      depend_de: { source_type: "rdv", source_id: p.rdv_lie_id },
    });
  }

  // --- Tier 3 — anomalie, filtrée/rétrogradée par la mémoire comportementale
  for (const a of state.depenses_anomalies) {
    const ignorance = memoirePour(memoire, "depense", a.categorie);
    if (ignorance >= 2) continue; // silence appris : ne se propose plus du tout
    items.push({
      source_type: "depense", source_id: a.id, categorie: a.categorie, tier: ignorance === 1 ? 4 : 3,
      interpretation: `Vos dépenses ${a.categorie} ont varié de ${a.variation_pct}% ce mois-ci.`,
      action_proposee: { label: "Ajuster mon budget", effort: "moyen", destination: "/menu/depenses" },
      resultat_attendu: "Observation prise en compte.",
      rule_version: RULE_VERSION,
    });
  }
  for (const av of state.avis_en_attente) {
    // Pas de RDV à venir chez cette institution : aucun contexte pertinent
    // pour relancer maintenant.
    if (!av.rdv_prochain_id) continue;
    items.push({
      source_type: "avis", source_id: av.id, categorie: "avis", tier: 3,
      interpretation: `Vous retournez bientôt chez ${av.institution} — un avis sur votre dernière visite ?`,
      action_proposee: { label: "Laisser un avis", effort: "faible", destination: "/compte/mes-avis" },
      resultat_attendu: "Avis publié.",
      rule_version: RULE_VERSION,
    });
  }

  // --- Tier 4 — progression positive, jamais poussée au sommet ----------
  for (const o of state.objectifs_en_cours) {
    items.push({
      source_type: "objectif", source_id: o.id, categorie: "objectif", tier: 4,
      interpretation: `« ${o.titre} » est à ${o.progression_pct}%.`,
      action_proposee: null, resultat_attendu: null, rule_version: RULE_VERSION,
    });
  }
  for (const r of state.recompenses_disponibles) {
    items.push({
      source_type: "reward", source_id: r.id, categorie: "reward", tier: 4,
      interpretation: `${r.label} est disponible.`,
      action_proposee: { label: "Voir mes récompenses", effort: "faible", destination: "/menu/recompenses" },
      resultat_attendu: null, rule_version: RULE_VERSION,
    });
  }

  return items;
}

function comparerPriorite(a: PriorityItem, b: PriorityItem): number {
  if (a.tier !== b.tier) return TIER_RANG[a.tier] - TIER_RANG[b.tier];
  const ea = a.action_proposee ? EFFORT_RANG[a.action_proposee.effort] : 3;
  const eb = b.action_proposee ? EFFORT_RANG[b.action_proposee.effort] : 3;
  return ea - eb;
}

// Le ratio "réduction de risque en cascade / effort" ne départage jamais
// entre tiers différents — seulement à l'intérieur du tier déjà gagnant,
// verrouillé explicitement dans la conversation d'architecture.
function calculerProchainGeste(actifs: PriorityItem[]): PriorityItem | null {
  if (actifs.length === 0) return null;
  const tierPrioritaire = actifs[0].tier;
  const candidats = actifs.filter((i) => i.tier === tierPrioritaire);
  if (candidats.length === 1) return candidats[0];

  function scoreCascade(item: PriorityItem): number {
    if (!item.depend_de) return 0;
    return actifs.filter((autre) =>
      autre !== item && autre.depend_de
      && autre.depend_de.source_type === item.depend_de!.source_type
      && autre.depend_de.source_id === item.depend_de!.source_id
    ).length;
  }
  return [...candidats].sort((a, b) => scoreCascade(b) - scoreCascade(a) || comparerPriorite(a, b))[0];
}

function construireEtatDeVie(state: CitizenState, tous: PriorityItem[]): EtatDeVie {
  const problemesReels = tous.filter((i) => i.tier <= 2).length;
  const aSurveiller = tous.filter((i) => i.tier === 3).length;
  const prochainRdv = [...state.rdv_a_venir].sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    chose_prioritaire: problemesReels > 0 ? 1 : 0,
    demarches_en_cours: state.demarches_ouvertes.length,
    a_surveiller: aSurveiller,
    problemes_reels: problemesReels,
    prochain_evenement: prochainRdv ? { type: "rdv", date: prochainRdv.date } : null,
    synthese: problemesReels === 0 ? "Tout est sous contrôle." : `${problemesReels} chose${problemesReels > 1 ? "s" : ""} à régler.`,
  };
}

export function calculerEtatDattention(
  state: CitizenState,
  memoire: BehaviorMemoryEntry[] = []
): { etatDeVie: EtatDeVie; priorites: PriorityItem[]; prochainGeste: PriorityItem | null } {
  const tous = construireItems(state, memoire);
  // La file de priorité affichée ne montre jamais le Tier 4 (progression
  // positive pure) — il reste consultable passivement dans son propre
  // module, jamais en concurrence pour l'attention.
  const actifs = tous.filter((i) => i.tier <= 3).sort(comparerPriorite);
  return {
    etatDeVie: construireEtatDeVie(state, tous),
    priorites: actifs,
    prochainGeste: calculerProchainGeste(actifs),
  };
}

export function etatCitoyenVide(citoyen_id: string): CitizenState {
  return {
    citoyen_id,
    rdv_a_venir: [],
    demarches_ouvertes: [],
    service_requiert_identite: false,
    identite_verifiee: false,
    budgets_depasses: [],
    depenses_anomalies: [],
    depenses_recurrentes_a_venir: [],
    objectifs_en_cours: [],
    recompenses_disponibles: [],
    publications_etablissements_suivis: [],
    avis_en_attente: [],
  };
}
