// Libellés français du Journal d'activité — module PUR (aucun React, aucun
// import client), importable par l'écran (JournalUi.tsx, qui y ajoute icônes et
// couleurs) comme par les routes serveur (export). Source unique des libellés.
//
// Une action absente de LIBELLES_ACTIONS n'a volontairement pas de libellé
// (sens non établi) : elle est affichée telle quelle, en code brut, jamais
// remplacée par un libellé inventé. Actions dans ce cas à ce jour :
// acces_urgence_comptable, suppression_compte_acces_refuse,
// suppression_compte_revocation_echec.

export const LIBELLES_ACTIONS: Readonly<Record<string, string>> = {
  // Rendez-vous
  rdv_accepte: "Rendez-vous accepté",
  rdv_refuse: "Rendez-vous refusé",
  rdv_termine: "Rendez-vous terminé",
  rdv_absent: "Client marqué absent",
  rdv_confirme: "Rendez-vous confirmé",
  rdv_annule: "Rendez-vous annulé",
  rdv_validation_annulee: "Validation de rendez-vous annulée",
  suivi_rdv_modifie: "Suivi de rendez-vous modifié",
  // Clients
  note_client_modifiee: "Note client modifiée",
  note_client_ajoutee: "Note client ajoutée",
  rappel_envoye: "Rappel envoyé à un client",
  avis_repondu: "Réponse à un avis publiée",
  // Documents
  document_ajoute: "Document ajouté",
  document_supprime: "Document supprimé",
  document_citoyen_demande: "Document demandé à un client",
  document_citoyen_envoye: "Document envoyé à un client",
  document_institutionnel_depose: "Document de vérification déposé",
  // Tâches
  tache_creee: "Tâche créée",
  tache_modifiee: "Tâche modifiée",
  tache_supprimee: "Tâche supprimée",
  // Agenda
  evenement_cree: "Événement d'agenda créé",
  evenement_modifie: "Événement d'agenda modifié",
  evenement_supprime: "Événement d'agenda supprimé",
  // Équipe
  membre_cree: "Membre créé",
  membre_modifie: "Membre modifié",
  membre_supprime: "Membre supprimé",
  membre_acces_refuse: "Accès refusé à un membre",
  invitation_non_reconnue: "Invitation signalée comme non reconnue",
  responsable_modifie: "Profil du responsable modifié",
  // Sécurité du compte
  pin_change_personnel: "Code PIN personnel changé",
  pin_defini: "Code PIN défini",
  pin_retire: "Code PIN retiré",
  totp_active: "Double authentification activée",
  totp_desactive: "Double authentification désactivée",
  passkey_ajoutee: "Clé d'accès ajoutée",
  passkey_retiree: "Clé d'accès retirée",
  appareil_deconnecte: "Appareil déconnecté",
  appareils_deconnectes: "Appareils déconnectés",
  reauth_reussie: "Identité confirmée",
  reauth_echec: "Échec de confirmation d'identité",
  connexion: "Connexion",
  // Projets et notes
  projet_cree: "Projet créé",
  projet_modifie: "Projet modifié",
  projet_supprime: "Projet supprimé",
  note_creee: "Note créée",
  note_modifiee: "Note modifiée",
  note_supprimee: "Note supprimée",
  // Communication
  message_envoye: "Message envoyé à un client",
  message_recu: "Message reçu d'un client",
  // Établissement et compte
  disponibilites_modifiees: "Disponibilités modifiées",
  pause_reservations_activee: "Pause des réservations activée",
  pause_reservations_levee: "Pause des réservations levée",
  changement_profil_sensible: "Information sensible de l'établissement modifiée",
  modification_texte_public: "Texte public de la fiche modifié",
  changement_profil_complement_fourni: "Complément fourni à l'équipe Yelen",
  preferences_notification_modifiees: "Préférences de notification modifiées",
  suppression_compte_demandee: "Suppression du compte demandée",
  suppression_compte_annulee: "Suppression du compte annulée",
  // Paiements
  recu_verifie: "Reçu vérifié (QR code)",
  export_transactions: "Transactions exportées",
  export_rapport: "Rapport financier exporté",
  // Journal
  export_journal: "Journal d'activité exporté",
  export_verifie: "Export vérifié par un tiers",
  export_ecran: "Export de données d'un écran",
  // Offres partenaires
  offre_creee: "Offre créée",
  offre_modifiee: "Offre modifiée",
  offre_soumise: "Offre soumise à validation",
  offre_suspendue: "Offre suspendue",
  offre_archivee: "Offre archivée",
  offre_supprimee: "Offre supprimée",
  // Services payants
  service_cree: "Service créé",
  service_prix_modifie: "Prix d'un service modifié",
  service_suspendu: "Service suspendu",
  service_reactive: "Service réactivé",
  service_supprime: "Service supprimé",
  offre_approuvee: "Offre approuvée par Yelen",
  offre_refusee: "Offre refusée par Yelen",
  offre_suspendue_admin: "Offre suspendue par Yelen",
};

