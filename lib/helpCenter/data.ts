// Yelen Provider Help Center — Couche publique (scaffolding, 22/09/2026).
// Contenu codé en dur (§7/§11 de l'architecture) — zéro CMS, zéro table
// Supabase. CATEGORIES reprend la taxonomie déjà verrouillée (Phase D +
// architecture publique §2/§11.2, tableau de capacité approuvé par Bryan).
// ARTICLES démarre volontairement vide : aucun contenu métier n'a été
// rédigé pendant ce lot de scaffolding — seule la structure existe.

import type { Article, Categorie, DomaineId } from "./types";

export const CATEGORIES: Categorie[] = [
  { id: "commencer", titre: "Commencer avec Yelen", ordre: 1, description: "Créer votre compte, comprendre le statut de votre établissement et démarrer sur Yelen." },
  { id: "accueil-configuration", titre: "Accueil & configuration", ordre: 2, description: "Profil de votre établissement, statut juridique, documents, sécurité du compte et paramètres." },
  { id: "rdv-clients", titre: "RDV & clients", ordre: 3, description: "Rendez-vous, disponibilités, validation des paiements et suivi de vos clients." },
  // Séparé de "Services & offres" le 23/09/2026, sur demande explicite de
  // Bryan — même principe que la séparation Finance/Yelen Business
  // ci-dessous : deux sujets distincts (catalogue de services vs
  // candidature/offres du programme Partenariat) ne doivent jamais
  // partager une seule catégorie. Voir
  // docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md §2.
  { id: "services", titre: "Services", ordre: 4, description: "Votre catalogue de services proposés à vos clients, gratuits et payants." },
  { id: "partenariat", titre: "Partenariat", ordre: 5, description: "Rejoindre le programme Partenariat Yelen et gérer vos offres partenaires." },
  { id: "communication-reputation", titre: "Communication & réputation", ordre: 6, description: "Annonces, Yelen Community, messagerie, avis et réputation de votre établissement." },
  { id: "equipe-organisation", titre: "Équipe & organisation", ordre: 7, description: "Rôles et accès de votre équipe, journal d'activité, espace de travail et collaboration interne." },
  { id: "securite-conformite", titre: "Sécurité & conformité", ordre: 8, description: "Signalements entre votre établissement et vos clients." },
  // Séparé de "Finance & Yelen Business" (fusion du 22/09/2026) le
  // 22/09/2026 même jour, sur demande explicite de Bryan — revient à la
  // proposition initiale de Phase D. Voir la note de correction dans
  // docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md §2.
  { id: "finance", titre: "Finance", ordre: 9, description: "Paiements et facturation de vos clients." },
  { id: "yelen-business", titre: "Yelen Business", ordre: 10, description: "Votre relation contractuelle avec Yelen : abonnement, forfait et facturation Yelen." },
];

// Raccourcis "Que cherchez-vous ?" de l'accueil (UX Lock 22/09/2026, §6) —
// pointent uniquement vers des catégories réelles déjà listées ci-dessus,
// jamais une destination fictive. Une catégorie cible sans article publié
// reste un lien valide (la page catégorie gère déjà cet état vide).
export const QUICK_LINKS: { label: string; domaine: DomaineId }[] = [
  { label: "Commencer avec Yelen", domaine: "commencer" },
  { label: "Gérer mon établissement", domaine: "accueil-configuration" },
  { label: "Gérer mes clients", domaine: "rdv-clients" },
  { label: "Gérer mon équipe", domaine: "equipe-organisation" },
  { label: "Sécurité", domaine: "securite-conformite" },
  { label: "Finance", domaine: "finance" },
];

