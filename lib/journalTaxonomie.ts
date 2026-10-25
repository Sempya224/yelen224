// Source unique de vérité de la taxonomie des actions du Journal
// d'activité — catégorie et niveau de gravité par défaut. Isomorphe
// client/serveur (comme lib/institutionPermissions.ts) : aucun import de
// next/server ni supabase-js ici, importé à la fois par
// app/institution/[id]/dashboard/components/JournalTab.tsx (filtre par
// catégorie) et lib/journalActivite.ts (remplissage colonne serveur).
//
// Liste exhaustive des actions réellement émises par enregistrerAction()
// à travers le code (vérifiée par grep sur app/api/institution/** et
// app/api/qr/validate, pas une liste supposée).

export type NiveauJournal = "info" | "succes" | "attention" | "erreur" | "critique";

export const ACTION_CATEGORIE: Record<string, string> = {
  // Rendez-vous
  rdv_accepte: "rdv",
  rdv_refuse: "rdv",
  rdv_termine: "rdv",
  rdv_absent: "rdv",
  rdv_confirme: "rdv",
  rdv_annule: "rdv",
  rdv_validation_annulee: "rdv",
  suivi_rdv_modifie: "rdv",
  // Clients
  note_client_modifiee: "clients",
  note_client_ajoutee: "clients",
  rappel_envoye: "clients",
  avis_repondu: "clients",
  // Documents
  document_ajoute: "documents",
  document_supprime: "documents",
  // Dépôt d'un document de vérification de l'établissement (documents_institution).
  document_institutionnel_depose: "documents",
  document_citoyen_demande: "documents",
  document_citoyen_envoye: "documents",
  // Tâches
  tache_creee: "taches",
  tache_modifiee: "taches",
  tache_supprimee: "taches",
  // Agenda
  evenement_cree: "agenda",
  evenement_modifie: "agenda",
  evenement_supprime: "agenda",
  // Équipe
  membre_cree: "equipe",
  membre_modifie: "equipe",
  membre_supprime: "equipe",
  membre_acces_refuse: "equipe",
  pin_change_personnel: "equipe",
  // Premier accès (sas de confiance, 16/09/2026) — un membre invité indique
  // ne pas reconnaître l'organisation avant d'accéder au dashboard.
  invitation_non_reconnue: "equipe",
  // Profil Responsable (audit 19/10/2026) — institution_responsables,
  // fiche descriptive distincte de institution_membres mais sous le même
  // groupe "Administration & accès" côté dashboard.
  responsable_modifie: "equipe",
  // Facteurs de sécurité du membre connecté (audit 19/10/2026) — 2FA TOTP
  // et clés d'accès WebAuthn, même catégorie que connexion/reauth_*.
  totp_active: "authentification",
  totp_desactive: "authentification",
  passkey_ajoutee: "authentification",
  passkey_retiree: "authentification",
  // PIN (pose / retrait) et appareils mémorisés révoqués (23/10/2026) —
  // même catégorie que passkeys/2FA, donc visibles dans "Activité de sécurité".
  pin_defini: "authentification",
  pin_retire: "authentification",
  appareil_deconnecte: "authentification",
  appareils_deconnectes: "authentification",
  // Projets
  projet_cree: "projets",
  projet_modifie: "projets",
  projet_supprime: "projets",
  // Notes (espace de travail)
  note_creee: "notes",
  note_modifiee: "notes",
  note_supprimee: "notes",
  // Communication
  message_envoye: "communication",
  // Journalisé côté citoyen (pas de membre_id), même catégorie que
  // message_envoye pour que le fil de conversation apparaisse complet
  // dans le Journal — sans ça, seuls les envois institution étaient
  // visibles, donnant une image biaisée (signalé le 18/07/2026).
  message_recu: "communication",
  // Disponibilités (refonte Enterprise 05/08/2026 — bouton "Historique")
  disponibilites_modifiees: "disponibilites",
  // Pause volontaire réservations (Booking Governance Lot 1, 18/10/2026)
  pause_reservations_activee: "disponibilites",
  pause_reservations_levee: "disponibilites",
  // Paiements / finance
  acces_urgence_comptable: "paiements",
  // Reçu Yelen (Lot E, décision CEO 05/08/2026) — QR de vérification
  // publique scanné (membre_id null, aucun membre à l'origine de l'action).
  recu_verifie: "paiements",
  // Transactions (Lot 3, refonte "journal financier Enterprise",
  // décision CEO 06/08/2026) — "toutes les exportations sont enregistrées
  // dans le journal d'activité".
  export_transactions: "paiements",
  // Export du Rapport financier exécutif (XLSX / PDF), enregistré dans exports.
  export_rapport: "paiements",
  // Compte institution
  suppression_compte_acces_refuse: "compte",
  // Cycle de vie de la demande de suppression (délai de grâce de 30 jours) et
  // préférences de notification du compte.
  suppression_compte_demandee: "compte",
  suppression_compte_annulee: "compte",
  suppression_compte_revocation_echec: "compte",
  preferences_notification_modifiees: "compte",
  // Changement sensible de profil (nom, ville, adresse, coordonnées, activité
  // principale) appliqué avec demande d'examen — politique de revérification,
  // docs/product/YELEN_REVERIFICATION_POLICY.md. Une ligne par champ modifié,
  // cible = la demande institution_change_requests.
  changement_profil_sensible: "compte",
  // Modification d'un des 3 textes publics (Conditions / Informations
  // importantes / Informations légales) — une ligne par texte modifié.
  modification_texte_public: "compte",
  // Réponse de l'établissement à une demande de complément de l'équipe Yelen.
  changement_profil_complement_fourni: "compte",
  // Authentification
  connexion: "authentification",
  // Moteur de réauthentification pour actions sensibles (16/09/2026,
  // mirroring REAUTH_SUCCESS/REAUTH_FAILED côté admin_logs).
  reauth_reussie: "authentification",
  reauth_echec: "authentification",
  // Journal (méta-actions sur le journal lui-même)
  export_journal: "journal",
  // Vérification publique d'un export par un tiers (réussie seulement) — membre_id
  // null, même convention que recu_verifie.
  export_verifie: "export",
  // Export CSV serveur d'un écran (RDV passés, accueil, paiements, historique
  // financier) : l'écran est dans details.ecran.
  export_ecran: "export",
  // Offres partenaires (chantier "Centre de pilotage des offres",
  // 02/08/2026). offre_approuvee/offre_refusee/offre_suspendue_admin sont
  // émises par la modération Yelen (membre_id null, même convention que
  // message_recu) — distinctes des actions institution correspondantes.
  offre_creee: "offres",
  offre_modifiee: "offres",
  offre_soumise: "offres",
  offre_suspendue: "offres",
  offre_archivee: "offres",
  offre_supprimee: "offres",
  offre_approuvee: "offres",
  offre_refusee: "offres",
  offre_suspendue_admin: "offres",
  // Catalogue de services payants (Lot 1a, API Services) — rangés sous
  // "paiements" : un changement de prix ou de disponibilité d'un service
  // payant a un impact financier direct (aucune catégorie "services" n'existe,
  // pas de nouvelle catégorie créée pour ce lot).
  service_cree: "paiements",
  service_prix_modifie: "paiements",
  service_suspendu: "paiements",
  service_reactive: "paiements",
  service_supprime: "paiements",
};

