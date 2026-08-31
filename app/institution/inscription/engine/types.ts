// Moteur d'inscription (Lot 03-B) — état et progression du parcours.
// Construit en parallèle de app/institution/inscription/page.tsx (ancien
// formulaire, inchangé) : ce dossier n'est monté nulle part en production
// tant que la bascule (Lot 03-B.12) n'a pas eu lieu.

export type StepId =
  | "intro"
  | "phone"
  | "verification"
  | "responsable"
  | "activite"
  | "review"
  | "success";

// Étapes réellement adressables par URL (?step=...). "success" est atteint
// uniquement après création — jamais navigable en avance.
export const STEP_ORDER: StepId[] = [
  "intro", "phone", "verification", "responsable", "activite", "review", "success",
];

// Les 5 étapes du formulaire proprement dit, pour l'indicateur "Étape X sur 5"
// (intro et success n'en font pas partie — ni l'une ni l'autre ne collectent
// d'information).
export const FORM_STEPS: StepId[] = ["phone", "verification", "responsable", "activite", "review"];
export const FORM_STEP_LABELS: Record<string, string> = {
  phone: "Votre téléphone",
  verification: "Vérification",
  responsable: "Votre profil",
  activite: "Votre activité",
  review: "Vérification des informations",
};

export type ResponsableInfo = {
  prenom: string;
  nom: string;
  role: string;
};

export type ActiviteInfo = {
  // Chantier Taxonomie des activités (Phase 2, 20/08/2026) — remplace le
  // secteur plat unique par catégorie + activité principale (obligatoire)
  // + jusqu'à 3 activités secondaires (optionnelles). institutions.secteur
  // n'est plus jamais écrite par ce flux (gelée, pas supprimée).
  activiteCategorieId: string;
  activitePrincipaleId: string;
  activitesSecondairesIds: string[];
  statutJuridique: string;
  name: string;
  ville: string;
  email: string;
  website: string;
  description: string;
};

export type CreatedInstitution = {
  id: string;
  name: string;
};

export type SignupState = {
  phone: string; // E.164 +224XXXXXXXXX une fois soumis, vide sinon
  otpSent: boolean;
  phoneVerified: boolean;
  verifiedCode: string; // code confirmé par /verify-otp, consommé par /register
  responsable: ResponsableInfo;
  activite: ActiviteInfo;
  createdInstitution: CreatedInstitution | null;
};

export const EMPTY_SIGNUP_STATE: SignupState = {
  phone: "",
  otpSent: false,
  phoneVerified: false,
  verifiedCode: "",
  responsable: { prenom: "", nom: "", role: "" },
  activite: { activiteCategorieId: "", activitePrincipaleId: "", activitesSecondairesIds: [], statutJuridique: "", name: "", ville: "", email: "", website: "", description: "" },
  createdInstitution: null,
};

export function isActiviteComplete(a: ActiviteInfo): boolean {
  return Boolean(a.activiteCategorieId && a.activitePrincipaleId && a.statutJuridique && a.name.trim() && a.ville.trim());
}

// Une étape n'est atteignable que si toutes celles qui la précèdent dans
// STEP_ORDER sont déjà satisfaites — jamais une simple lecture de l'URL.
// C'est ce qui rend le retour navigateur et le refresh sûrs (section 15/16
// du brief) : l'URL est un raccourci de confort, jamais la source de vérité.
export function isStepReachable(step: StepId, state: SignupState): boolean {
  switch (step) {
    case "intro": return true;
    case "phone": return true;
    case "verification": return state.otpSent;
    case "responsable": return state.phoneVerified;
    case "activite": return state.responsable.prenom.trim() !== "" && state.responsable.nom.trim() !== "";
    case "review": return isActiviteComplete(state.activite);
    case "success": return state.createdInstitution !== null;
  }
}

export function furthestReachableStep(state: SignupState): StepId {
  let result: StepId = "intro";
  for (const step of STEP_ORDER) {
    if (isStepReachable(step, state)) result = step;
    else break;
  }
  return result;
}