// Lot 1 de contenu (22/09/2026) — 5 "conversions" : connaissance déjà
// vérifiée dans le produit (notes contextuelles in-product T5/T11-A/T11-B,
// ou texte produit déjà écrit dans le code lui-même, P15/P16) réécrite en
// article public autonome, jamais copiée telle quelle (principe 9 de
// l'architecture : une note in-product suppose un dashboard déjà ouvert,
// un article public doit se suffire à lui-même). Voir
// docs/product/YELEN_PUBLIC_HELP_CENTER_CORPUS_V1.md candidats 2.3, 5.2,
// 6.3, 8.1, 8.2 pour les preuves de code détaillées.
export const ARTICLES: Article[] = [
  {
    id: "centre-de-configuration-avant-tableau-de-bord",
    domaine: "commencer",
    titre: "Pourquoi mon tableau de bord affiche-t-il un centre de configuration au lieu de l'accueil ?",
    resume: "Tant que les étapes obligatoires de votre établissement ne sont pas terminées, Yelen affiche un parcours de préparation guidé à la place du tableau de bord habituel — ce n'est pas une erreur, c'est l'étape avant l'activation.",
    sections: [
      {
        type: "text",
        contenu: "Après la création de votre compte, votre tableau de bord affiche un centre de configuration plutôt que l'accueil habituel, tant que votre établissement n'est pas entièrement prêt. Cet écran vous guide à travers les informations à compléter et les documents à transmettre pour que Yelen puisse vérifier et activer votre espace.",
      },
      {
        type: "list",
        titre: "Les 6 groupes d'étapes",
        items: [
          "Profil — les informations principales qui présentent votre établissement.",
          "Équipe — les personnes autorisées à utiliser l'espace professionnel (facultatif, voir plus bas).",
          "Services — ce que les citoyens peuvent consulter et réserver sur Yelen.",
          "Horaires — les jours et horaires où les citoyens peuvent prendre rendez-vous.",
          "Profil public — les informations affichées publiquement aux citoyens.",
          "Vérification — les documents requis pour la vérification de votre établissement.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Centre de configuration",
          zone: "Vue d'ensemble",
          montrer: [
            "la barre de préparation globale avec son pourcentage",
            "les 6 groupes d'étapes, avec le badge Obligatoire ou Facultatif",
            "le bloc Vérification Yelen en bas de l'écran",
          ],
        },
      },
      {
        type: "info",
        titre: "Le pourcentage affiché ne doit pas forcément atteindre 100 %",
        contenu: "Le groupe « Équipe » est facultatif : il compte dans le pourcentage global affiché, mais ne bloque jamais le passage vers votre tableau de bord complet. Une institution qui travaille seule peut donc activer son espace sans jamais atteindre 100 % — ce qui compte, c'est que tous les groupes marqués « Obligatoire » soient terminés.",
      },
      {
        type: "list",
        titre: "Ce qu'il faut savoir avant d'être surpris",
        items: [
          "Le délai de vérification varie selon le nombre de dossiers en cours de traitement chez Yelen — vous n'avez rien à faire de plus une fois les étapes obligatoires terminées, votre tableau de bord bascule automatiquement dès l'activation.",
          "Votre établissement n'apparaît pas dans les résultats de recherche Yelen et ne peut recevoir aucun rendez-vous avant son activation.",
          "Les documents envoyés pour la vérification sont consultés uniquement par l'équipe Yelen — jamais visibles publiquement, ni par les citoyens, ni par d'autres institutions.",
          "Toutes les informations saisies ici restent modifiables à tout moment depuis votre tableau de bord, avant comme après l'activation.",
        ],
      },
      {
        type: "info",
        titre: "Si votre dossier est refusé ou votre compte suspendu",
        contenu: "Le motif s'affiche directement sur cet écran lorsqu'il est disponible. Contactez l'équipe Yelen pour comprendre la situation et, si possible, la corriger.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "L'écran affiche une erreur de chargement : vos informations déjà saisies ne sont pas perdues, un nouvel essai suffit généralement.\n\nUne étape apparaît verrouillée avec un cadenas : votre rôle n'a pas accès à cet écran — seul un administrateur peut la compléter.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/CentreConfigurationTab.tsx", "lib/institutionConfigProgress.ts", "app/api/institution/configuration-status/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["centre de configuration", "setup center", "activation", "vérification", "préparation", "parcours d'activation", "obligatoire", "facultatif"],
    status: "publie",
  },
  {
    id: "compte-suspendu-que-faire",
    domaine: "commencer",
    titre: "Mon compte est suspendu — que faire et comment demander une révision ?",
    resume: "Une suspension rend votre établissement invisible des citoyens et bloque les nouvelles réservations, mais votre espace professionnel reste accessible et vos données sont conservées — vous pouvez demander une révision directement depuis cet écran.",
    sections: [
      {
        type: "text",
        contenu: "Si votre établissement est suspendu, le tableau de bord affiche un écran dédié à la place de votre vue d'ensemble habituelle. Ce n'est pas une sanction définitive : votre espace professionnel reste accessible, vos données sont conservées, et un système de révision vous permet de demander un nouvel examen de votre dossier.",
      },
      {
        type: "list",
        titre: "Ce qui change pendant une suspension",
        items: [
          "Visibilité citoyenne — suspendue : votre établissement n'apparaît plus dans les résultats de recherche Yelen.",
          "Nouvelles réservations — suspendues : les citoyens ne peuvent plus prendre de nouveau rendez-vous chez vous.",
          "Espace professionnel — reste accessible : vous pouvez toujours vous connecter.",
          "Données de votre compte — conservées : la suspension ne supprime ni ne modifie rien.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Compte suspendu",
          zone: "Vue d'ensemble",
          montrer: [
            "le motif de la suspension, quand il est disponible",
            "la section « Durée de la mesure » (début, fin prévue, référence)",
            "le formulaire de demande de révision",
          ],
        },
      },
      {
        type: "steps",
        titre: "Demander une révision",
        items: [
          "Consultez le motif affiché dans la section « Pourquoi cette mesure ? », en haut de l'écran.",
          "Dans « Demander une révision », expliquez votre situation ou apportez des éléments utiles (10 caractères minimum).",
          "Envoyez votre demande — une référence de suivi vous est attribuée et le formulaire est remplacé par une confirmation.",
          "Vous êtes notifié dès qu'une décision est prise ; en attendant, inutile de soumettre une nouvelle demande.",
        ],
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Si la suspension est due à une inactivité prolongée, il suffit qu'un membre actif de votre équipe se reconnecte à l'espace Yelen Business pour réactiver immédiatement l'établissement — la demande de révision reste disponible en cas d'empêchement.\n\nSi votre suspension est antérieure à la mise en place de ce système de suivi, aucune demande de révision ne peut être associée automatiquement à votre dossier : contactez directement le support en indiquant le nom de votre établissement.\n\nPendant la suspension, la Messagerie et les Paramètres et compte restent accessibles ; les autres onglets du tableau de bord restent bloqués.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Aucun délai fixe n'est garanti pour l'examen d'une demande de révision ou d'un dossier — le contact avec le support reste le moyen le plus rapide de connaître l'état de votre dossier.\n\nAucun motif ne s'affiche à l'écran : contactez le support, qui pourra vous communiquer la raison exacte.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/CompteSuspenduScreen.tsx", "app/api/institution/suspension/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["compte suspendu", "suspension", "révision", "réactivation", "inactivité", "accès bloqué"],
    status: "publie",
  },
  {
    id: "double-authentification-24h-premiere-connexion",
    domaine: "commencer",
    titre: "Pourquoi dois-je activer une double authentification 24h après ma première connexion ?",
    resume: "24h après votre toute première connexion à Yelen Business, Yelen vous demande d'activer une protection supplémentaire (application d'authentification ou clé d'accès) — tant que ce n'est pas fait, l'accès finit par être suspendu jusqu'à son activation.",
    sections: [
      {
        type: "text",
        contenu: "Pour protéger votre établissement, Yelen rend obligatoire l'activation d'une double authentification peu de temps après votre première connexion. Votre espace reste pleinement utilisable dès cette première connexion — ce n'est qu'après un délai de 24 heures que l'activation devient réellement exigée.",
      },
      {
        type: "list",
        titre: "Comment ça se déroule",
        items: [
          "Dès votre première connexion, un rappel s'affiche : il vous reste jusqu'à 24h pour activer une protection, mais vous pouvez continuer à utiliser votre espace normalement et fermer ce rappel pour plus tard.",
          "Vous choisissez entre deux méthodes : une application d'authentification (Google Authenticator, Authy...) ou une clé d'accès (Passkey — empreinte, visage ou code de votre appareil).",
          "Passé le délai de 24h sans qu'aucune des deux ne soit activée, l'accès à votre tableau de bord est suspendu : un écran plein écran, non fermable, vous demande d'activer l'une des deux méthodes pour le retrouver.",
          "Une fois l'une des deux méthodes activée, l'accès est immédiatement rétabli — aucune autre action n'est nécessaire.",
        ],
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Une seule des deux méthodes suffit — il n'est pas nécessaire d'activer les deux. Vous pouvez aussi en changer plus tard depuis votre tableau de bord.\n\nCe mécanisme ne concerne que la connexion à votre espace professionnel Yelen Business — il est indépendant de tout code PIN ou autre protection déjà en place sur votre compte.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "L'écran de blocage ne disparaît pas après activation : utilisez le bouton « J'ai terminé — vérifier mon activation » sur cet écran, qui revérifie immédiatement votre statut.\n\nVous n'avez accès à aucune des deux méthodes (pas de téléphone compatible, pas d'application d'authentification) : contactez le support Yelen pour étudier votre situation.",
      },
    ],
    sourceCode: ["lib/institutionAuth.ts", "app/[slug]/[id]/components/SecurityActivationGate.tsx", "app/api/institution/auth/security-activation-status/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["double authentification", "mfa", "totp", "passkey", "clé d'accès", "sécurité du compte", "24h", "première connexion"],
    status: "publie",
  },
  {
    id: "profil-entreprise-responsable-administration-securite",
    domaine: "accueil-configuration",
    titre: "Profil Entreprise, Profil Responsable, Administration & accès, Sécurité du compte : quelle différence ?",
    resume: "4 écrans aux noms proches, qui ne se recouvrent pas : l'identité publique de votre établissement, celle de son responsable légal, votre propre accès personnel, et la sécurité de l'ensemble de l'institution.",
    sections: [
      {
        type: "text",
        contenu: "Yelen sépare volontairement 4 écrans qui portent des noms proches mais couvrent chacun un périmètre bien distinct. Les confondre est fréquent au début — ce guide donne un repère simple pour savoir, en une phrase, lequel ouvrir.",
      },
      {
        type: "list",
        titre: "Les 4 écrans, en une phrase chacun",
        items: [
          "Profil Entreprise — l'identité publique de votre établissement : nom, catégorie et activité, statut juridique, ville, logo. C'est ce que les citoyens voient sur votre fiche.",
          "Profil Responsable — l'identité de la personne responsable légale de l'établissement (nom, rôle, coordonnées), distincte de l'établissement lui-même.",
          "Administration & accès — votre propre accès personnel à vous, connecté : votre identifiant, votre rôle réel, votre code PIN, votre double authentification, votre activité récente. Chaque membre de l'équipe y voit uniquement ses propres informations, jamais celles des autres.",
          "Sécurité du compte — la sécurité de l'ensemble de l'institution, réservée à l'administrateur : gestion des clés d'accès (passkeys), appareils et sessions mémorisés, journal de sécurité, récupération du compte.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Profil Entreprise",
          zone: "Vue d'ensemble",
          montrer: [
            "le nom de l'écran dans la navigation",
            "les informations publiques de l'établissement",
          ],
        },
      },
      {
        type: "info",
        titre: "Qui voit quoi",
        contenu: "Profil Entreprise et Sécurité du compte sont réservés à l'administrateur. Profil Responsable est visible par l'administrateur (modification) et le dirigeant (lecture). Administration & accès est accessible à tous les rôles, mais chacun n'y voit que sa propre fiche — ce n'est jamais une liste de toute l'équipe (pour ça, voir l'onglet Équipe et accès).",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Vous cherchez à modifier les informations affichées publiquement sur votre fiche : c'est Profil Entreprise, pas Administration & accès.\n\nVous cherchez à activer une clé d'accès ou consulter les appareils connectés à l'institution : c'est Sécurité du compte (réservé à l'administrateur), pas votre fiche personnelle.\n\nUn rôle autre qu'administrateur ne voit pas certains de ces 4 écrans dans son menu : c'est normal, voir le guide sur les rôles d'équipe.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/ProfilEntrepriseTab.tsx", "app/[slug]/[id]/components/ProfilResponsableTab.tsx", "app/[slug]/[id]/components/ProfilTab.tsx", "app/[slug]/[id]/components/SecuriteCompteTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["profil entreprise", "profil responsable", "administration et accès", "sécurité du compte", "quelle différence"],
    status: "publie",
    relatedArticles: ["roles-equipe-et-permissions"],
  },
  {
    id: "pourquoi-statut-juridique-avant-documents",
    domaine: "accueil-configuration",
    titre: "Pourquoi dois-je renseigner mon statut juridique avant de soumettre mes documents ?",
    resume: "La liste des documents que Yelen vous demande pour la vérification dépend directement du statut juridique de votre établissement — sans lui, l'onglet Documents ne peut pas savoir quoi vous réclamer.",
    sections: [
      {
        type: "text",
        contenu: "L'onglet Documents affiche une liste de documents à transmettre pour la vérification de votre établissement. Cette liste n'est pas la même pour tout le monde : elle est dérivée automatiquement du statut juridique que vous avez renseigné dans Profil Entreprise. Tant que ce statut n'est pas choisi, Yelen ne peut pas savoir quels documents vous réclamer — l'onglet Documents reste donc bloqué.",
      },
      {
        type: "list",
        titre: "Les 4 statuts juridiques proposés",
        items: [
          "Institution publique — hôpital, mairie, ambassade ou toute administration d'État.",
          "PME / Entreprise — entreprise ou société enregistrée (RCCM) : clinique privée, banque, cabinet...",
          "Profession libérale — profession réglementée exercée en libéral : médecin, avocat, notaire...",
          "Entrepreneur / Commerçant individuel — activité individuelle non enregistrée formellement : coiffeur, artisan, boutique...",
        ],
      },
      {
        type: "steps",
        titre: "Renseigner votre statut juridique",
        items: [
          "Ouvrez Profil Entreprise.",
          "Si un bandeau orange « Statut juridique et activité manquants » s'affiche, cliquez sur « Compléter maintenant ».",
          "Choisissez le statut qui correspond à votre établissement, puis votre catégorie et activité principale.",
          "Une fois enregistré, retournez dans l'onglet Documents : la liste des documents à transmettre s'affiche désormais.",
        ],
      },
      {
        type: "warn",
        contenu: "Une fois qu'au moins un document a été soumis avec ce statut, il se verrouille : vous ne pouvez plus le changer vous-même depuis Profil Entreprise, pour ne pas désynchroniser des documents déjà en cours d'examen. Si vous avez choisi le mauvais statut, contactez le support Yelen224 pour le faire corriger.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "L'onglet Documents affiche « Profil incomplet » : retournez dans Profil Entreprise et renseignez votre statut juridique et votre activité.\n\nVous avez choisi le mauvais statut juridique et aucun document n'a encore été envoyé : rouvrez le sélecteur depuis Profil Entreprise (bouton « Modifier ») et corrigez-le librement — le verrouillage n'intervient qu'après un premier envoi.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/ProfilEntrepriseTab.tsx", "app/[slug]/[id]/components/DocumentsTab.tsx", "lib/institutionTaxonomy.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["statut juridique", "documents", "vérification", "profil entreprise", "verrouillé", "institution publique", "pme", "profession libérale"],
    status: "publie",
  },
  {
    id: "pourquoi-yelen-redemande-identite",
    domaine: "accueil-configuration",
    titre: "Pourquoi Yelen me redemande-t-il de confirmer mon identité pour certaines actions ?",
    resume: "Avant une action sensible (ajouter une clé d'accès, supprimer le compte, confirmer un remboursement...), Yelen vous redemande votre code PIN personnel — une vérification supplémentaire, même si vous êtes déjà connecté.",
    sections: [
      {
        type: "text",
        contenu: "Être déjà connecté à votre tableau de bord ne suffit pas toujours : certaines actions sensibles demandent une confirmation supplémentaire de votre identité, par votre code PIN personnel à 6 chiffres (et un code de double authentification en plus, si vous l'avez déjà activée). Cette fenêtre de confirmation peut apparaître sur plusieurs écrans — Sécurité du compte, Paramètres, Équipe, Paiements — chacun l'affichant avec une phrase qui explique précisément pourquoi, pour cette action précise.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Sécurité du compte",
          zone: "Confirmation d'identité avant l'ajout d'une clé d'accès",
          montrer: [
            "la fenêtre « Confirmez votre identité »",
            "le champ de saisie du PIN à 6 chiffres",
          ],
        },
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Si vous avez déjà activé la double authentification, une seconde étape vous demande ensuite le code de votre application d'authentification (ou un code de secours) — la confirmation par PIN seul ne suffit alors plus.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "La confirmation échoue malgré un PIN correct : réessayez — un code saisi trop vite ou un chiffre en trop est la cause la plus fréquente.\n\nVous avez oublié votre code PIN personnel : il se modifie depuis Administration & accès, une fois connecté normalement à votre session.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/ReauthModal.tsx", "app/api/institution/auth/reauth/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["confirmer son identité", "réauthentification", "pin", "double authentification", "action sensible"],
    status: "publie",
  },
  {
    id: "horaires-publics-vs-creneaux-reservables",
    domaine: "accueil-configuration",
    titre: "Quelle est la différence entre mes horaires publics et mes créneaux de rendez-vous réservables ?",
    resume: "Yelen distingue les horaires affichés sur votre fiche publique (badge Ouvert/Fermé) des créneaux que les citoyens peuvent réellement réserver. Ce guide couvre les deux écrans concernés — Profil Entreprise et Disponibilités — et explique comment bien les configurer ensemble.",
    sections: [
      {
        type: "text",
        contenu: "Sur Yelen224, deux réglages distincts déterminent ce qu'un citoyen voit et peut réserver chez vous : les horaires affichés sur votre fiche publique, et les créneaux réellement ouverts à la réservation. Ce guide couvre les deux écrans concernés — la section Horaires de Profil Entreprise, et l'onglet Disponibilités — et explique comment bien les configurer ensemble.",
      },
      {
        type: "text",
        titre: "Comprendre les deux écrans",
        contenu: "Profil Entreprise → Horaires : sept bascules Ouvert/Fermé, une par jour de la semaine, chacune avec une heure de début et de fin quand le jour est actif. Ce réglage pilote uniquement le badge « Ouvert » ou « Fermé » affiché sur votre fiche publique — il ne crée aucun créneau réservable.\n\nDisponibilités : pour chaque jour actif, vous choisissez une plage horaire (début/fin) et une durée de rendez-vous (15, 30, 45 ou 60 minutes). Yelen découpe automatiquement cette plage en créneaux de cette durée — c'est ce calcul qui détermine les heures que les citoyens peuvent réellement réserver.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Disponibilités",
          zone: "Vue d'ensemble des 7 jours",
          montrer: [
            "le statut Configuré / Non configuré en haut de l'écran",
            "la liste des 7 jours avec leur bascule Ouvert / Fermé et le nombre de créneaux générés",
            "le panneau Capacité par créneau",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que vous pouvez faire depuis ces écrans",
        items: [
          "Définir vos horaires d'ouverture publics, jour par jour (Profil Entreprise).",
          "Activer ou désactiver la prise de rendez-vous pour chaque jour de la semaine (Disponibilités).",
          "Choisir la durée d'un rendez-vous par jour — elle peut différer d'un jour à l'autre.",
          "Définir le nombre de citoyens que vous pouvez recevoir au même horaire (capacité par créneau).",
          "Prévisualiser exactement ce qu'un citoyen voit au moment de réserver (bouton « Aperçu citoyen »).",
          "Consulter qui a modifié vos disponibilités et quand (bouton « Historique », selon votre rôle).",
        ],
      },
      {
        type: "steps",
        titre: "Configurer vos horaires publics (Profil Entreprise)",
        items: [
          "Ouvrez l'onglet Profil Entreprise, puis la section Horaires.",
          "Pour chaque jour, activez la bascule si vous êtes ouvert ce jour-là.",
          "Renseignez l'heure d'ouverture et l'heure de fermeture.",
          "Cliquez sur Enregistrer en bas de l'écran — le bouton reste inactif tant qu'aucune modification n'a été faite.",
        ],
      },
      {
        type: "steps",
        titre: "Configurer vos créneaux réservables (Disponibilités)",
        items: [
          "Ouvrez l'onglet Disponibilités et cliquez sur un jour pour le déplier.",
          "Activez le jour, puis renseignez l'heure d'ouverture et de fermeture pour la prise de rendez-vous.",
          "Choisissez la durée d'un rendez-vous pour ce jour — l'aperçu des créneaux générés apparaît immédiatement en dessous.",
          "Répétez pour chaque jour concerné, puis définissez votre capacité par créneau dans le panneau latéral.",
          "Validez avec le bouton Enregistrer, qui reste visible tant que des modifications ne sont pas encore sauvegardées.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Disponibilités",
          zone: "Un jour déplié, réglages ouverts",
          montrer: [
            "la bascule Ouvert / Fermé du jour",
            "les champs heure d'ouverture / heure de fermeture",
            "le sélecteur de durée par rendez-vous",
            "l'aperçu des créneaux générés",
          ],
        },
      },
      {
        type: "warn",
        titre: "Deux réglages indépendants",
        contenu: "Modifier vos horaires publics dans Profil Entreprise ne change rien à vos créneaux réservables dans Disponibilités, et inversement — ce sont deux réglages indépendants à tenir à jour chacun de leur côté.",
      },
      {
        type: "list",
        titre: "Points importants à connaître",
        items: [
          "La capacité par créneau s'applique à tous vos jours actifs en même temps — il n'existe pas de capacité différente par jour.",
          "La durée d'un rendez-vous, elle, se règle bien jour par jour : rien n'empêche des créneaux de 30 minutes le lundi et de 15 minutes le mercredi.",
          "Un jour désactivé n'apparaît jamais comme réservable, même si une heure d'ouverture/fermeture reste renseignée.",
          "Le bouton « Aperçu citoyen » utilise exactement le même moteur que le formulaire de réservation — ce que vous y voyez est fiable.",
        ],
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Si votre établissement est un hôtel, l'onglet Disponibilités ne s'affiche pas de la même façon : un écran dédié vous redirige vers la gestion de vos chambres et prestations (onglet Services) et vers les horaires Ouvert/Fermé (Profil Entreprise). Ce fonctionnement par créneaux de durée fixe ne correspond pas à une réservation de chambre ou de prestation à l'unité (par nuit, par personne…).\n\nSelon votre rôle dans l'équipe, cet écran peut s'afficher en lecture seule — vous pouvez alors consulter la configuration mais pas la modifier.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Aucun créneau ne s'affiche dans l'Aperçu citoyen : vérifiez que le jour concerné est bien activé, que l'heure de fermeture est postérieure à l'heure d'ouverture, et que la durée choisie permet de générer au moins un créneau complet sur la plage renseignée.\n\nVotre badge reste sur « Fermé » alors que vous avez configuré vos disponibilités : ce badge dépend uniquement des horaires de Profil Entreprise, pas de l'onglet Disponibilités — vérifiez ce premier écran séparément.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/ProfilEntrepriseTab.tsx", "app/[slug]/[id]/components/DisponibilitesTab.tsx"],
    derniereVerification: "2026-09-24",
    motsClefs: ["horaires", "disponibilités", "ouvert", "fermé", "créneaux", "profil entreprise", "fiche publique", "capacité par créneau", "durée rendez-vous", "aperçu citoyen", "hôtel"],
    status: "publie",
  },
  {
    id: "annuler-validation-vs-annuler-reservation",
    domaine: "rdv-clients",
    titre: "Quelle est la différence entre « Annuler la validation » et « Annuler la réservation » d'un rendez-vous payant ?",
    resume: "Deux boutons qui se ressemblent mais agissent à des moments différents : l'un annule une réservation pas encore traitée, l'autre revient en arrière sur une décision déjà prise le jour même.",
    sections: [
      {
        type: "text",
        contenu: "Sur l'écran Centre de validation, deux actions portent un nom proche mais ne s'appliquent jamais au même moment du traitement d'un rendez-vous payant : « Annuler la réservation » agit avant tout traitement, « Annuler la validation » agit après.",
      },
      {
        type: "list",
        titre: "Les deux actions, en un coup d'œil",
        items: [
          "Annuler la réservation — disponible uniquement tant que le rendez-vous est encore en attente de traitement. Elle l'annule définitivement : il ne sera plus jamais proposé au citoyen.",
          "Annuler la validation — disponible uniquement le jour même où vous avez déjà traité ce rendez-vous (confirmé, marqué absent ou annulé). Elle revient sur cette décision : le rendez-vous repasse en attente, comme si vous n'aviez encore rien fait.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Centre de validation",
          zone: "Fiche d'un rendez-vous payant",
          montrer: [
            "le bouton « Annuler la réservation » sur un rendez-vous en attente",
            "le bouton « Annuler la validation » sur un rendez-vous déjà traité le jour même",
          ],
        },
      },
      {
        type: "warn",
        contenu: "Les deux actions demandent un motif obligatoire avant confirmation — aucune des deux ne s'exécute en un seul clic. Si le rendez-vous avait déjà été payé en espèces et confirmé, « Annuler la validation » reverse l'opération dans votre registre financier : l'encaissement d'origine n'est jamais supprimé, une écriture d'annulation est ajoutée à côté pour garder une trace complète.",
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "« Annuler la validation » n'est proposée que le jour même du traitement initial — passé ce jour, elle n'est plus disponible sur cet écran. Si vous devez corriger une décision plus ancienne, contactez le support Yelen224.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Aucun des deux boutons n'apparaît sur un rendez-vous que vous pensiez pouvoir annuler : vérifiez son statut et sa date de traitement — ces deux actions sont volontairement limitées à une fenêtre précise, pour éviter de revenir indéfiniment sur une décision ancienne.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/ValiderRdvTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["annuler la validation", "annuler la réservation", "centre de validation", "rendez-vous payant", "remboursement", "motif obligatoire"],
    status: "publie",
  },
  {
    id: "statuts-document-demande-client",
    domaine: "rdv-clients",
    titre: "Que signifient les statuts d'un document demandé à un client (reçu, à vérifier, validé...) ?",
    resume: "Un document demandé à un client suit un parcours en 5 étapes, de la demande jusqu'à l'archivage — chaque statut indique précisément qui doit agir ensuite.",
    sections: [
      {
        type: "text",
        contenu: "Depuis l'onglet Documents clients, vous pouvez demander un document à un client (pièce d'identité, justificatif...) ou lui en transmettre un directement. Ces deux usages suivent des parcours de statuts différents — ce guide détaille les deux.",
      },
      {
        type: "list",
        titre: "Flux « Demande » — le client vous envoie un document",
        items: [
          "En attente — la demande a été envoyée au client, qui n'a pas encore répondu.",
          "Reçu — le client a envoyé le document ; il n'a pas encore été ouvert par votre équipe.",
          "À vérifier — l'examen du document a commencé.",
          "Validé — le document est conforme et reste consultable par votre équipe.",
          "Refusé — le document ne convient pas (motif précisé) ; vous pouvez alors créer une nouvelle demande du même type.",
          "Archivé — le dossier est clos, qu'il ait été validé ou refusé.",
        ],
      },
      {
        type: "list",
        titre: "Flux « Envoi » — vous transmettez un document au client",
        items: [
          "Disponible — le document est transmis et consultable par le client.",
          "Archivé — le document envoyé n'est plus mis en avant (aucune étape de vérification : un document que vous envoyez vous-même n'a pas besoin d'être validé par vous).",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Documents clients",
          zone: "Fiche détail d'un document",
          montrer: [
            "le statut actuel et son historique",
            "les boutons d'action disponibles pour ce statut (Commencer la vérification / Valider / Refuser / Archiver)",
          ],
        },
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Les boutons d'action affichés changent selon le statut actuel : seules les transitions réellement autorisées sont proposées, jamais toutes les actions en même temps.\n\nUn document « En attente » peut afficher une date limite — le document apparaît alors dans le filtre « Expirent bientôt » à l'approche de cette échéance, pour ne pas la manquer.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Un document reste bloqué à « Reçu » : cliquez sur « Commencer la vérification » pour passer à l'étape suivante — aucune transition ne se fait automatiquement.\n\nVous avez refusé un document par erreur : créez une nouvelle demande du même type auprès du même client, le document refusé reste consultable dans son historique.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/DocumentsClientsTab.tsx", "lib/citoyenDocumentsConstants.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["documents clients", "statut document", "en attente", "reçu", "à vérifier", "validé", "refusé", "archivé", "disponible"],
    status: "publie",
  },
  {
    id: "3-codes-qr-yelen",
    domaine: "rdv-clients",
    titre: "Quelle est la différence entre les 3 codes QR de Yelen (établissement, présence, badge membre) ?",
    resume: "Yelen utilise 3 codes QR sans aucun rapport entre eux : celui de votre fiche publique, celui qui confirme la présence d'un citoyen à son rendez-vous, et celui qui active un poste d'accueil pour un membre de votre équipe.",
    sections: [
      {
        type: "list",
        titre: "Les 3 codes QR, en un coup d'œil",
        items: [
          "QR établissement (onglet Mon code QR) — mène à votre fiche publique Yelen. À imprimer ou afficher à l'accueil pour que les citoyens accèdent directement à votre profil.",
          "Scan de présence (onglet Scanner) — confirme l'arrivée d'un citoyen à son rendez-vous.",
          "Badge QR membre (onglet Équipe et accès) — personnel à un membre de votre équipe, à scanner une seule fois avec un téléphone : cet appareil devient alors le poste d'accueil qui validera ensuite les présences des citoyens.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Mon code QR",
          zone: "Vue d'ensemble",
          montrer: [
            "le QR établissement imprimable",
            "le compteur de réservations obtenues grâce à ce QR",
          ],
        },
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Vous avez scanné le mauvais code et rien ne se passe comme attendu : vérifiez lequel des 3 vous utilisiez — ils ne partagent aucun mécanisme commun, un scan du QR établissement ne confirmera jamais une présence, par exemple.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/CodeQrTab.tsx", "app/[slug]/[id]/components/EquipeTab.tsx", "app/[slug]/[id]/layout.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["code qr", "qr établissement", "scan de présence", "badge qr membre", "scanner"],
    status: "publie",
  },
  {
    id: "que-mesure-compteur-qr",
    domaine: "rdv-clients",
    titre: "Que mesure exactement le compteur affiché sur mon code QR ?",
    resume: "Ce chiffre compte les réservations réellement effectuées via ce QR ou ce lien copié — jamais le nombre de fois où il a été affiché ou scanné sans réservation.",
    sections: [
      {
        type: "text",
        contenu: "Sur l'onglet Mon code QR, un chiffre indique le nombre de réservations obtenues grâce à ce QR ou à ce lien. C'est une mesure de résultat, pas d'audience : il ne compte ni les affichages, ni les scans qui n'ont pas abouti à une réservation.",
      },
      {
        type: "list",
        titre: "Ce qui est compté",
        items: [
          "Toute réservation (gratuite ou payante) effectuée en passant par ce QR ou ce lien, depuis sa création — jamais seulement celles du jour ou du mois en cours.",
          "Chaque réservation n'est comptée qu'une fois, qu'elle soit gratuite ou payante.",
        ],
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Le compteur affiche 0 alors que vous savez avoir reçu des réservations : vérifiez que les citoyens accèdent bien à votre fiche via ce QR précis ou son lien copié, et non par une recherche directe sur Yelen — seules les réservations passées par ce canal précis sont comptées.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/CodeQrTab.tsx", "app/api/institution/qr-provenance/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["code qr", "compteur", "provenance", "réservations", "mon code qr"],
    status: "publie",
    relatedArticles: ["3-codes-qr-yelen"],
  },
  {
    id: "difference-rdv-vs-rdv-passes",
    domaine: "rdv-clients",
    titre: "Quelle est la différence entre l'onglet « Rendez-vous » et « Rendez-vous passés » ?",
    resume: "« Rendez-vous » est votre file de travail du jour (tout ce qui attend encore une action) ; « Rendez-vous passés » est votre historique, dès que la date est dépassée — quel que soit son statut final.",
    sections: [
      {
        type: "text",
        contenu: "Yelen sépare volontairement votre file de travail active de votre historique, pour que vous ne cherchiez jamais un rendez-vous ancien parmi ceux qui demandent encore une action aujourd'hui.",
      },
      {
        type: "list",
        titre: "Les deux onglets, en un coup d'œil",
        items: [
          "Rendez-vous — tout ce qui n'est pas encore arrivé à son terme : nouvelle demande, en attente, confirmé. C'est votre file de travail du jour.",
          "Rendez-vous passés — tout rendez-vous dont la date est déjà passée, quel que soit son statut final (terminé, annulé, absence constatée). C'est votre historique, consultable avec recherche, filtres par statut et export.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Rendez-vous passés",
          zone: "Vue d'ensemble",
          montrer: [
            "les filtres de statut (Terminé / Annulé / Absent)",
            "une fiche de rendez-vous passé avec son historique",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que vous pouvez faire dans Rendez-vous passés",
        items: [
          "Rechercher et filtrer par période, statut ou mot-clé.",
          "Ajouter une note de suivi interne sur un rendez-vous passé.",
          "Envoyer un rappel au client concernant ce rendez-vous.",
          "Exporter l'historique au format CSV.",
        ],
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Un rendez-vous annulé avant sa date apparaît aussi dans Rendez-vous passés une fois sa date dépassée — l'annulation ne le fait pas disparaître de l'historique.\n\nAjouter une note de suivi ou envoyer un rappel ne modifie jamais le statut ou les informations d'origine du rendez-vous : ce sont des actions complémentaires, pas une réouverture du dossier.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Un rendez-vous que vous cherchez n'apparaît pas dans Rendez-vous passés : vérifiez que sa date est bien dépassée — tant qu'elle ne l'est pas, il reste dans l'onglet Rendez-vous, même si vous l'avez déjà traité.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/layout.tsx", "app/[slug]/[id]/components/RdvPasseTab.tsx", "app/api/institution/rdv-historique/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["rendez-vous", "rendez-vous passés", "historique", "note de suivi", "rappel", "export csv"],
    status: "publie",
  },
  {
    id: "difference-offre-gratuite-services-payants",
    domaine: "services",
    titre: "Quelle est la différence entre l'offre gratuite et les services payants sur ma fiche Yelen ?",
    resume: "Deux catalogues bien distincts sur le même écran : l'offre gratuite (toujours gratuite, réservable directement) et les services payants (paiement sur place, code de confirmation à 6 chiffres).",
    sections: [
      {
        type: "text",
        contenu: "L'onglet Services réunit deux catalogues différents, qui ne doivent jamais être confondus : votre offre gratuite et vos services payants. Les deux sont visibles sur votre fiche publique, mais leur fonctionnement diffère.",
      },
      {
        type: "list",
        titre: "Les deux catalogues, en un coup d'œil",
        items: [
          "Offre gratuite — ce que vous proposez à vos clients, toujours gratuit, réservable directement par les citoyens et visible sur votre fiche publique.",
          "Services payants — un catalogue distinct. Le client réserve, paie sur place, et reçoit un code de confirmation Yelen à 6 chiffres à présenter le jour du rendez-vous.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Mes services",
          zone: "Vue d'ensemble",
          montrer: [
            "le bouton Offre gratuite",
            "le catalogue des services payants",
            "un code de confirmation Yelen à 6 chiffres",
          ],
        },
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Un client affirme avoir payé mais vous n'avez aucune trace : demandez-lui son code de confirmation Yelen à 6 chiffres — c'est la preuve de réservation sur un service payant, à vérifier sur l'écran du Centre de validation.\n\nVous voulez proposer une prestation sans paiement en ligne ni code à présenter : c'est l'offre gratuite qu'il faut utiliser, pas un service payant à prix 0.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/ServicesTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["offre gratuite", "services payants", "catalogue", "code de confirmation", "fiche publique"],
    status: "publie",
  },
  {
    id: "pourquoi-offres-partenaires-moderees",
    domaine: "partenariat",
    titre: "Pourquoi mes services sont-ils publiés immédiatement mais mes offres partenaires doivent-elles être validées par Yelen ?",
    resume: "Vos services (onglet Services) sont publiés dès que vous les enregistrez. Vos offres partenaires (onglet Mes Offres) passent toujours par une modération Yelen avant publication — deux catalogues, deux niveaux d'exigence.",
    sections: [
      {
        type: "text",
        contenu: "Yelen traite différemment deux catalogues qui se ressemblent en apparence. Vos services (prestations que vous proposez au quotidien) sont publiés immédiatement, sous votre seule responsabilité. Vos offres partenaires (promotions, mises en avant marketing) passent systématiquement par une modération de l'équipe Yelen avant d'apparaître publiquement — jamais de publication directe.",
      },
      {
        type: "list",
        titre: "Pourquoi cette différence",
        items: [
          "Un service décrit une prestation que vous rendez déjà — vous en êtes le seul responsable, Yelen n'a pas à valider son contenu.",
          "Une offre partenaire est une communication marketing diffusée plus largement sur la plateforme — Yelen la relit avant publication pour en garantir la qualité et la cohérence.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Mes offres",
          zone: "Une offre « En modération »",
          montrer: [
            "le badge de statut « En modération »",
            "le même badge sur une offre « Publiée », pour comparaison",
          ],
        },
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Votre offre reste longtemps « En modération » : aucun délai fixe n'est garanti à ce jour — contactez le support Yelen224 si l'attente vous semble anormale.\n\nVotre offre a été refusée : le motif, quand il est disponible, s'affiche sur sa fiche. Vous pouvez la corriger et la resoumettre à la modération.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/ServicesTab.tsx", "app/[slug]/[id]/components/MesOffresTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["mes offres", "modération", "offre partenaire", "services", "validation yelen"],
    status: "publie",
    relatedArticles: ["statuts-offre-partenaire-suspendre-vs-archiver"],
  },
  {
    id: "statuts-offre-partenaire-suspendre-vs-archiver",
    domaine: "partenariat",
    titre: "Que signifient les statuts d'une offre partenaire, et quelle différence entre « Suspendre » et « Archiver » ?",
    resume: "Une offre partenaire suit 6 statuts possibles. Suspendre est une pause réversible ; Archiver est définitif — une offre archivée ne peut plus jamais être republiée.",
    sections: [
      {
        type: "list",
        titre: "Les 6 statuts d'une offre",
        items: [
          "Brouillon — en cours de rédaction, jamais visible publiquement.",
          "En modération — soumise, en attente d'examen par l'équipe Yelen.",
          "Publiée — validée et visible sur Yelen.",
          "Refusée — examinée et non retenue par l'équipe Yelen, avec un motif.",
          "Suspendue — retirée temporairement de la publication, à votre initiative.",
          "Archivée — retirée définitivement.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Mes offres",
          zone: "Menu d'actions d'une offre publiée",
          montrer: [
            "les boutons Suspendre et Archiver",
            "les 6 badges de statut, pour comparaison",
          ],
        },
      },
      {
        type: "warn",
        contenu: "Suspendre et Archiver ne se comportent pas du tout pareil derrière un nom proche. Suspendre une offre publiée la retire temporairement — vous pouvez la republier quand vous le souhaitez, mais elle repasse alors par une nouvelle modération avant de réapparaître. Archiver est définitif : une fois archivée, une offre ne peut plus jamais être resoumise. Si vous avez un doute, suspendez plutôt qu'archiver — vous pourrez toujours archiver plus tard.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Vous avez archivé une offre par erreur : elle ne peut pas être restaurée ni resoumise — créez une nouvelle offre avec le même contenu si besoin.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/MesOffresTab.tsx", "app/api/institution/offres/[id]/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["mes offres", "statut offre", "suspendre", "archiver", "brouillon", "en modération", "publiée", "refusée"],
    status: "publie",
  },
  {
    id: "devenir-partenaire-yelen",
    domaine: "partenariat",
    titre: "Comment devenir partenaire Yelen et débloquer l'onglet Mes Offres ?",
    resume: "Une demande de partenariat, un site web officiel renseigné, puis l'examen de l'équipe Yelen — une fois approuvée, l'onglet Mes Offres se débloque pour publier vos offres.",
    sections: [
      {
        type: "text",
        contenu: "Le programme Partenariat Yelen permet de publier des offres commerciales mises en avant auprès des citoyens, au-delà de votre catalogue de services habituel. L'onglet Mes Offres n'est accessible qu'une fois votre candidature approuvée.",
      },
      {
        type: "steps",
        titre: "Devenir partenaire",
        items: [
          "Renseignez un site web officiel dans votre Profil Entreprise — c'est un prérequis obligatoire avant de pouvoir candidater.",
          "Depuis l'onglet Partenaires, cliquez sur le bouton de candidature.",
          "Votre demande passe en examen par l'équipe Yelen.",
          "Une fois approuvée, l'onglet Mes Offres apparaît dans votre menu — vous pouvez y publier vos premières offres.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Partenaires",
          zone: "Vue d'ensemble avant candidature",
          montrer: [
            "le délai moyen de décision affiché (quand il est mesurable)",
            "le bouton de candidature",
          ],
        },
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Le délai moyen de décision affiché est une vraie moyenne calculée sur les demandes déjà tranchées — il ne s'affiche que si au moins 3 décisions ont déjà été prises, jamais une estimation inventée.\n\nUne demande refusée peut être soumise à nouveau : le motif de refus, quand il est disponible, s'affiche sur votre demande.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Le bouton de candidature est bloqué avec un message « Site web requis » : ajoutez votre site web officiel dans Profil Entreprise, puis revenez sur cet écran.\n\nVotre demande reste longtemps « En attente » : aucun délai fixe n'est garanti — le délai moyen affiché, quand il existe, reste une moyenne, pas une promesse.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/PartenariatTab.tsx", "app/[slug]/[id]/components/MonPartenariatTab.tsx", "components/DemandePartenariatOverlay.tsx", "app/api/institution/partenariat/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["partenariat", "devenir partenaire", "mes offres", "site web requis", "candidature"],
    status: "publie",
    relatedArticles: ["pourquoi-offres-partenaires-moderees"],
  },
  {
    id: "rejoindre-yelen-community",
    domaine: "communication-reputation",
    titre: "Comment rejoindre Yelen Community et publier une actualité de mon établissement ?",
    resume: "Une demande d'adhésion, l'examen de l'équipe Yelen, puis la publication de posts modérés — avec la possibilité de planifier une publication à l'avance.",
    sections: [
      {
        type: "text",
        contenu: "Yelen Community permet à votre établissement de publier des actualités visibles par les citoyens Yelen, au-delà de votre fiche publique. L'adhésion suit le même principe que le programme Partenariat : une demande, un examen par l'équipe Yelen, puis l'accès débloqué.",
      },
      {
        type: "steps",
        titre: "Rejoindre et publier",
        items: [
          "Depuis l'onglet Yelen Community, soumettez une demande d'adhésion (réservé à un administrateur).",
          "Votre demande passe en examen par l'équipe Yelen.",
          "Une fois membre actif, rédigez votre publication (texte et/ou images, catégorie).",
          "Envoyez-la pour validation — ou planifiez-la à une date et heure futures.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Yelen Community",
          zone: "Avant adhésion",
          montrer: [
            "le statut de la demande (Pas encore de demande / En cours d'examen / Membre actif)",
            "le formulaire de demande d'adhésion",
          ],
        },
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Planifier une publication retarde uniquement son entrée en file de modération — elle n'évite jamais la validation par l'équipe Yelen. Une publication planifiée passe en examen à l'heure programmée, exactement comme une publication envoyée immédiatement.\n\nUne demande d'adhésion refusée peut être soumise à nouveau à tout moment.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Votre publication planifiée n'est pas encore visible à l'heure prévue : elle vient seulement d'entrer en file de modération à cette heure-là — l'examen par l'équipe Yelen suit, sans délai garanti.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/CommunauteProTab.tsx", "app/api/institution/communaute-posts/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["yelen community", "actualité", "publication", "planifier", "modération", "adhésion"],
    status: "publie",
  },
  {
    id: "quel-canal-pour-communiquer-avec-vos-clients",
    domaine: "communication-reputation",
    titre: "Questions clients, Messagerie, Avis, Signalements : quel canal pour communiquer avec vos clients ?",
    resume: "Yelen propose 4 canaux distincts entre votre établissement et vos clients, chacun avec sa propre règle de visibilité — les confondre mène à répondre au bon endroit, mais au mauvais public.",
    sections: [
      {
        type: "text",
        contenu: "Votre tableau de bord Yelen propose 4 canaux différents pour communiquer avec vos clients : Questions clients, Messagerie, Avis, et Signalements. Ils se ressemblent — tous impliquent un échange avec un citoyen — mais chacun a sa propre règle de visibilité et son propre moment dans la relation. Utiliser le bon canal évite deux erreurs fréquentes : répondre en privé à quelque chose qui aurait dû rester visible sur votre fiche, ou, à l'inverse, traiter en public un sujet qui demandait de la discrétion.",
      },
      {
        type: "list",
        titre: "Les 4 canaux, en un coup d'œil",
        items: [
          "Questions clients — publique, avant rendez-vous. Un citoyen pose une question générale sur votre fiche avant de réserver ; dès que vous y répondez, la question et votre réponse s'affichent publiquement pour aider les prochains visiteurs.",
          "Messagerie — privée. Échange direct avec un citoyen déjà en relation avec vous (rendez-vous pris ou en cours) ; jamais visible par personne d'autre.",
          "Avis — publique, après un rendez-vous honoré. Le citoyen laisse une note et un commentaire sur son expérience ; votre réponse s'affiche publiquement sous l'avis, sur votre fiche.",
          "Signalements — restreint. Jamais visible par les autres citoyens ; traité uniquement entre votre établissement, le citoyen concerné, et l'équipe Yelen. À utiliser pour signaler formellement un incident (des deux côtés).",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Signalements",
          zone: "Fenêtre « Quel canal pour quoi ? »",
          montrer: [
            "les 4 canaux et leur règle de visibilité, tels qu'affichés dans le tableau de bord",
          ],
        },
      },
      {
        type: "list",
        titre: "Comment choisir le bon canal",
        items: [
          "Un visiteur qui n'a pas encore pris rendez-vous vous pose une question générale sur votre fiche → Questions clients (votre réponse aidera aussi les suivants).",
          "Un client déjà en contact avec vous a besoin d'un échange privé (confirmer un détail, demander un document) → Messagerie.",
          "Un client qui a honoré son rendez-vous partage son expérience → vous répondez à son avis, publiquement, dans Avis & Réputation.",
          "Un incident doit être tracé formellement — absence répétée d'un client, comportement abusif, ou un client signale votre établissement → Signalements, dans les deux sens.",
        ],
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Une Messagerie peut être liée à un rendez-vous précis (affiché dans le panneau de contexte) sans que ce soit obligatoire — une conversation peut exister sans aucun rendez-vous rattaché.\n\nRépondre à un avis ou à une question client est définitif une fois publié : ces deux canaux affichent votre réponse publiquement, relisez-la avant d'envoyer.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Vous ne savez toujours pas quel canal utiliser pour un cas précis, ou la situation nécessite une intervention humaine de l'équipe Yelen : passez par l'onglet Support Yelen de votre tableau de bord plutôt que de forcer la réponse dans le mauvais canal.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/QuestionsClientsTab.tsx", "app/[slug]/[id]/components/MessagerieTab.tsx", "app/[slug]/[id]/components/AvisReputationTab.tsx", "app/[slug]/[id]/components/SignalementsTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["questions clients", "messagerie", "avis", "signalements", "canal", "communication", "public", "privé", "visibilité"],
    status: "publie",
  },
  {
    id: "comment-est-calcule-score-reputation",
    domaine: "communication-reputation",
    titre: "Comment est calculé le score de réputation (Santé du compte) de mon établissement ?",
    resume: "Le score de 0 à 100 affiché sur l'onglet Avis & Réputation combine 4 signaux réels de votre activité — pas seulement la note moyenne de vos avis — et n'entraîne jamais de fermeture automatique.",
    sections: [
      {
        type: "text",
        contenu: "L'onglet « Avis & Réputation » (aussi appelé Santé du compte) résume la qualité de service perçue de votre établissement en un seul écran : un score sur 100, son évolution récente, le détail de vos avis, et des recommandations pour progresser. Il calcule ce score dès que votre établissement a reçu au moins 3 avis publiés — en dessous, l'écran affiche votre nombre d'avis reçus plutôt qu'un score qui ne serait pas encore représentatif.",
      },
      {
        type: "text",
        titre: "Comprendre l'écran",
        contenu: "En haut de l'écran, à côté du bouton Guide, un bouton « i » ouvre une explication détaillée des 4 composantes du score — plus besoin de la chercher ailleurs. Juste en dessous, une carte affiche votre score et son niveau (Platinum, Gold, Silver ou Danger).\n\nVient ensuite le graphique Évolution sur les 30 derniers jours : il indique votre score actuel, sa variation par rapport à il y a 30 jours, ainsi que vos valeurs la plus haute, la plus basse et la moyenne sur la période. Passez la souris sur la courbe pour afficher, jour par jour, le score de ce jour et le nombre d'avis reçus ce jour-là.\n\nDeux cartes séparées suivent, à ne pas confondre car elles ne portent pas sur la même période : « Avis du mois » compte uniquement les nouveaux avis reçus depuis le 1er du mois civil en cours (positifs, négatifs, sans commentaire) — elle peut légitimement afficher qu'aucun nouvel avis n'est arrivé ce mois-ci, sans que cela remette en cause votre réputation. « Répartition par note » porte elle sur tout votre historique d'avis, toutes périodes confondues (note moyenne par nombre d'étoiles, de 1 à 5).\n\nViennent ensuite la note moyenne par service si vous en proposez plusieurs, des recommandations automatiques, une sélection de citations de vos clients les plus positives (avec le nom du client, la date et le service concerné), puis la liste complète « Avis détaillés » (nom du client sur chaque carte) avec recherche, filtres et réponse.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Avis & Réputation",
          zone: "Vue d'ensemble",
          montrer: [
            "la carte de score avec son niveau (Platinum / Gold / Silver / Danger)",
            "le bouton « i » d'explication du score, à côté du bouton Guide",
            "le graphique d'évolution sur 30 jours avec son info-bulle au survol",
            "les deux cartes distinctes Avis du mois et Répartition par note",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que vous pouvez faire depuis cet écran",
        items: [
          "Suivre l'évolution de votre score, sa variation sur 30 jours, et ses valeurs les plus hautes, basses et moyennes.",
          "Répondre publiquement à un avis, en particulier un avis négatif.",
          "Rechercher un avis précis et filtrer par type (positif, négatif, sans réponse, avec réponse) ou par service concerné.",
          "Identifier le client à l'origine de chaque avis ou citation (son nom est affiché sur chaque carte).",
          "Comparer la note moyenne de chacun de vos services ce mois-ci.",
          "Lire les recommandations automatiques générées à partir de vos tendances récentes.",
        ],
      },
      {
        type: "steps",
        titre: "Répondre à un avis",
        items: [
          "Ouvrez la section Avis détaillés, en bas de l'écran.",
          "Filtrez sur « Sans réponse » si vous voulez traiter en priorité les avis qui n'ont pas encore de réponse.",
          "Cliquez sur Répondre sous l'avis concerné, rédigez votre réponse, puis Envoyer.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Avis & Réputation",
          zone: "Avis détaillés — un avis en cours de réponse",
          montrer: [
            "le nom du client affiché au-dessus de l'avis",
            "le champ de rédaction de la réponse",
            "les boutons Envoyer / Annuler",
            "un avis avec une réponse déjà publiée, pour comparaison",
          ],
        },
      },
      {
        type: "text",
        contenu: "Ce détail est exactement celui qu'affiche le bouton « i » en haut de l'écran, à côté de Guide :",
      },
      {
        type: "list",
        titre: "Les 4 composantes du score",
        items: [
          "Note moyenne de vos avis — 60 % du score.",
          "Réponse aux avis négatifs — 15 % du score (répondre à un avis négatif est l'une des rares actions qui améliore directement le score).",
          "Annulations de rendez-vous à l'initiative de votre établissement — 15 % du score.",
          "Réclamations de clients validées par l'équipe Yelen contre votre établissement — 10 % du score.",
        ],
      },
      {
        type: "info",
        titre: "Les 4 niveaux affichés",
        contenu: "Platinum à partir de 90, Gold à partir de 75, Silver à partir de 55. En dessous de 55, votre compte est classé « Danger » — avec un message de simple surveillance si le score reste au-dessus de 35, ou un message de zone critique en dessous, qui déclenche une recommandation de révision transmise en interne à l'équipe Yelen.",
      },
      {
        type: "warn",
        contenu: "Aucune fermeture ou suspension automatique n'est jamais déclenchée par ce score : une décision humaine de l'équipe Yelen est toujours nécessaire au préalable.",
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Le score est calculé sur vos 30 derniers avis évaluables, pas sur l'année entière : un très ancien avis sort progressivement du calcul à mesure que de nouveaux avis arrivent. Les avis masqués ou en brouillon n'entrent jamais dans ce calcul.\n\nLa section « Ce que disent vos clients » ne reprend pas tous vos avis : elle ne cite que les avis notés 4 ou 5 étoiles qui contiennent un commentaire, dans la limite des 5 plus récents.\n\nUne fois une réponse envoyée, elle s'affiche publiquement sous l'avis et ne peut plus être modifiée depuis cet écran — relisez-la avant d'envoyer.\n\nEn vue lecture seule (selon votre rôle), vous pouvez consulter l'intégralité de l'écran mais le bouton Répondre n'apparaît pas.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Aucun score ne s'affiche : vérifiez le nombre d'avis publiés indiqué à l'écran — 3 avis publiés sont nécessaires avant qu'un score apparaisse.\n\n« Avis du mois » affiche un message vide alors que vous savez avoir déjà reçu des avis : c'est normal si aucun nouvel avis n'est arrivé depuis le 1er du mois en cours — votre historique complet reste visible juste en dessous, dans « Répartition par note », qui n'est pas limitée au mois en cours.\n\nUn avis que vous savez exister n'apparaît pas dans la liste « Avis détaillés » : vérifiez vos filtres actifs (type, service, recherche texte) — un avis masqué ou encore en brouillon ne remonte jamais ici.",
      },
    ],
    sourceCode: ["lib/reputationScore.ts", "app/[slug]/[id]/components/AvisReputationTab.tsx", "app/api/institution/avis-reputation/status/route.ts", "app/api/institution/avis-reputation/liste/route.ts", "app/api/institution/avis/repondre/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["réputation", "score", "avis", "santé du compte", "platinum", "gold", "silver", "danger", "répondre à un avis", "avis négatif", "filtrer avis", "avis du mois", "répartition par note", "évolution du score", "nom du client"],
    status: "publie",
  },
  {
    id: "comment-est-determine-niveau-risque-journal",
    domaine: "equipe-organisation",
    titre: "Comment est déterminé le niveau de risque affiché dans le Journal d'activité ?",
    resume: "Chaque entrée du Journal d'activité (vert, orange ou rouge) suit une règle simple basée sur le type d'action réalisée — ce n'est pas une alerte de sécurité active ni un score global.",
    sections: [
      {
        type: "text",
        contenu: "Le Journal d'activité enregistre chaque action réalisée dans votre tableau de bord (qui a fait quoi, quand). C'est la piste d'audit officielle de votre établissement — utile pour comprendre un changement inattendu, retrouver l'auteur d'une action, ou produire une preuve en cas de contrôle. Certaines entrées portent en plus un niveau de risque — vert, orange ou rouge — pour attirer votre attention sur les actions les plus sensibles, sans jamais bloquer ni modifier quoi que ce soit.",
      },
      {
        type: "text",
        titre: "Comprendre l'écran",
        contenu: "En haut de l'écran, 8 cartes résument l'activité récente (actions aujourd'hui/cette semaine, membres actifs, connexions du jour, alertes sécurité et actions critiques sur 7 jours, exportations récentes, dernière synchronisation). En dessous, une barre de recherche (nom, référence, IP, cible) et plusieurs familles de filtres combinables : période, catégorie d'action, niveau de risque, plateforme, rôle, et membre de l'équipe (si vous êtes plusieurs). Le résultat s'affiche en timeline, groupée par jour ; cliquer sur une entrée ouvre sa fiche détaillée.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Journal d'activité",
          zone: "Vue d'ensemble",
          montrer: [
            "les 8 cartes de statistiques en haut de l'écran",
            "la barre de recherche et la première ligne de filtres",
            "la timeline groupée par jour, avec le point de couleur de niveau de risque sur chaque entrée",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que vous pouvez faire depuis cet écran",
        items: [
          "Rechercher une action précise par nom, référence, adresse IP ou cible.",
          "Filtrer par période, catégorie, niveau de risque, plateforme, rôle ou membre.",
          "Ouvrir la fiche détaillée d'une entrée pour voir son contexte complet.",
          "Copier la référence d'une entrée ou la partager.",
          "Exporter le journal dans 5 formats, dont un rapport signé pour un usage officiel.",
        ],
      },
      {
        type: "steps",
        titre: "Rechercher et filtrer une action précise",
        items: [
          "Tapez un nom, une référence, une IP ou une cible dans la barre de recherche, puis validez avec Entrée ou le bouton Rechercher.",
          "Affinez avec les filtres : période (Aujourd'hui, Hier, 7 jours, 30 jours ou dates personnalisées), catégorie d'action, niveau de risque, plateforme, rôle.",
          "Cliquez sur une entrée pour ouvrir sa fiche détaillée.",
        ],
      },
      {
        type: "steps",
        titre: "Exporter le journal",
        items: [
          "Cliquez sur Exporter, en haut à droite de l'écran.",
          "Choisissez un format : CSV, Excel (.xlsx), JSON, PDF, ou Rapport certifié (référence et empreinte).",
          "Le fichier se génère côté serveur puis se télécharge automatiquement.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Journal d'activité",
          zone: "Fiche détail d'une entrée",
          montrer: [
            "le niveau de risque et sa signification",
            "l'auteur, l'action et la cible de l'entrée",
            "la référence copiable de l'entrée",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que peuvent signifier les niveaux orange et rouge",
        items: [
          "Rouge — peut notamment correspondre à une suppression définitive (document, tâche, membre d'équipe...), un changement de rôle d'un membre, ou un accès refusé.",
          "Orange — peut notamment correspondre à une désactivation de membre, un rendez-vous refusé ou annulé, ou une tentative de confirmation d'identité échouée.",
          "Vert — le cas par défaut, aucune explication supplémentaire n'est affichée.",
        ],
      },
      {
        type: "warn",
        contenu: "C'est une alerte automatique et purement informative : elle ne modifie jamais un accès ni ne bloque une action. Plusieurs actions différentes peuvent produire le même niveau — ce n'est pas une correspondance unique et exhaustive entre une ligne précise et une règle précise.",
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Le filtre par membre ne s'affiche que si votre équipe compte plus d'une personne — inutile avec un seul membre.\n\nLe format d'export « Rapport signé » ajoute un cachet et une empreinte au document : à privilégier quand l'export doit servir de preuve difficile à contester (contrôle, litige), plutôt qu'un simple export de travail au format CSV ou Excel.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Aucune entrée ne s'affiche : vérifiez vos filtres actifs (période, catégorie, niveau, rôle, membre) — un filtre trop restrictif est la cause la plus fréquente. Essayez d'abord « Toutes dates » et « Toutes » catégories pour confirmer que l'action existe bien dans le journal.\n\nUne action que vous attendiez n'apparaît pas du tout : le Journal n'enregistre que les actions réalisées depuis le tableau de bord Yelen — une action effectuée ailleurs (ex. directement en base de données) n'y figure pas.",
      },
    ],
    sourceCode: ["lib/journalTaxonomie.ts", "app/[slug]/[id]/components/JournalTab.tsx"],
    derniereVerification: "2026-09-24",
    motsClefs: ["journal d'activité", "risque", "sécurité", "audit", "vert", "orange", "rouge", "exporter", "rapport signé", "filtrer", "rechercher"],
    status: "publie",
  },
  {
    id: "roles-equipe-et-permissions",
    domaine: "equipe-organisation",
    titre: "Quels sont les 5 rôles d'équipe sur Yelen et que peut faire chacun ?",
    resume: "Chaque personne qui se connecte à votre tableau de bord porte l'un de 5 rôles fixes — Admin, Agent d'accueil, Comptable, Superviseur, Dirigeant — qui déterminent les onglets qu'elle voit et les actions qu'elle peut effectuer.",
    sections: [
      {
        type: "text",
        contenu: "Dans l'onglet « Équipe et accès », chaque personne qui se connecte à votre tableau de bord Yelen porte l'un de 5 rôles fixes. Un rôle n'est pas une simple étiquette : il détermine réellement quels onglets apparaissent dans son menu, et ce qu'elle peut faire dans chacun d'eux. Seul un administrateur peut inviter un membre, lui attribuer un rôle, ou désactiver son accès.",
      },
      {
        type: "text",
        titre: "Comprendre l'écran",
        contenu: "En haut de l'écran, quelques chiffres clés (membres actifs, invitations en attente) et le bouton « Inviter un membre », réservé aux administrateurs. En dessous, la liste de votre équipe : chaque carte affiche le nom, le rôle et le statut du membre. Cliquez sur une carte pour ouvrir sa fiche détaillée — vous y retrouvez son rôle, la liste des domaines auxquels il a accès, et les actions de gestion (changer son rôle, le désactiver, réinitialiser son accès).",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Équipe et accès",
          zone: "Vue d'ensemble",
          montrer: [
            "la liste des membres actifs avec leur rôle",
            "les invitations en attente",
            "la fiche détaillée d'un membre avec ses permissions par domaine",
          ],
        },
      },
      {
        type: "list",
        titre: "Les 5 rôles et ce qu'ils permettent",
        items: [
          "Admin — accès total, y compris la gestion de l'équipe et des rôles. C'est le seul rôle qui peut inviter, modifier ou désactiver un autre membre.",
          "Agent d'accueil — rendez-vous, clients, validation de présence. Pas d'accès aux finances ni à la configuration de l'établissement.",
          "Comptable — services, tarifs, paiements et historique financier. Pas d'accès à la gestion de l'équipe.",
          "Superviseur — supervise les équipes, réorganise agendas et priorités. Aucun accès à la configuration système de l'établissement.",
          "Dirigeant — vue exécutive, statistiques et rapports. Lecture seule sur ce qui est sensible : il consulte, mais ne pilote jamais les opérations au quotidien.",
        ],
      },
      {
        type: "info",
        titre: "Un onglet que vous ne voyez pas n'est pas un bug",
        contenu: "Deux situations bien distinctes selon votre rôle : un onglet peut être totalement absent de votre menu (votre rôle n'y a aucun accès), ou visible avec un bandeau « lecture seule » en haut de l'écran (vous pouvez consulter, mais les boutons d'action restent désactivés). Dans les deux cas, ce n'est jamais une erreur de chargement — c'est votre rôle qui détermine ce comportement.",
      },
      {
        type: "steps",
        titre: "Inviter un membre et ajuster ses accès",
        items: [
          "Cliquez sur « Inviter un membre », en haut de l'écran Équipe et accès (réservé aux administrateurs).",
          "Renseignez son prénom, son nom, sa fonction (optionnelle), et un identifiant de connexion unique — c'est ce qu'il tapera pour se connecter, sans espace.",
          "Choisissez son rôle parmi les 5 proposés : la description sous les boutons rappelle ce que ce rôle permet.",
          "Si besoin, décochez un domaine précis (Rendez-vous, Clients, Équipe, Finance, Configuration...) pour le retirer à ce membre en particulier — vous ne pouvez jamais lui accorder plus que ce que son rôle permet déjà, seulement en retirer.",
        ],
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Retirer un domaine à un membre ne crée pas un nouveau rôle : cela reste son rôle d'origine, simplement restreint sur ce point précis pour cette personne. Si vous changez son rôle plus tard, ces restrictions personnalisées repartent de zéro sur le nouveau rôle.\n\nUn membre « Dirigeant » peut avoir accès en lecture à un onglet sensible (par exemple Avis & Réputation ou Journal d'activité) sans jamais pouvoir y agir — répondre à un avis ou exporter restent des actions réservées aux rôles opérationnels.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Un membre ne voit pas un onglet que vous pensiez lui avoir donné : vérifiez son rôle et, dans sa fiche détaillée, la liste des domaines retirés — un domaine décoché à l'invitation reste retiré jusqu'à ce qu'un administrateur le rétablisse.\n\nUn membre reste affiché en « invitation en attente » : cela signifie qu'il ne s'est encore jamais connecté avec son identifiant — vérifiez avec lui l'identifiant exact qui lui a été communiqué.",
      },
    ],
    sourceCode: ["lib/institutionPermissions.ts", "app/[slug]/[id]/components/EquipeTab.tsx", "app/[slug]/[id]/layout.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["équipe", "rôles", "permissions", "admin", "agent d'accueil", "comptable", "superviseur", "dirigeant", "inviter un membre", "domaines", "lecture seule"],
    status: "publie",
  },
  {
    id: "signalement-recu-contre-votre-etablissement",
    domaine: "securite-conformite",
    titre: "J'ai reçu un signalement d'un citoyen contre mon établissement — que se passe-t-il maintenant ?",
    resume: "Un citoyen peut signaler votre établissement pour un motif précis (rendez-vous non honoré, comportement irrespectueux...). Le dossier apparaît dans votre onglet Signalements avec le badge « Contre vous » — vous pouvez l'enrichir, mais sa progression reste pilotée par l'équipe Yelen.",
    sections: [
      {
        type: "text",
        contenu: "Un citoyen qui a eu une interaction avec votre établissement peut déposer un signalement contre vous — pour un comportement irrespectueux, un rendez-vous non honoré de votre part, des informations fausses sur votre fiche, ou une tentative d'arnaque. Ce dossier apparaît dans votre onglet Signalements, repéré par le badge « Contre vous » (ou « Déposé contre vous » dans sa fiche détaillée), à distinguer des dossiers que vous déposez vous-même contre un citoyen.",
      },
      {
        type: "text",
        titre: "Comprendre l'écran",
        contenu: "Ouvrez le dossier pour voir le motif, la description, la date de l'incident si elle a été renseignée, et les éventuelles pièces jointes du citoyen. Sa fiche affiche aussi son statut actuel et une courte phrase expliquant où en est l'examen.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Signalements",
          zone: "Fiche détail — signalement reçu d'un citoyen",
          montrer: [
            "le badge « Contre vous »",
            "le motif et la description fournis par le citoyen",
            "la zone de notes internes et de pièces jointes de l'établissement",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que vous pouvez faire",
        items: [
          "Consulter le détail complet du signalement et son historique.",
          "Ajouter une note interne — un espace de coordination avec votre équipe, jamais visible par le citoyen.",
          "Ajouter vos propres pièces jointes pour appuyer votre version des faits.",
          "Assigner le dossier à un membre de votre équipe pour qu'il le suive.",
        ],
      },
      {
        type: "warn",
        contenu: "La progression du dossier (nouveau, en cours, résolu, clôturé...) est pilotée exclusivement par l'équipe Yelen, jamais par votre établissement — vous ne pouvez pas vous-même marquer ce signalement comme résolu, rejeté ou clôturé. Votre rôle est d'apporter du contexte, pas de trancher le dossier.",
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Les notes internes que vous ajoutez restent invisibles pour le citoyen à l'origine du signalement. Pour échanger directement avec lui, utilisez la Messagerie si une conversation existe déjà — un signalement n'est pas un canal de réponse au citoyen.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Aucun délai fixe de traitement n'est garanti à ce jour — il dépend du volume et de la nature du dossier. Si la situation vous semble urgente ou que vous avez besoin d'un contact humain, passez par l'onglet Support Yelen de votre tableau de bord.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/SignalementsTab.tsx", "lib/signalementsConstants.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["signalement", "contre vous", "citoyen", "statut", "note interne", "pièce jointe", "sécurité"],
    status: "publie",
    relatedArticles: ["quel-canal-pour-communiquer-avec-vos-clients"],
  },
  {
    id: "comment-signaler-un-citoyen",
    domaine: "securite-conformite",
    titre: "Comment signaler un citoyen (absence répétée, comportement abusif...) et pourquoi un rendez-vous est-il exigé ?",
    resume: "Signaler un citoyen se fait en 4 étapes depuis l'onglet Signalements — mais seul un citoyen ayant déjà un historique de rendez-vous avec votre établissement peut être signalé.",
    sections: [
      {
        type: "text",
        contenu: "Si un citoyen a un comportement problématique — absence répétée sans annulation, comportement agressif, fausses informations fournies, ou prise de rendez-vous répétitive sans intention réelle — vous pouvez déposer un signalement formel contre lui depuis l'onglet Signalements. Le dossier sera examiné par l'équipe Yelen, qui décide de la suite ; ce n'est jamais une sanction automatique.",
      },
      {
        type: "steps",
        titre: "Déposer un signalement",
        items: [
          "Cliquez sur « Nouveau signalement », en haut de l'onglet Signalements.",
          "Recherchez le citoyen concerné par son nom ou son numéro, puis choisissez le motif qui correspond le mieux à la situation.",
          "Décrivez précisément les faits (20 caractères minimum), indiquez la date de l'incident, et rattachez si besoin un rendez-vous passé ou une pièce jointe (jusqu'à 5 fichiers, PDF/JPG/PNG, 10 Mo maximum chacun).",
          "Relisez le récapitulatif à l'étape de vérification, puis envoyez.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Signalements",
          zone: "Nouveau signalement — étape Identification",
          montrer: [
            "la recherche de citoyen par nom ou téléphone",
            "les 5 motifs proposés côté établissement",
            "l'indicateur de progression des étapes",
          ],
        },
      },
      {
        type: "info",
        titre: "Pourquoi un rendez-vous est-il exigé ?",
        contenu: "Vous ne pouvez rechercher et signaler qu'un citoyen qui a déjà un historique de rendez-vous avec votre établissement — c'est cet historique qui le fait apparaître dans la recherche. Ce garde-fou empêche de signaler un citoyen avec lequel vous n'avez jamais eu d'interaction réelle.\n\nEnsuite, dans le formulaire, rattacher un rendez-vous précis reste optionnel (« Aucun rendez-vous spécifique » est accepté) : si vous en choisissez un, seuls les rendez-vous déjà passés ou en cours vous sont proposés, jamais un rendez-vous futur.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Le citoyen que vous cherchez n'apparaît pas dans la recherche : vérifiez qu'il a bien déjà un rendez-vous enregistré avec votre établissement — sans historique, il n'est pas proposé.\n\nAucun motif ne correspond exactement à la situation : choisissez « Autre » et détaillez précisément les faits dans la description.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/SignalementsTab.tsx", "lib/signalementsConstants.ts", "app/api/institution/signalements/rdv-eligibles/route.ts", "app/api/institution/clients/route.ts"],
    derniereVerification: "2026-10-17",
    motsClefs: ["signalement", "signaler un citoyen", "absence répétée", "comportement abusif", "rendez-vous", "motif"],
    status: "publie",
  },
  {
    id: "statuts-signalement",
    domaine: "securite-conformite",
    titre: "Que signifient les statuts d'un signalement (nouveau, en cours, résolu...) et que se passe-t-il ensuite ?",
    resume: "Un signalement — déposé par vous ou contre vous — suit l'un de 8 statuts possibles. Chacun indique précisément qui agit et ce qui va se passer ensuite.",
    sections: [
      {
        type: "list",
        titre: "Les 8 statuts possibles",
        items: [
          "Nouveau — le signalement vient d'être reçu par l'équipe Yelen, qui va l'examiner et l'orienter.",
          "À traiter — en attente de prise en charge par l'équipe Yelen.",
          "En cours — l'équipe Yelen examine actuellement ce dossier.",
          "En attente — l'examen est en pause, l'équipe Yelen attend un élément avant de poursuivre.",
          "Résolu — le dossier a été traité ; il peut encore être rouvert si nécessaire, ou sera clôturé.",
          "Clôturé — le dossier est clos, aucune suite n'est prévue.",
          "Rejeté — le signalement a été examiné et n'a pas été retenu.",
          "Doublon — identifié comme le double d'un autre dossier déjà traité.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Signalements",
          zone: "Fiche détail d'un signalement",
          montrer: [
            "le badge de statut actuel",
            "la phrase expliquant où en est l'examen",
            "l'historique des changements de statut",
          ],
        },
      },
      {
        type: "warn",
        contenu: "La progression d'un statut à un autre est toujours décidée par l'équipe Yelen, jamais par votre établissement — que le signalement soit le vôtre ou qu'il vous vise. Votre rôle se limite à apporter du contexte (notes, pièces jointes) et à suivre l'avancement.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Un signalement reste longtemps au même statut : aucun délai fixe n'est garanti à ce jour — contactez le support Yelen224 si la situation vous semble urgente.",
      },
    ],
    sourceCode: ["lib/signalementsConstants.ts", "app/[slug]/[id]/components/SignalementsTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["signalement", "statut", "nouveau", "en cours", "résolu", "clôturé", "rejeté", "doublon"],
    status: "publie",
    relatedArticles: ["signalement-recu-contre-votre-etablissement", "comment-signaler-un-citoyen"],
  },
  {
    id: "proteger-compte-pin-passkey-2fa",
    domaine: "securite-conformite",
    titre: "Comment protéger mon compte avec un code PIN, une clé d'accès (Passkey) ou la double authentification ?",
    resume: "L'écran Sécurité du compte propose 3 protections indépendantes — un code PIN, une double authentification (TOTP) et des clés d'accès (Passkeys) — ainsi que la gestion de vos appareils mémorisés et de la récupération du compte.",
    sections: [
      {
        type: "text",
        contenu: "L'écran Sécurité du compte, réservé à l'administrateur, centralise la protection de l'ensemble de l'institution : connexion et authentification, appareils et sessions mémorisés, activité de sécurité récente, et informations de récupération du compte.",
      },
      {
        type: "list",
        titre: "Les 3 protections disponibles",
        items: [
          "Code PIN Yelen — un déverrouillage rapide de votre session, sans remplacer votre connexion habituelle.",
          "Double authentification (TOTP) — un code à usage unique généré par une application comme Google Authenticator ou Authy.",
          "Clé d'accès (Passkey) — empreinte, visage ou code de votre appareil, sans mot de passe à retenir.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Sécurité du compte",
          zone: "Connexion & authentification",
          montrer: [
            "le statut global (« Votre compte est protégé » / « peut être mieux protégé »)",
            "les 3 protections disponibles",
            "la liste des appareils mémorisés",
          ],
        },
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Aucune des 3 protections n'est obligatoire en elle-même sur cet écran — votre compte est considéré « protégé » dès qu'au moins une est active. (La double authentification devient en revanche obligatoire 24h après votre toute première connexion à Yelen, voir le guide dédié.)\n\n« Appareils mémorisés » permet de se reconnecter sans ressaisir de code à chaque fois — vous pouvez déconnecter un appareil individuellement, ou tous les autres d'un coup.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Vous ne reconnaissez pas un appareil dans la liste : déconnectez-le immédiatement avec le bouton dédié.\n\nVous avez perdu l'accès à votre application d'authentification ou à votre clé d'accès : utilisez les informations de récupération du compte (téléphone ou email) renseignées dans la section du même nom, ou contactez le support Yelen224.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/SecuriteCompteTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["sécurité du compte", "pin", "passkey", "clé d'accès", "double authentification", "totp", "appareils mémorisés", "récupération du compte"],
    status: "publie",
    relatedArticles: ["double-authentification-24h-premiere-connexion"],
  },
  {
    id: "pourquoi-admin-ne-peut-pas-rembourser",
    domaine: "finance",
    titre: "Pourquoi un administrateur ne peut-il pas effectuer de remboursement si un comptable est actif ?",
    resume: "Sur Yelen, les remboursements de vos clients sont réservés au rôle Comptable dès qu'un compte comptable actif existe dans votre équipe — même pour un administrateur.",
    sections: [
      {
        type: "text",
        contenu: "L'onglet Paiements réunit tous les paiements liés aux rendez-vous de votre établissement : leur statut, les reçus générés, les remboursements, et les opérations qui nécessitent une intervention. Si votre établissement a un membre d'équipe avec le rôle Comptable, cet écran reste accessible à un administrateur mais en lecture seule : seul le comptable peut initier un remboursement. Cette règle protège le suivi financier de votre établissement — elle garantit que chaque remboursement reste attribué à la bonne personne, tracée dans le Journal d'activité.",
      },
      {
        type: "text",
        titre: "Comprendre l'écran",
        contenu: "En haut de l'écran, des cartes chiffrées résument la journée (nombre de paiements, montant encaissé, paiements en attente, anomalies) et les montants encaissés/en attente/remboursés avec leur évolution récente. La liste des paiements se filtre par onglet (Tous, En attente, Confirmés, Remboursés, Annulés, Litiges) et par période (Aujourd'hui, 7 jours, 30 jours, Tout). Chaque ligne affiche le statut du paiement, l'état du reçu associé (Reçu généré, Reçu en attente, ou Reçu archivé) et une mini-timeline de son parcours (Déclaré → Confirmé → Reçu généré → Archivé, ou Déclaré → Annulé/Absent selon l'issue).",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Paiements",
          zone: "Vue d'ensemble",
          montrer: [
            "les cartes chiffrées du jour",
            "les onglets de statut (Tous, En attente, Confirmés, Remboursés, Annulés, Litiges)",
            "une ligne de paiement avec son badge de reçu et sa mini-timeline",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que vous pouvez faire depuis cet écran",
        items: [
          "Suivre en un coup d'œil les paiements du jour et leur évolution récente.",
          "Filtrer les paiements par statut ou par période.",
          "Consulter l'état du reçu de chaque paiement.",
          "Ouvrir la fiche détaillée d'un paiement pour voir son parcours complet.",
          "Rembourser un paiement confirmé ou terminé — réservé au rôle Comptable dans les conditions ci-dessous.",
        ],
      },
      {
        type: "steps",
        titre: "Comment intervenir vous-même en cas d'urgence",
        items: [
          "Ouvrez l'onglet Équipe.",
          "Suspendez temporairement le compte du comptable.",
          "Revenez sur l'onglet Paiements : un bandeau « Mode intervention d'urgence » confirme que vous pouvez désormais rembourser à sa place.",
          "Réactivez le compte du comptable dès que la situation d'urgence est passée.",
        ],
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Paiements",
          zone: "Bandeau mode intervention d'urgence",
          montrer: [
            "le bandeau signalant que le compte comptable est suspendu",
            "le bouton Rembourser désormais actif pour l'administrateur",
          ],
        },
      },
      {
        type: "warn",
        contenu: "Toutes les actions effectuées en mode intervention d'urgence restent journalisées et visibles dans le Journal d'activité, exactement comme une action normale.",
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Le bouton Rembourser n'apparaît que pour un paiement au statut Confirmé ou Terminé — un paiement en attente, déjà remboursé, annulé ou associé à une absence ne peut pas être remboursé depuis cet écran.\n\nL'onglet Litiges est présent mais reste toujours vide aujourd'hui : aucun mécanisme de litige n'existe encore côté Yelen pour les paiements. Ce n'est pas une anomalie de votre compte.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Le reçu d'un paiement confirmé reste indiqué « Reçu en attente » de façon prolongée : c'est un signal d'anomalie de génération, pas un problème de votre côté — contactez le support Yelen si la situation persiste plusieurs heures.\n\nVous ne voyez pas le bouton Rembourser alors que le paiement est confirmé : vérifiez d'abord votre rôle et l'état du compte comptable de votre équipe — voir la procédure d'intervention d'urgence ci-dessus.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/PaiementsTab.tsx", "lib/comptableProtection.ts"],
    derniereVerification: "2026-09-24",
    motsClefs: ["remboursement", "paiements", "comptable", "administrateur", "rôles", "reçu", "litiges", "mode urgence"],
    status: "publie",
    relatedArticles: ["difference-facturation-clients-facturation-yelen"],
  },
  {
    id: "difference-facturation-clients-facturation-yelen",
    domaine: "yelen-business",
    titre: "Quelle est la différence entre « Facturation » (vos clients) et « Facturation Yelen » (votre abonnement) ?",
    resume: "Yelen sépare volontairement deux écrans au nom proche : l'un gère l'argent que vos clients vous doivent, l'autre l'argent que vous devez à Yelen.",
    sections: [
      {
        type: "text",
        contenu: "Votre tableau de bord contient deux écrans nommés « Facturation ». Ils ne gèrent pas la même relation financière et ne partagent aucune donnée : les confondre peut faire chercher une facture au mauvais endroit.",
      },
      {
        type: "list",
        titre: "Les deux écrans",
        items: [
          "« Facturation » (section Finance) — les factures que vous émettez vous-même à vos clients. Statuts possibles : Brouillon, En attente de paiement, Partiellement payée, Payée, En retard, Annulée, Remboursée.",
          "« Facturation Yelen » (section Yelen Business) — ce que Yelen vous facture pour votre abonnement/forfait, et la date à laquelle vous devez payer.",
        ],
      },
      {
        type: "text",
        titre: "Comprendre l'écran Facturation (vos clients)",
        contenu: "Tant qu'aucune facture n'existe, l'écran propose directement de créer la première. Une fois vos premières factures émises, un bandeau résume ce qui reste à encaisser, ce qui est en retard, ce qui est déjà encaissé et le nombre de factures encore ouvertes. La liste se filtre par statut et se recherche par numéro de facture ou nom de client ; chaque ligne indique le montant total, ce qui a été payé et ce qu'il reste à régler.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Facturation",
          zone: "Vue d'ensemble avec factures existantes",
          montrer: [
            "le bandeau À encaisser / En retard / Encaissé / Factures ouvertes",
            "les filtres de statut",
            "le tableau des factures avec la colonne Reste à payer",
          ],
        },
      },
      {
        type: "steps",
        titre: "Créer une facture",
        items: [
          "Cliquez sur + Nouvelle facture (ou + Créer une facture si c'est votre toute première).",
          "Suivez l'assistant de création pour renseigner le client, les lignes de facture et l'échéance.",
          "Alternative rapide : utilisez « Générer un reçu depuis un paiement confirmé » pour transformer un paiement déjà encaissé en facture, sans ressaisie.",
        ],
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Le bouton de création de facture n'apparaît que si votre rôle dispose du droit de facturation — selon votre rôle dans l'équipe, l'écran peut rester consultable sans permettre d'en créer une nouvelle.\n\nLa section Yelen Business regroupe plusieurs écrans encore largement en construction (Compte, Contrat, Forfait, Transactions, Réconciliation, Frais & commissions, Facturation, Documents) : un champ pas encore disponible y est toujours annoncé comme tel (« Bientôt disponible »), jamais laissé vide sans explication ni remplacé par une valeur inventée. C'est un chantier en cours, pas une anomalie de votre compte.",
      },
      {
        type: "tip",
        contenu: "Une règle simple pour ne jamais se tromper : si le document concerne ce que VOUS devez payer à Yelen, c'est toujours dans Yelen Business — jamais dans « Facturation ».",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Une facture reste indiquée « En retard » alors qu'elle a été payée entre-temps : ce statut est recalculé automatiquement à partir de la date d'échéance et du montant réellement encaissé — vérifiez que le paiement a bien été enregistré sur cette facture précise.\n\nVous cherchez un document concernant votre abonnement Yelen (et non un paiement client) : il se trouve dans Yelen Business → Facturation, pas dans cet écran.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/FacturationTab.tsx", "app/[slug]/[id]/components/YelenFacturationTab.tsx", "app/[slug]/[id]/components/YelenBusinessShared.tsx", "lib/facturationClients.ts"],
    derniereVerification: "2026-09-24",
    motsClefs: ["facturation", "facturation yelen", "yelen business", "abonnement", "forfait", "factures", "créer une facture", "en retard", "reçu"],
    status: "publie",
    relatedArticles: ["pourquoi-admin-ne-peut-pas-rembourser"],
  },
  {
    id: "pourquoi-yelen-business-bientot-disponible",
    domaine: "yelen-business",
    titre: "Pourquoi la plupart des écrans Yelen Business affichent-ils « Bientôt disponible » ?",
    resume: "Yelen Business prépare votre future relation contractuelle et financière avec Yelen. Plusieurs champs et sections affichent honnêtement « Bientôt disponible » plutôt que de simuler des données qui n'existent pas encore.",
    sections: [
      {
        type: "text",
        contenu: "La section Yelen Business regroupe votre relation contractuelle avec Yelen (contrat, forfait, facturation de votre abonnement, transactions, frais, documents...) — distincte de Facturation, qui concerne vos propres clients. Plusieurs de ces écrans affichent le badge « Bientôt disponible » sur certains champs ou sections entières : c'est un choix délibéré plutôt qu'un oubli.",
      },
      {
        type: "info",
        titre: "Pourquoi ce choix",
        contenu: "Tant qu'une donnée réelle n'existe pas encore côté Yelen pour votre établissement, l'écran ne simule jamais de chiffre ni de statut inventé — il l'indique clairement avec « Bientôt disponible ». Vous savez ainsi toujours si ce que vous voyez est une vraie donnée ou une fonctionnalité à venir.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Yelen Business — Mon compte",
          zone: "Champs avec badge « Bientôt disponible »",
          montrer: [
            "un champ renseigné normalement",
            "un champ avec le badge « Bientôt disponible », pour comparaison",
          ],
        },
      },
      {
        type: "info",
        titre: "Cas particuliers",
        contenu: "Deux écrans de cette section (Réconciliation, Documents Yelen) n'utilisent pas ce badge : ils affichent un état honnête différent (« rien à rapprocher pour l'instant », aucun document disponible) car ils dépendent de données produites par d'autres modules qui n'existent pas encore — le résultat concret est similaire, la formulation est simplement adaptée à chaque écran.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Un champ reste indéfiniment sur « Bientôt disponible » et vous avez besoin de cette information rapidement : contactez le support Yelen224, qui pourra vous indiquer où en est sa mise à disposition.",
      },
    ],
    sourceCode: ["app/[slug]/[id]/components/YelenBusinessShared.tsx", "app/[slug]/[id]/components/YelenCompteTab.tsx", "app/[slug]/[id]/components/YelenContratTab.tsx", "app/[slug]/[id]/components/YelenForfaitTab.tsx", "app/[slug]/[id]/components/YelenPaiementsTab.tsx", "app/[slug]/[id]/components/YelenTransactionsTab.tsx", "app/[slug]/[id]/components/YelenFraisTab.tsx", "app/[slug]/[id]/components/YelenReconciliationTab.tsx", "app/[slug]/[id]/components/YelenDocumentsTab.tsx"],
    derniereVerification: "2026-10-17",
    motsClefs: ["yelen business", "bientôt disponible", "contrat", "forfait", "transactions", "frais et commissions", "réconciliation", "documents yelen"],
    status: "publie",
  },
];

export function getCategories(): Categorie[] {
  return [...CATEGORIES].sort((a, b) => a.ordre - b.ordre);
}

export function getCategorie(domaine: DomaineId): Categorie | undefined {
  return CATEGORIES.find(c => c.id === domaine);
}

// Un article "brouillon"/"archive" ne doit jamais apparaître en nav,
// compteurs, recherche, catégories ou articles associés (UX Lock
// 22/09/2026, §10) — cette fonction est le seul point de filtrage, toutes
// les fonctions publiques ci-dessous s'appuient sur elle plutôt que de
// filtrer `status` chacune de son côté.
export function getPublishedArticles(): Article[] {
  return ARTICLES.filter(a => a.status === "publie");
}

export function getArticlesByDomaine(domaine: DomaineId): Article[] {
  return getPublishedArticles().filter(a => a.domaine === domaine);
}

export function getArticle(domaine: DomaineId, articleId: string): Article | undefined {
  return getPublishedArticles().find(a => a.domaine === domaine && a.id === articleId);
}

export function countArticles(domaine: DomaineId): number {
  return getArticlesByDomaine(domaine).length;
}

// Catégories visibles sur l'accueil (retour Bryan 23/09/2026, brief
// "organisation de la page d'accueil du Help Center") — une catégorie
// sans aucun article publié ne doit jamais apparaître publiquement,
// jamais un dossier vide qui donne l'impression d'un Help Center
// incomplet. `ordre` sert déjà de champ de tri manuel (pas besoin d'un
// champ `isPublished` séparé : une catégorie n'existe dans CATEGORIES
// que si elle correspond à un écran réellement configuré, voir
// commentaire en tête de fichier — la retirer du tableau EST l'action
// de dépublier, il n'y a pas de CMS séparé en V1).
export function getVisibleCategories(): Categorie[] {
  return getCategories().filter(c => countArticles(c.id) > 0);
}

// IDs réels uniquement — un ID orphelin (article renommé/dépublié) ou une
// auto-référence ne sont jamais rendus, jamais un article fantôme (UX Lock
// 22/09/2026, §9).
export function getRelatedArticles(article: Article): Article[] {
  if (!article.relatedArticles?.length) return [];
  const published = getPublishedArticles();
  return article.relatedArticles
    .filter(id => id !== article.id)
    .map(id => published.find(a => a.id === id))
    .filter((a): a is Article => Boolean(a));
}

// Aucun tracking d'usage en V1 (§11.4 de l'architecture, décision
// verrouillée) — le composant "Articles populaires" doit exister
// structurellement (UX Lock 22/09/2026, §6) mais ne jamais afficher un
// classement fabriqué. Reste vide tant qu'une vraie mesure n'existe pas.
export function getPopularArticles(): Article[] {
  return [];
}

/** Valeur par défaut quand `article.auteur` est absent — aucun nom inventé. */
export const AUTEUR_PAR_DEFAUT = "Équipe Yelen";

const MOTS_PAR_MINUTE = 200;

/** Temps de lecture estimé à partir du contenu réel de l'article (comptage
 * de mots ÷ 200 mots/min, arrondi au supérieur) — jamais une valeur saisie
 * à la main, cohérent avec la discipline "zéro donnée inventée" du projet. */
export function estimerDureeLecture(article: Article): number {
  const texte = article.sections
    .flatMap(s => [s.titre, s.contenu, ...(s.items ?? [])])
    .filter((v): v is string => Boolean(v))
    .join(" ");
  const nbMots = texte.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(nbMots / MOTS_PAR_MINUTE));
}

// Filtrage par plage de code point plutôt qu'une regex de marques
// combinantes (0x0300-0x036f, bloc Unicode "Combining Diacritical Marks")
// — évite tout caractère spécial ambigu dans le code source.
function normalise(value: string): string {
  const decomposed = value.toLowerCase().normalize("NFD");
  let out = "";
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    out += ch;
  }
  return out;
}

/** Recherche par sous-chaîne, côté serveur (pas de service tiers, §4). */
export function searchArticles(query: string): Article[] {
  const q = normalise(query.trim());
  if (!q) return [];
  return getPublishedArticles().filter(a => {
    const haystack = normalise(
      [a.titre, a.resume, ...(a.motsClefs ?? [])].join(" ")
    );
    return haystack.includes(q);
  });
}
