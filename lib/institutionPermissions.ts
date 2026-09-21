// Source unique de vérité du RBAC Yelen PRO (5 rôles institution_membres).
// Importé à la fois côté client ("use client", pour masquer la nav) et
// côté serveur (routes API, pour le 403 réel) — ne jamais ajouter ici un
// import qui ne tourne pas dans les deux environnements (pas de
// next/server, pas de supabase-js).
//
// Les tabs du dashboard n'ont aucune URL propre (state React pur dans
// page.tsx) : TAB_MATRIX ne pilote que le masquage de menu (cosmétique).
// La vraie barrière de sécurité est ACTION_MATRIX + can(), vérifié dans
// chaque route API avant d'exécuter une action.

export const MEMBRE_ROLES = ["admin", "agent", "comptable", "superviseur", "dirigeant"] as const;
export type MembreRole = (typeof MEMBRE_ROLES)[number];

export function isMembreRole(value: unknown): value is MembreRole {
  return typeof value === "string" && (MEMBRE_ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<MembreRole, string> = {
  admin: "Admin",
  agent: "Agent d'accueil",
  comptable: "Comptable",
  superviseur: "Superviseur",
  dirigeant: "Dirigeant",
};

export const ROLE_DESCRIPTIONS: Record<MembreRole, string> = {
  admin: "Accès total, y compris la gestion de l'équipe et les rôles.",
  agent: "RDV, clients, validation de présence — pas les finances ni la configuration.",
  comptable: "Services, tarifs, paiements et historique — pas la gestion d'équipe.",
  superviseur: "Supervise les équipes, réorganise agendas et priorités, aucune configuration système.",
  dirigeant: "Vue exécutive, statistiques et rapports — lecture seule sur le sensible, ne pilote pas les opérations.",
};

// "configuration-hotel" (chantier Hôtel, Phase 3, 19/08/2026) : onglet
// additionnel gaté par institutions.secteur === "hotel" (filtre appliqué
// dans page.tsx, même patron que "mes-offres"/partenaire_statut — pas ici,
// TAB_MATRIX ne connaît que le rôle, jamais le secteur). Même palier que
// "conditions-informations" (admin only) car il écrit le même champ
// (informations_importantes) via la même route — aucune nouvelle ActionKey
// nécessaire, "profil_entreprise.write" reste la barrière serveur réelle.
// "support" (chantier "Séparation Messagerie/Support" 06/09/2026) : écran
// dédié Support Yelen, ouvert dans un nouvel onglet navigateur (URL propre
// /{slug}/{id}/support) depuis le panneau header "Aide & ressources" —
// jamais un lien de sidebar (voir layout.tsx, aucune entrée NAV_GROUPS).
// Volontairement "full" pour les 5 rôles dans TAB_MATRIX ci-dessous : même
// principe que Feedback/Guide/FAQ, hors RBAC métier (contacter Yelen n'est
// pas une donnée citoyenne sensible).
export const TAB_KEYS = [
  "accueil", "rdv", "disponibilites", "services", "valider-rdv",
  "communication", "communaute-pro", "signalements", "scanner", "codeqr", "analyse", "parametres",
  "profil-entreprise", "conditions-informations", "configuration-hotel", "profil-responsable", "documents", "mes-clients",
  "avis-reputation", "messagerie", "support", "questions-clients",
  "rdv-historique", "equipe", "journal", "espace-travail",
  "paiements", "transactions", "historique-financier", "facturation",
  "rapports", "documents-financiers", "documents-clients", "profil",
  "partenariat", "mes-offres", "clock-in-shift",
  // Écrans dédiés issus de l'éclatement de "Paramètres" (14/09/2026) — même
  // palier d'accès que "parametres" pour chaque rôle ci-dessous, cet écran
  // ne faisant plus qu'y lister des liens vers ces 4 nouveaux onglets.
  "parametres-securite", "parametres-notifications", "parametres-support", "parametres-legal",
  // Module Collaboration (Lot A, 16/09/2026) — espace interne membre <->
  // membre, distinct de "messagerie" (citoyen <-> institution).
  "collaboration",
  // "Yelen Business" (17/09/2026, schéma à 4 sections repris de Bryan le
  // même jour) — 3e menu du panneau Compte, ouvert via l'item "Plus" :
  // relation commerciale institution <-> Yelen (compte/contrat, forfait,
  // frais/commission de la plateforme, documents Yelen, support dédié),
  // distincte des écrans Finance ci-dessus qui gèrent l'argent des clients
  // de l'institution. Même palier d'accès que le groupe Finance (admin +
  // comptable uniquement) — écrans à l'état vide pour l'instant (aucune
  // ActionKey/route encore). "yelen-frais"/"yelen-commission" fusionnées en
  // une seule entrée "yelen-frais-commissions" (retour Bryan), "yelen-paiement"
  // renommée "yelen-paiements" (cohérence avec le pluriel du reste du menu).
  "yelen-compte", "yelen-contrat", "yelen-forfait", "yelen-paiements",
  "yelen-transactions", "yelen-reconciliation", "yelen-frais-commissions",
  "yelen-facturation", "yelen-documents", "yelen-support",
] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}

export type TabAccess = "full" | "read" | "none";

// Un onglet par écran existant du dashboard. "guide" reste hors RBAC
// (accessible à tous, aucune donnée sensible) et n'apparaît pas ici.
// "messagerie" (chantier Messagerie 19/07/2026, écran dédié qui remplace
// l'ancien widget flottant) suit exactement le même accès que
// "mes-clients" — c'est la même relation citoyenne, juste un autre canal.
const TAB_MATRIX: Record<MembreRole, Record<TabKey, TabAccess>> = {
  admin: {
    accueil: "full", rdv: "full", disponibilites: "full", services: "full",
    "valider-rdv": "full", communication: "full", "communaute-pro": "full", signalements: "full", scanner: "full", codeqr: "full",
    analyse: "full", parametres: "full", "profil-entreprise": "full", "conditions-informations": "full", "configuration-hotel": "full",
    "profil-responsable": "full", documents: "full", "mes-clients": "full",
    "avis-reputation": "full", messagerie: "full", support: "full", "questions-clients": "full",
    "rdv-historique": "full", equipe: "full", journal: "full", "espace-travail": "full",
    paiements: "full", transactions: "full", "historique-financier": "full",
    facturation: "full", rapports: "full", "documents-financiers": "full", "documents-clients": "full", profil: "full",
    partenariat: "full", "mes-offres": "full", "clock-in-shift": "full",
    "parametres-securite": "full", "parametres-notifications": "full", "parametres-support": "full", "parametres-legal": "full",
    collaboration: "full",
    "yelen-compte": "full", "yelen-contrat": "full", "yelen-forfait": "full", "yelen-paiements": "full",
    "yelen-transactions": "full", "yelen-reconciliation": "full", "yelen-frais-commissions": "full",
    "yelen-facturation": "full", "yelen-documents": "full", "yelen-support": "full",
  },
  // Front office pur (retour Bryan 13/09/2026) : l'agent d'accueil n'a plus
  // aucun onglet en lecture seule — un accès "read" qu'il ne peut pas
  // actionner n'a pas sa place dans son menu, mieux vaut qu'il ne le voie
  // pas du tout (disponibilites/communication/communaute-pro/signalements
  // passés de "read" à "none"). "accueil" redirige désormais vers
  // "valider-rdv" pour ce rôle (voir layout.tsx) — l'agent n'a plus de vue
  // d'ensemble générique, au même principe que le comptable et sa
  // FinanceAccueilTab dédiée.
  agent: {
    accueil: "full", rdv: "full", disponibilites: "none", services: "none",
    "valider-rdv": "full", communication: "none", "communaute-pro": "none", signalements: "none", scanner: "full", codeqr: "full",
    analyse: "none", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "none", documents: "none", "mes-clients": "full",
    "avis-reputation": "full", messagerie: "full", support: "full", "questions-clients": "full",
    "rdv-historique": "none", equipe: "none", journal: "none", "espace-travail": "full",
    paiements: "none", transactions: "none", "historique-financier": "none",
    facturation: "none", rapports: "none", "documents-financiers": "none", "documents-clients": "none", profil: "full",
    partenariat: "none", "mes-offres": "none", "clock-in-shift": "none",
    "parametres-securite": "none", "parametres-notifications": "none", "parametres-support": "none", "parametres-legal": "none",
    collaboration: "full",
    "yelen-compte": "none", "yelen-contrat": "none", "yelen-forfait": "none", "yelen-paiements": "none",
    "yelen-transactions": "none", "yelen-reconciliation": "none", "yelen-frais-commissions": "none",
    "yelen-facturation": "none", "yelen-documents": "none", "yelen-support": "none",
  },
  // Menu strictement financier — décision CEO 22/07/2026 : le comptable
  // n'est plus lecteur des écrans des autres rôles (communication, analyse,
  // mes-clients, rdv-historique retirés), il a son propre espace de travail.
  comptable: {
    accueil: "full", rdv: "none", disponibilites: "none", services: "full",
    "valider-rdv": "none", communication: "none", "communaute-pro": "none", signalements: "none", scanner: "none", codeqr: "none",
    analyse: "none", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "none", documents: "none", "mes-clients": "none",
    "avis-reputation": "none", messagerie: "none", support: "full", "questions-clients": "none",
    "rdv-historique": "none", equipe: "none", journal: "none", "espace-travail": "none",
    paiements: "full", transactions: "full", "historique-financier": "full",
    facturation: "full", rapports: "full", "documents-financiers": "full", "documents-clients": "none", profil: "full",
    partenariat: "none", "mes-offres": "none", "clock-in-shift": "none",
    "parametres-securite": "none", "parametres-notifications": "none", "parametres-support": "none", "parametres-legal": "none",
    collaboration: "full",
    "yelen-compte": "full", "yelen-contrat": "full", "yelen-forfait": "full", "yelen-paiements": "full",
    "yelen-transactions": "full", "yelen-reconciliation": "full", "yelen-frais-commissions": "full",
    "yelen-facturation": "full", "yelen-documents": "full", "yelen-support": "full",
  },
  superviseur: {
    accueil: "full", rdv: "full", disponibilites: "full", services: "full",
    "valider-rdv": "none", communication: "full", "communaute-pro": "full", signalements: "full", scanner: "none", codeqr: "none",
    analyse: "full", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "none", documents: "none", "mes-clients": "full",
    "avis-reputation": "full", messagerie: "full", support: "full", "questions-clients": "full",
    "rdv-historique": "full", equipe: "none", journal: "full", "espace-travail": "full",
    paiements: "none", transactions: "none", "historique-financier": "none",
    facturation: "none", rapports: "none", "documents-financiers": "none", "documents-clients": "full", profil: "full",
    partenariat: "full", "mes-offres": "full", "clock-in-shift": "read",
    "parametres-securite": "none", "parametres-notifications": "none", "parametres-support": "none", "parametres-legal": "none",
    collaboration: "full",
    "yelen-compte": "none", "yelen-contrat": "none", "yelen-forfait": "none", "yelen-paiements": "none",
    "yelen-transactions": "none", "yelen-reconciliation": "none", "yelen-frais-commissions": "none",
    "yelen-facturation": "none", "yelen-documents": "none", "yelen-support": "none",
  },
  dirigeant: {
    accueil: "full", rdv: "read", disponibilites: "none", services: "none",
    "valider-rdv": "none", communication: "read", "communaute-pro": "read", signalements: "read", scanner: "none", codeqr: "none",
    analyse: "full", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "read", documents: "read", "mes-clients": "none",
    "avis-reputation": "read", messagerie: "none", support: "full", "questions-clients": "none",
    "rdv-historique": "read", equipe: "read", journal: "read", "espace-travail": "full",
    paiements: "none", transactions: "none", "historique-financier": "none",
    facturation: "none", rapports: "none", "documents-financiers": "none", "documents-clients": "none", profil: "full",
    partenariat: "read", "mes-offres": "read", "clock-in-shift": "read",
    "parametres-securite": "none", "parametres-notifications": "none", "parametres-support": "none", "parametres-legal": "none",
    collaboration: "full",
    "yelen-compte": "none", "yelen-contrat": "none", "yelen-forfait": "none", "yelen-paiements": "none",
    "yelen-transactions": "none", "yelen-reconciliation": "none", "yelen-frais-commissions": "none",
    // "yelen-documents" passé à "read" pour le dirigeant (retour Bryan
    // 18/09/2026, écran Documents Yelen : "Administrateur/Dirigeant →
    // consultation complète") — seule exception au palier Finance uniforme
    // (admin+comptable) posé le 17/09/2026 pour toute la section Yelen
    // Business. Cohérent avec le reste du rôle dirigeant ici (read sur
    // profil-responsable/documents/avis-reputation/rdv-historique/equipe/
    // journal/partenariat/mes-offres/clock-in-shift) — "lecture seule sur
    // le sensible", jamais un pilotage opérationnel.
    "yelen-facturation": "none", "yelen-documents": "read", "yelen-support": "none",
  },
};

// Actions fines vérifiées côté serveur — chaque route API référence une de
// ces clés avant d'exécuter une écriture. C'est ça la vraie barrière (les
// tabs ci-dessus n'ont pas d'URL, donc rien côté client ne peut être fiable).
export type ActionKey =
  | "equipe.write" | "equipe.read_full"
  | "journal.read" | "journal.export"
  | "rdv.write" | "rdv.delete_historique"
  | "disponibilites.write"
  | "services.write"
  | "mes_clients.write" | "mes_clients.delete"
  | "avis.repondre"
  | "questions.repondre"
  | "communication.publish_annonce"
  | "communaute_pro.publish"
  | "espace_travail.write_projet"
  | "profil_entreprise.write" | "profil_responsable.write"
  | "documents_institutionnels.write"
  | "compte.delete_request"
  | "paiements.rembourser" | "facturation.write"
  | "offres.write" | "offres.submit"
  | "clock_in.write" | "clock_in.read_full"
  | "signalements.write" | "signalements.manage" | "signalements.reopen"
  | "signalements.notes_read" | "signalements.notes_write" | "signalements.attachments_write"
  | "documents_clients.write" | "documents_clients.verify" | "documents_clients.archive"
  | "appointment.check_in"
  | "securite_institution.write"
  // Module Collaboration (Lot A, 16/09/2026) — collaboration.send (DM).
  // Lot B (groupes) : create_group ouvert aux 5 rôles (même palier que
  // send) ; add_member/remove_member sont en plus toujours vérifiés au
  // niveau ressource dans la route (créateur du groupe OU admin — une
  // permission de rôle seule ne suffit pas à distinguer "mon groupe" d'un
  // groupe créé par quelqu'un d'autre).
  // Lot D (16/09/2026) : edit_message/delete_message/upload_file ouverts
  // aux 5 rôles (même palier) — la vraie barrière reste "auteur du
  // message" pour edit/delete, vérifiée au niveau ressource dans la
  // route, jamais seulement par le rôle. "moderate" (supprimer/modérer le
  // message d'un AUTRE membre) hors périmètre — non demandé, non construit.
  | "collaboration.send" | "collaboration.create_group" | "collaboration.manage_group"
  | "collaboration.edit_message" | "collaboration.delete_message" | "collaboration.upload_file"
  // Yelen Business → Transactions (18/09/2026) — registre financier du
  // compte institution <-> Yelen, distinct de "paiements.rembourser"
  // (remboursement CLIENT de l'institution). TAB_MATRIX["yelen-transactions"]
  // limite déjà l'onglet à admin/comptable ; ces clés existent pour
  // distinguer, DANS ces 2 rôles, ce qui est vraiment sensible (référence
  // brute du prestataire de paiement, action de remboursement) de ce qui
  // ne l'est pas (consulter la liste, l'export).
  | "yelen_transactions.voir" | "yelen_transactions.voir_details_financiers"
  | "yelen_transactions.exporter" | "yelen_transactions.voir_references_prestataire"
  | "yelen_transactions.gerer_remboursements"
  // Yelen Business → Réconciliation (18/09/2026) — écran distinct de
  // Transactions (rapprocher Yelen vs prestataire, pas juste consulter
  // l'historique) : protection délibérément plus étroite, en particulier
  // "cloturer_periode" (retour Bryan §16 : "réservée à un rôle autorisé").
  | "yelen_reconciliation.voir" | "yelen_reconciliation.voir_ecarts"
  | "yelen_reconciliation.confirmer_correspondance" | "yelen_reconciliation.exclure_transaction"
  | "yelen_reconciliation.marquer_ecart_resolu" | "yelen_reconciliation.cloturer_periode"
  | "yelen_reconciliation.exporter_rapport"
  // Yelen Business → Frais & commissions (18/09/2026) — lecture seule
  // (les conditions tarifaires restent déterminées par Yelen, jamais
  // modifiables côté établissement, retour Bryan §16), donc pas de clé
  // d'écriture ici contrairement à Réconciliation.
  | "yelen_frais.voir" | "yelen_frais.voir_conditions_tarifaires"
  | "yelen_frais.exporter" | "yelen_frais.voir_commissions_yelen" | "yelen_frais.voir_frais_prestataires"
  // Yelen Business → Facturation (18/09/2026) — "gerer_forfait" gate
  // uniquement le raccourci CTA affiché sur CET écran (le vrai accès à
  // l'onglet Forfait reste TAB_MATRIX["yelen-forfait"]) : retour Bryan
  // explicite §17, ne jamais l'accorder automatiquement à un rôle qui
  // peut seulement consulter les factures.
  | "yelen_facturation.voir" | "yelen_facturation.voir_factures"
  | "yelen_facturation.telecharger_factures" | "yelen_facturation.voir_informations_facturation"
  | "yelen_facturation.exporter_historique" | "yelen_facturation.effectuer_paiement"
  | "yelen_facturation.gerer_forfait"
  // Yelen Business → Documents Yelen (18/09/2026) — coffre documentaire
  // agrégeant les pièces des autres écrans Yelen Business. Split demandé
  // §15 : comptable voit les documents financiers mais pas les contrats
  // (hors de son périmètre habituel, cf. TAB_MATRIX.comptable déjà "none"
  // sur "yelen-contrat").
  | "yelen_documents.voir" | "yelen_documents.voir_documents_financiers"
  | "yelen_documents.voir_contrats" | "yelen_documents.telecharger" | "yelen_documents.exporter";

const ACTION_MATRIX: Record<ActionKey, Partial<Record<MembreRole, true>>> = {
  "equipe.write": { admin: true },
  "equipe.read_full": { admin: true, superviseur: true, dirigeant: true },
  "journal.read": { admin: true, superviseur: true, dirigeant: true },
  // Export est une opération de lecture (pas d'écriture) — mêmes rôles que
  // journal.read, cohérent avec l'accès "read" déjà accordé à dirigeant.
  "journal.export": { admin: true, superviseur: true, dirigeant: true },
  "rdv.write": { admin: true, agent: true, superviseur: true },
  "rdv.delete_historique": { admin: true },
  "disponibilites.write": { admin: true, superviseur: true },
  "services.write": { admin: true, comptable: true, superviseur: true },
  "mes_clients.write": { admin: true, agent: true, superviseur: true },
  "mes_clients.delete": { admin: true },
  // Mêmes rôles que mes_clients.write — répondre à un avis est une action
  // de front office au même titre qu'une note client.
  "avis.repondre": { admin: true, agent: true, superviseur: true },
  // Mêmes rôles que avis.repondre — répondre à une question publique est
  // la même nature d'action de front office.
  "questions.repondre": { admin: true, agent: true, superviseur: true },
  "communication.publish_annonce": { admin: true, superviseur: true },
  // Même palier que communication.publish_annonce — même nature d'action
  // (front commercial/marketing de l'institution vers les citoyens), juste
  // un canal différent (fil Yelen Community vs Annonces).
  "communaute_pro.publish": { admin: true, superviseur: true },
  "espace_travail.write_projet": { admin: true, superviseur: true },
  "profil_entreprise.write": { admin: true },
  "profil_responsable.write": { admin: true },
  "documents_institutionnels.write": { admin: true },
  "compte.delete_request": { admin: true },
  // Domaine protégé du comptable — admin éligible ici au sens du rôle, mais
  // sa route API ajoute en plus un check runtime (lib/comptableProtection.ts,
  // accesUrgenceAdminDebloque) : bloqué tant qu'un comptable actif existe.
  // Le comptable, lui, n'est jamais soumis à ce check supplémentaire.
  "paiements.rembourser": { admin: true, comptable: true },
  "facturation.write": { admin: true, comptable: true },
  // Rédaction/soumission d'offres partenaire — même paire de rôles que
  // communication.publish_annonce (front commercial/marketing de
  // l'institution), pas le domaine de l'agent ni du comptable.
  "offres.write": { admin: true, superviseur: true },
  "offres.submit": { admin: true, superviseur: true },
  // Clock In Shift (module Enterprise de pointage, décision CEO
  // 26/07/2026) : même forme que equipe.write/equipe.read_full — gestion
  // du personnel (employees/departments/work_schedules), domaine
  // équivalent à "équipe" mais délibérément une table séparée
  // (employees ≠ institution_membres, voir CLAUDE.md
  // /chantier-clock-in-shift). Écriture réservée admin, lecture complète
  // ouverte à superviseur/dirigeant (cohérent avec leur accès "read" sur
  // l'onglet clock-in-shift dans TAB_MATRIX).
  "clock_in.write": { admin: true },
  "clock_in.read_full": { admin: true, superviseur: true, dirigeant: true },
  // Signalements — Lot 1 case management (08/08/2026). Base déjà posée par
  // TAB_MATRIX.signalements (admin=full, agent=read, comptable=none,
  // superviseur=full, dirigeant=read) — ces clés ne dépassent jamais ce
  // palier sauf notes_read/dirigeant, justifié explicitement ci-dessous.
  "signalements.write": { admin: true, superviseur: true },
  // Verbe ombrelle (assigner/priorité/statut/résoudre/clôturer/escalader/
  // doublon) — mêmes rôles que .write, comme equipe.write couvre plusieurs
  // verbes sans les séparer inutilement.
  "signalements.manage": { admin: true, superviseur: true },
  // Réouverture annule une décision déjà prise — action à plus fort impact,
  // restreinte plus étroitement que .manage (même logique que
  // rdv.delete_historique admin-seul vs rdv.write plus large).
  "signalements.reopen": { admin: true },
  // Note interne = "sensible" au sens de ROLE_DESCRIPTIONS.dirigeant
  // ("lecture seule sur le sensible") — dirigeant lit, agent non malgré son
  // accès "read" sur l'onglet (pas de mandat de supervision, éviter
  // d'exposer une délibération interne au personnel de première ligne qui
  // interagit au quotidien avec le citoyen concerné).
  "signalements.notes_read": { admin: true, superviseur: true, dirigeant: true },
  "signalements.notes_write": { admin: true, superviseur: true },
  "signalements.attachments_write": { admin: true, superviseur: true },
  // Documents clients — Lot 1 case management (09/08/2026). Base déjà posée
  // par TAB_MATRIX["documents-clients"] (admin/comptable/superviseur=full,
  // agent/dirigeant=none) — ces 3 clés reprennent exactement le même
  // palier, elles servent seulement à distinguer les verbes (créer une
  // demande/envoi, vérifier/valider/refuser, archiver) une fois qu'un
  // écran (Lot 3) aura besoin de désactiver un bouton précis plutôt que
  // tout l'onglet.
  // Retiré au comptable (retour Bryan 16/09/2026) — "documents-clients" est
  // désormais "none" dans TAB_MATRIX pour ce rôle, ces 3 clés n'auraient
  // plus eu d'écran d'où être déclenchées.
  "documents_clients.write": { admin: true, superviseur: true },
  "documents_clients.verify": { admin: true, superviseur: true },
  "documents_clients.archive": { admin: true, superviseur: true },
  // Validation de présence par scan QR (GAP-05-01, 13/09/2026) — mêmes
  // rôles que TAB_MATRIX.scanner ("full" uniquement pour admin/agent,
  // "none" pour les 3 autres) : cette clé ne fait qu'appliquer côté
  // serveur ce que la nav masquait déjà côté client, aucun changement de
  // comportement pour un rôle existant.
  "appointment.check_in": { admin: true, agent: true },
  // Sécurité institution-wide (PIN/passkeys/appareils du compte principal,
  // onglet "Sécurité du compte") — révue critique 16/09/2026, faille réelle
  // trouvée : register-options/register-verify n'avaient qu'un contrôle de
  // session, aucun contrôle de rôle. Comme auth-verify authentifie
  // systématiquement comme le compte_principal (peu importe qui a
  // enregistré la clé), un rôle non-admin pouvait s'auto-attribuer un accès
  // équivalent admin en enregistrant sa propre passkey via un appel direct.
  // Même palier que TAB_MATRIX["parametres-securite"] (admin seul).
  "securite_institution.write": { admin: true },
  // Module Collaboration (Lot A, 16/09/2026) — écrire dans une conversation
  // interne, ouvert aux 5 rôles (même périmètre que TAB_MATRIX.collaboration).
  "collaboration.send": { admin: true, agent: true, comptable: true, superviseur: true, dirigeant: true },
  // Lot B (groupes) — créer un groupe ouvert aux 5 rôles ; gérer les
  // membres d'un groupe (add/remove) accordé ici à tous, la route vérifie
  // en plus que l'appelant est bien le créateur du groupe OU admin.
  "collaboration.create_group": { admin: true, agent: true, comptable: true, superviseur: true, dirigeant: true },
  "collaboration.manage_group": { admin: true, agent: true, comptable: true, superviseur: true, dirigeant: true },
  "collaboration.edit_message": { admin: true, agent: true, comptable: true, superviseur: true, dirigeant: true },
  "collaboration.delete_message": { admin: true, agent: true, comptable: true, superviseur: true, dirigeant: true },
  "collaboration.upload_file": { admin: true, agent: true, comptable: true, superviseur: true, dirigeant: true },
  // Voir la liste + le détail non sensible : les 2 rôles déjà admis sur
  // l'onglet (TAB_MATRIX["yelen-transactions"]).
  "yelen_transactions.voir": { admin: true, comptable: true },
  "yelen_transactions.voir_details_financiers": { admin: true, comptable: true },
  "yelen_transactions.exporter": { admin: true, comptable: true },
  // Référence brute du prestataire (ex. OM-XXXXXXXX) et gestion des
  // remboursements : réservées admin, même logique que
  // rdv.delete_historique/signalements.reopen (action à plus fort impact
  // ou donnée plus sensible que la simple lecture de la liste).
  "yelen_transactions.voir_references_prestataire": { admin: true },
  "yelen_transactions.gerer_remboursements": { admin: true },
  // Réconciliation — consultation ouverte à admin+comptable (même palier
  // que Transactions), mais toute action qui modifie l'état d'un
  // rapprochement ou clôture une période reste admin seul : une clôture
  // verrouille une période entière, un niveau d'impact au-dessus d'un
  // simple remboursement individuel.
  "yelen_reconciliation.voir": { admin: true, comptable: true },
  "yelen_reconciliation.voir_ecarts": { admin: true, comptable: true },
  "yelen_reconciliation.exporter_rapport": { admin: true, comptable: true },
  "yelen_reconciliation.confirmer_correspondance": { admin: true },
  "yelen_reconciliation.exclure_transaction": { admin: true },
  "yelen_reconciliation.marquer_ecart_resolu": { admin: true },
  "yelen_reconciliation.cloturer_periode": { admin: true },
  // Frais & commissions — même palier que Transactions/Réconciliation
  // pour la consultation (admin+comptable) ; "voir_commissions_yelen"/
  // "voir_frais_prestataires" réservés admin, même logique que les
  // références prestataire brutes sur Transactions (donnée plus fine que
  // le total déjà visible via voir_frais).
  "yelen_frais.voir": { admin: true, comptable: true },
  "yelen_frais.voir_conditions_tarifaires": { admin: true, comptable: true },
  "yelen_frais.exporter": { admin: true, comptable: true },
  "yelen_frais.voir_commissions_yelen": { admin: true },
  "yelen_frais.voir_frais_prestataires": { admin: true },
  // Facturation — consultation ouverte à admin+comptable (même palier que
  // les autres écrans Yelen Business) ; "effectuer_paiement" et
  // "gerer_forfait" restent admin seul — agir sur l'argent ou changer de
  // forfait est d'un impact supérieur à consulter/exporter des factures.
  "yelen_facturation.voir": { admin: true, comptable: true },
  "yelen_facturation.voir_factures": { admin: true, comptable: true },
  "yelen_facturation.telecharger_factures": { admin: true, comptable: true },
  "yelen_facturation.voir_informations_facturation": { admin: true, comptable: true },
  "yelen_facturation.exporter_historique": { admin: true, comptable: true },
  "yelen_facturation.effectuer_paiement": { admin: true },
  "yelen_facturation.gerer_forfait": { admin: true },
  // Documents Yelen — admin et dirigeant en "consultation complète"
  // (dirigeant lecture seule, cf. TAB_MATRIX ci-dessus) ; comptable
  // limité aux documents financiers, jamais les contrats. Export en
  // masse réservé admin+comptable (le dirigeant lit, ne pilote pas).
  "yelen_documents.voir": { admin: true, comptable: true, dirigeant: true },
  "yelen_documents.voir_documents_financiers": { admin: true, comptable: true, dirigeant: true },
  "yelen_documents.voir_contrats": { admin: true, dirigeant: true },
  "yelen_documents.telecharger": { admin: true, comptable: true, dirigeant: true },
  "yelen_documents.exporter": { admin: true, comptable: true },
};

// Rôles personnalisés — restriction d'un rôle de base (16/09/2026, choix
// délibéré après audit de 166 sites d'appel de can()/canAccessTab() dans le
// code existant, tous synchrones sur un rôle fixe : une refonte complète en
// rôles indépendants aurait exigé de les toucher un par un, avec un risque
// de régression jugé disproportionné sur la couche d'autorisation. Ici, un
// membre garde un rôle système mais peut se voir RETIRER certains domaines
// (jamais en ajouter au-delà de ce que son rôle permet déjà) —
// institution_membres.acces_restreints (migration 20260916000004), tableau
// de DomaineKey. Source unique partagée UI (EquipeTab.tsx) + serveur —
// jamais dupliquée.
export const DOMAINE_KEYS = ["rdv", "clients", "equipe", "finance", "configuration", "securite_avancee", "rapports"] as const;
export type DomaineKey = (typeof DOMAINE_KEYS)[number];

export function isDomaineKey(value: unknown): value is DomaineKey {
  return typeof value === "string" && (DOMAINE_KEYS as readonly string[]).includes(value);
}

export const DOMAINE_LABELS: Record<DomaineKey, string> = {
  rdv: "Rendez-vous",
  clients: "Clients",
  equipe: "Équipe",
  finance: "Finance",
  configuration: "Configuration",
  securite_avancee: "Sécurité avancée",
  rapports: "Rapports",
};

export const DOMAINE_TABS: Record<DomaineKey, TabKey[]> = {
  rdv: ["rdv", "valider-rdv"],
  clients: ["mes-clients"],
  equipe: ["equipe"],
  finance: ["paiements", "transactions", "facturation"],
  configuration: ["profil-entreprise", "parametres"],
  securite_avancee: ["parametres-securite"],
  rapports: ["analyse"],
};

// Résumé des domaines réellement accordés à un rôle (+ restrictions
// éventuelles) — partagé entre le récapitulatif de création de membre
// (EquipeTab.tsx) et l'écran de bienvenue de première connexion
// (16/09/2026). "accorde" = ce que le rôle de base permet ; "retire" = ce
// que l'admin a explicitement décoché pour CE membre.
export function permissionsDuRole(role: MembreRole, accesRestreints: DomaineKey[] = []): { key: DomaineKey; label: string; accorde: boolean; retire: boolean }[] {
  return DOMAINE_KEYS.map(key => {
    const accorde = DOMAINE_TABS[key].some(t => canAccessTab(role, t) !== "none");
    return { key, label: DOMAINE_LABELS[key], accorde, retire: accorde && accesRestreints.includes(key) };
  });
}

// Pas d'ActionKey dédiée pour "rapports" (lecture seule, aucune écriture à
// bloquer) ni "securite_avancee" (déjà admin-only via
// securite_institution.write, une restriction supplémentaire n'aurait
// aucun effet observable) — tableaux vides assumés, pas un oubli.
export const DOMAINE_ACTIONS: Record<DomaineKey, ActionKey[]> = {
  rdv: ["rdv.write", "rdv.delete_historique", "appointment.check_in"],
  clients: ["mes_clients.write", "mes_clients.delete"],
  equipe: ["equipe.write", "equipe.read_full"],
  finance: ["paiements.rembourser", "facturation.write"],
  configuration: ["profil_entreprise.write", "profil_responsable.write", "documents_institutionnels.write"],
  securite_avancee: [],
  rapports: [],
};

function domaineRestreint(restrictions: readonly string[] | null | undefined, verifie: (d: DomaineKey) => boolean): boolean {
  if (!restrictions || restrictions.length === 0) return false;
  return DOMAINE_KEYS.some(d => restrictions.includes(d) && verifie(d));
}

// `restrictions` optionnel et en 3e position — les 166 appels existants ne
// le passent pas, donc `undefined` et un comportement strictement inchangé.
// Seuls les appels mis à jour pour respecter acces_restreints le passent.
export function canAccessTab(role: MembreRole, tab: TabKey, restrictions?: readonly string[] | null): TabAccess {
  if (domaineRestreint(restrictions, d => DOMAINE_TABS[d].includes(tab))) return "none";
  return TAB_MATRIX[role][tab];
}

export function can(role: MembreRole, action: ActionKey, restrictions?: readonly string[] | null): boolean {
  if (domaineRestreint(restrictions, d => DOMAINE_ACTIONS[d].includes(action))) return false;
  return ACTION_MATRIX[action][role] === true;
}

// Dérivées de TAB_MATRIX — déplacées depuis page.tsx (Lot D, Centre de
// configuration institution, 12/08/2026) pour rester importables par un
// composant hors de ce fichier (ex. CentreConfigurationTab.tsx) sans
// dupliquer la matrice. TAB_MATRIX ne pilote toujours que le masquage de
// nav/UI (cosmétique) — la vraie barrière de sécurité reste ACTION_MATRIX +
// can(), vérifiée dans chaque route API avant d'exécuter une action.
export function tabAllowed(role: MembreRole | null, key: string, restrictions?: readonly string[] | null): boolean {
  if (!isTabKey(key)) return true;
  return role !== null && canAccessTab(role, key, restrictions) !== "none";
}
export function tabReadOnly(role: MembreRole | null, key: string, restrictions?: readonly string[] | null): boolean {
  if (!isTabKey(key)) return false;
  return role !== null && canAccessTab(role, key, restrictions) === "read";
}
