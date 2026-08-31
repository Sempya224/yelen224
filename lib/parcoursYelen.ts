// "Votre parcours Yelen" — brief CEO "Up Next" (27/08/2026), inspiré de la
// logique Chime "Suggested for you" (référence comportementale, pas visuelle).
// Source unique des 5 étapes — jamais dupliquée entre le bandeau (Mon
// Assistant) et l'écran dédié (/compte/parcours-yelen). L'état
// completed/pending de chaque étape est calculé côté serveur
// (app/api/citoyen/assistant/route.ts::parcours), jamais recalculé ici :
// ce fichier ne décrit que le contenu statique (titres/CTA/destinations),
// jamais une donnée sur l'utilisateur.

export type EtapeParcoursCode =
  | "profile_completed"
  | "identity_verified"
  | "first_procedure_created"
  | "first_expense_completed"
  | "first_establishment_discovered";

export type EtapeParcoursDef = {
  code: EtapeParcoursCode;
  numero: number;
  titre: string;
  sousTexte: string;
  benefice: string;
  ctaLabel: string;
  destination: string;
  texteTermine: string;
};

// Étape 4 (dépense) explicitement non bloquante (brief §9) — une simple
// étape de découverte/activation, jamais une condition d'usage de Yelen.
// Non traité différemment ici (aucune étape n'est jamais bloquante dans ce
// système, voir brief §9), juste documenté pour mémoire.
export const ETAPES_PARCOURS_YELEN: EtapeParcoursDef[] = [
  {
    code: "profile_completed",
    numero: 1,
    titre: "Compléter votre profil",
    sousTexte: "Permet à Yelen de mieux vous connaître et d'améliorer votre expérience.",
    benefice: "Permet à Yelen de mieux personnaliser votre expérience.",
    ctaLabel: "Compléter mon profil",
    destination: "/compte/informations-personnelles",
    texteTermine: "Profil complété",
  },
  {
    code: "identity_verified",
    numero: 2,
    titre: "Vérifier votre identité",
    sousTexte: "Sécurisez votre compte et accédez pleinement aux fonctionnalités nécessitant un Yelen ID vérifié.",
    benefice: "Renforce la sécurité de votre compte et vous permet d'accéder aux fonctionnalités nécessitant un Yelen ID vérifié.",
    ctaLabel: "Vérifier mon identité",
    destination: "/compte/verification-identite",
    texteTermine: "Identité vérifiée",
  },
  {
    code: "first_procedure_created",
    numero: 3,
    titre: "Créer votre première démarche",
    sousTexte: "Laissez Yelen vous accompagner dans vos démarches et rendez-vous.",
    benefice: "Créez votre première démarche et laissez Yelen vous accompagner.",
    ctaLabel: "Créer ma première démarche",
    destination: "/compte/mes-demarches",
    texteTermine: "Première démarche créée",
  },
  {
    code: "first_expense_completed",
    numero: 4,
    // Retour Bryan 27/08/2026 : pas un cadrage "découvrir les services",
    // ce que le citoyen vient réellement faire ici c'est suivre ses
    // dépenses, se créer un budget et se fixer un objectif financier —
    // destination /menu/depenses inchangée, seul le cadrage change.
    titre: "Suivre vos dépenses",
    sousTexte: "Créez un budget, suivez vos dépenses et fixez-vous des objectifs financiers.",
    benefice: "Suivez vos dépenses, optimisez votre budget et fixez-vous des objectifs financiers.",
    ctaLabel: "Suivre mes dépenses",
    destination: "/menu/depenses",
    texteTermine: "Première dépense effectuée",
  },
  {
    code: "first_establishment_discovered",
    numero: 5,
    titre: "Trouver votre premier établissement",
    sousTexte: "Découvrez les établissements et professionnels disponibles sur Yelen.",
    benefice: "Découvrez les établissements et professionnels disponibles autour de vous.",
    ctaLabel: "Trouver un établissement",
    destination: "/recherche",
    texteTermine: "Premier établissement découvert",
  },
];

export type EtapeParcoursEtat = { code: EtapeParcoursCode; complete: boolean };

// Prochaine étape pertinente = la première non terminée dans l'ordre
// d'affichage (brief §5 : l'ordre n'impose pas une réalisation strictement
// séquentielle, mais sert à déterminer LA prochaine étape mise en avant).
export function prochaineEtapeParcours(etats: EtapeParcoursEtat[]): EtapeParcoursDef | null {
  const incomplete = etats.find((e) => !e.complete);
  if (!incomplete) return null;
  return ETAPES_PARCOURS_YELEN.find((d) => d.code === incomplete.code) ?? null;
}
