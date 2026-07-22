// Valeurs par défaut partagées entre les routes API Confidentialité
// citoyen (Lot D) et la migration Lot A (20260724000002) — un seul
// endroit à changer si les défauts évoluent, plutôt que de dupliquer le
// même littéral dans chaque route. Reflète ce qui est déjà vrai
// aujourd'hui côté institution (voir api/institution/clients/route.ts) :
// nom/photo/profession déjà exposés, adresse/email/date de naissance ne
// le sont jamais.
export type ChampsVisibles = {
  nom_complet: boolean;
  photo: boolean;
  profession: boolean;
  adresse: boolean;
  email: boolean;
  date_naissance: boolean;
};

export const DEFAUT_CHAMPS_VISIBLES: ChampsVisibles = {
  nom_complet: true, photo: true, profession: true,
  adresse: false, email: false, date_naissance: false,
};

export const DEFAUT_PROFIL_PUBLIC = true;

export type PrefsPartage = { partage_historique_rdv: boolean; partage_historique_services: boolean };
export const DEFAUT_PARTAGE: PrefsPartage = { partage_historique_rdv: true, partage_historique_services: true };

export type PrefsCommunication = { communications_yelen: boolean; communications_etablissements: boolean; personnalisation: boolean };
export const DEFAUT_COMMUNICATION: PrefsCommunication = {
  communications_yelen: true, communications_etablissements: true, personnalisation: true,
};
