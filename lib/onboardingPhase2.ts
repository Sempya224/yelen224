// Taxonomies des écrans Onboarding Phase 2 (Usage/Attentes/Acquisition,
// chantier 11/09/2026, post-inscription) — intitulés fournis directement
// par Bryan depuis sa maquette, pas une liste inventée. "Autre" n'a pas de
// colonne texte libre dédiée (décision Bryan) : fondu dans le tableau
// comme "Autre : <texte>" si un texte est saisi, "Autre" seul sinon — même
// pattern que le motif "autre" des signalements.
export type OnboardingOption = { id: string; label: string };

export const OPTIONS_USAGE: OnboardingOption[] = [
  { id: "rdv", label: "Prendre rendez-vous avec des institutions" },
  { id: "decouvrir_services", label: "Découvrir des services et offres" },
  { id: "gerer_demarches", label: "Gérer mes démarches" },
  { id: "opportunites", label: "Trouver des opportunités" },
  { id: "suivre_activite", label: "Suivre mes rendez-vous et activités" },
  { id: "communaute", label: "Participer à la communauté" },
  { id: "activite_pro", label: "Utiliser Yelen dans le cadre de mon activité professionnelle" },
];

export const OPTIONS_ATTENTES: OnboardingOption[] = [
  { id: "gagner_temps", label: "Gagner du temps" },
  { id: "acces_institutions", label: "Accéder plus facilement aux institutions" },
  { id: "demarches_simples", label: "Faire mes démarches plus simplement" },
  { id: "nouveaux_services", label: "Trouver de nouveaux services" },
  { id: "developper_activite", label: "Développer mon activité" },
  { id: "opportunites", label: "Trouver des opportunités" },
  { id: "espace_fiable", label: "Avoir un espace fiable pour mes rendez-vous" },
];

export const OPTIONS_ACQUISITION: OnboardingOption[] = [
  { id: "proche", label: "Un proche ou une connaissance" },
  { id: "institution", label: "Une institution" },
  { id: "reseaux_sociaux", label: "Les réseaux sociaux" },
  { id: "recherche_internet", label: "Internet / recherche" },
  { id: "publicite", label: "Publicité" },
  { id: "evenement", label: "Événement" },
  { id: "recommandation_pro", label: "Recommandation professionnelle" },
];
