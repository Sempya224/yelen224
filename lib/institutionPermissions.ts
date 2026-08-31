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
export const TAB_KEYS = [
  "accueil", "rdv", "disponibilites", "services", "valider-rdv",
  "communication", "communaute-pro", "signalements", "scanner", "codeqr", "analyse", "parametres",
  "profil-entreprise", "conditions-informations", "configuration-hotel", "profil-responsable", "documents", "mes-clients",
  "avis-reputation", "messagerie", "questions-clients",
  "rdv-historique", "equipe", "journal", "espace-travail",
  "paiements", "transactions", "historique-financier", "facturation",
  "rapports", "documents-financiers", "documents-clients", "profil",
  "partenariat", "mes-offres", "clock-in-shift",
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
    "avis-reputation": "full", messagerie: "full", "questions-clients": "full",
    "rdv-historique": "full", equipe: "full", journal: "full", "espace-travail": "full",
    paiements: "full", transactions: "full", "historique-financier": "full",
    facturation: "full", rapports: "full", "documents-financiers": "full", "documents-clients": "full", profil: "full",
    partenariat: "full", "mes-offres": "full", "clock-in-shift": "full",
  },
  agent: {
    accueil: "full", rdv: "full", disponibilites: "read", services: "none",
    "valider-rdv": "full", communication: "read", "communaute-pro": "read", signalements: "read", scanner: "full", codeqr: "full",
    analyse: "none", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "none", documents: "none", "mes-clients": "full",
    "avis-reputation": "full", messagerie: "full", "questions-clients": "full",
    "rdv-historique": "none", equipe: "none", journal: "none", "espace-travail": "full",
    paiements: "none", transactions: "none", "historique-financier": "none",
    facturation: "none", rapports: "none", "documents-financiers": "none", "documents-clients": "none", profil: "full",
    partenariat: "none", "mes-offres": "none", "clock-in-shift": "none",
  },
  // Menu strictement financier — décision CEO 22/07/2026 : le comptable
  // n'est plus lecteur des écrans des autres rôles (communication, analyse,
  // mes-clients, rdv-historique retirés), il a son propre espace de travail.
  comptable: {
    accueil: "full", rdv: "none", disponibilites: "none", services: "full",
    "valider-rdv": "none", communication: "none", "communaute-pro": "none", signalements: "none", scanner: "none", codeqr: "none",
    analyse: "none", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "none", documents: "none", "mes-clients": "none",
    "avis-reputation": "none", messagerie: "none", "questions-clients": "none",
    "rdv-historique": "none", equipe: "none", journal: "none", "espace-travail": "none",
    paiements: "full", transactions: "full", "historique-financier": "full",
    facturation: "full", rapports: "full", "documents-financiers": "full", "documents-clients": "full", profil: "full",
    partenariat: "none", "mes-offres": "none", "clock-in-shift": "none",
  },
  superviseur: {
    accueil: "full", rdv: "full", disponibilites: "full", services: "full",
    "valider-rdv": "none", communication: "full", "communaute-pro": "full", signalements: "full", scanner: "none", codeqr: "none",
    analyse: "full", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "none", documents: "none", "mes-clients": "full",
    "avis-reputation": "full", messagerie: "full", "questions-clients": "full",
    "rdv-historique": "full", equipe: "none", journal: "full", "espace-travail": "full",
    paiements: "none", transactions: "none", "historique-financier": "none",
    facturation: "none", rapports: "none", "documents-financiers": "none", "documents-clients": "full", profil: "full",
    partenariat: "full", "mes-offres": "full", "clock-in-shift": "read",
  },
  dirigeant: {
    accueil: "full", rdv: "read", disponibilites: "none", services: "none",
    "valider-rdv": "none", communication: "read", "communaute-pro": "read", signalements: "read", scanner: "none", codeqr: "none",
    analyse: "full", parametres: "none", "profil-entreprise": "none", "conditions-informations": "none", "configuration-hotel": "none",
    "profil-responsable": "read", documents: "read", "mes-clients": "none",
    "avis-reputation": "read", messagerie: "none", "questions-clients": "none",
    "rdv-historique": "read", equipe: "read", journal: "read", "espace-travail": "full",
    paiements: "none", transactions: "none", "historique-financier": "none",
    facturation: "none", rapports: "none", "documents-financiers": "none", "documents-clients": "none", profil: "full",
    partenariat: "read", "mes-offres": "read", "clock-in-shift": "read",
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
  | "documents_clients.write" | "documents_clients.verify" | "documents_clients.archive";

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
  "documents_clients.write": { admin: true, comptable: true, superviseur: true },
  "documents_clients.verify": { admin: true, comptable: true, superviseur: true },
  "documents_clients.archive": { admin: true, comptable: true, superviseur: true },
};

export function canAccessTab(role: MembreRole, tab: TabKey): TabAccess {
  return TAB_MATRIX[role][tab];
}

export function can(role: MembreRole, action: ActionKey): boolean {
  return ACTION_MATRIX[action][role] === true;
}

// Dérivées de TAB_MATRIX — déplacées depuis page.tsx (Lot D, Centre de
// configuration institution, 12/08/2026) pour rester importables par un
// composant hors de ce fichier (ex. CentreConfigurationTab.tsx) sans
// dupliquer la matrice. TAB_MATRIX ne pilote toujours que le masquage de
// nav/UI (cosmétique) — la vraie barrière de sécurité reste ACTION_MATRIX +
// can(), vérifiée dans chaque route API avant d'exécuter une action.
export function tabAllowed(role: MembreRole | null, key: string): boolean {
  if (!isTabKey(key)) return true;
  return role !== null && canAccessTab(role, key) !== "none";
}
export function tabReadOnly(role: MembreRole | null, key: string): boolean {
  if (!isTabKey(key)) return false;
  return role !== null && canAccessTab(role, key) === "read";
}