// Seules les actions dont le niveau par défaut diffère de "info" sont
// listées ici (fallback "info" dans enregistrerAction si absent).
export const NIVEAU_PAR_DEFAUT: Partial<Record<string, NiveauJournal>> = {
  document_supprime: "attention",
  tache_supprimee: "attention",
  evenement_supprime: "attention",
  membre_supprime: "attention",
  note_supprimee: "attention",
  rdv_refuse: "attention",
  rdv_absent: "attention",
  rdv_annule: "attention",
  rdv_validation_annulee: "attention",
  pause_reservations_activee: "attention",
  membre_acces_refuse: "erreur",
  invitation_non_reconnue: "critique",
  suppression_compte_acces_refuse: "erreur",
  suppression_compte_demandee: "attention",
  suppression_compte_annulee: "info",
  suppression_compte_revocation_echec: "attention",
  preferences_notification_modifiees: "info",
  changement_profil_sensible: "attention",
  modification_texte_public: "info",
  connexion: "succes",
  reauth_reussie: "succes",
  reauth_echec: "attention",
  // Affaiblissement d'un facteur de sécurité — même palier que
  // pause_reservations_activee : pas une erreur, mais à surveiller.
  totp_desactive: "attention",
  passkey_retiree: "attention",
  pin_retire: "attention",
  appareil_deconnecte: "attention",
  appareils_deconnectes: "attention",
  // Renforcement d'un facteur de sécurité — même palier que reauth_reussie.
  totp_active: "succes",
  passkey_ajoutee: "succes",
  pin_defini: "succes",
  offre_supprimee: "attention",
  offre_archivee: "attention",
  offre_suspendue: "attention",
  offre_suspendue_admin: "attention",
  offre_refusee: "attention",
  offre_approuvee: "succes",
  service_prix_modifie: "attention",
  service_suspendu: "attention",
  service_supprime: "attention",
  service_reactive: "succes",
};

export type RisqueJournal = "vert" | "orange" | "rouge";

// Score de risque (Lot E, 24/07/2026) — concept distinct de `niveau`
// (gravité générale du log) : ici on qualifie si une action mérite une
// attention particulière côté sécurité/gouvernance. Règles déterministes
// fondées sur l'action réelle + son contexte (details.champs), pas de
// détection comportementale (volume anormal, horaires inhabituels) —
// ça demanderait un historique de référence par membre, hors scope de ce
// lot (voir /chantier-journal-activite dans CLAUDE.md).
export function scoreRisque(action: string, niveau: string, details: Record<string, unknown>): RisqueJournal {
  if (action.endsWith("_supprime")) return "rouge";
  if (action === "membre_acces_refuse") return "rouge";
  const champs = Array.isArray((details as { champs?: unknown }).champs) ? (details as { champs: unknown[] }).champs : [];
  if (action === "membre_modifie" && champs.includes("role")) return "rouge";
  if (action === "membre_modifie" && champs.includes("actif")) return "orange";
  if (action === "suppression_compte_acces_refuse") return "orange";
  if (niveau === "critique") return "rouge";
  if (niveau === "attention" || niveau === "erreur") return "orange";
  return "vert";
}