export function actionALibelle(action: string): boolean {
  return Object.prototype.hasOwnProperty.call(LIBELLES_ACTIONS, action);
}

// Libellé d'une action ; message_envoye interpole le nom du client destinataire
// quand il est connu (details.client_nom, présent depuis le 18/07/2026). Action
// inconnue : le code brut.
export function libelleAction(action: string, details?: Record<string, unknown> | null): string {
  if (action === "message_envoye") {
    const nom = typeof details?.client_nom === "string" ? details.client_nom : null;
    if (nom) return `Message envoyé à ${nom}`;
  }
  return actionALibelle(action) ? LIBELLES_ACTIONS[action] : action;
}

export const CATEGORIES = [
  { value: "rdv", label: "Rendez-vous" },
  { value: "clients", label: "Clients" },
  { value: "documents", label: "Documents" },
  { value: "taches", label: "Tâches" },
  { value: "agenda", label: "Agenda" },
  { value: "equipe", label: "Équipe" },
  { value: "projets", label: "Projets" },
  { value: "notes", label: "Notes" },
  { value: "communication", label: "Communication" },
  { value: "paiements", label: "Paiements" },
  { value: "compte", label: "Compte" },
  { value: "authentification", label: "Connexion" },
  { value: "disponibilites", label: "Disponibilités" },
  { value: "offres", label: "Offres" },
  { value: "journal", label: "Journal" },
  { value: "export", label: "Exports" },
  { value: "autre", label: "Autre" },
] as const;

export const NIVEAUX = [
  { value: "info", label: "Information" },
  { value: "succes", label: "Succès" },
  { value: "attention", label: "Attention" },
  { value: "erreur", label: "Erreur" },
  { value: "critique", label: "Critique" },
] as const;

export const PLATEFORMES = [
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile" },
  { value: "tablette", label: "Tablette" },
  { value: "api", label: "API" },
] as const;

// Valeur inconnue : la valeur brute (jamais un libellé inventé).
export function libelleCategorie(v: string): string { return CATEGORIES.find(c => c.value === v)?.label ?? v; }
export function libelleNiveau(v: string): string { return NIVEAUX.find(n => n.value === v)?.label ?? v; }
export function libellePlateforme(v: string): string { return PLATEFORMES.find(p => p.value === v)?.label ?? v; }

// Cible lisible — uniquement les tables dont le sens est établi dans le code ;
// toute autre valeur est rendue brute (`brut: true`) pour être affichée en mono.
const CIBLES_LISIBLES: Readonly<Record<string, string>> = {
  institution_membres: "Membre de l'équipe",
  institutions: "Établissement",
  institution_change_requests: "Demande d'examen",
  rdv: "Rendez-vous",
};
export function libelleCible(table: string): { texte: string; brut: boolean } {
  return Object.prototype.hasOwnProperty.call(CIBLES_LISIBLES, table)
    ? { texte: CIBLES_LISIBLES[table], brut: false }
    : { texte: table, brut: true };
}
