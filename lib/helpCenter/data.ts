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
        contenu: "En haut de l'écran, une carte affiche votre score et son niveau (Platinum, Gold, Silver ou Danger). En dessous, un graphique montre son évolution sur les 30 derniers jours. Viennent ensuite le détail des avis du mois (positifs, négatifs, sans commentaire, et répartition par nombre d'étoiles), la note moyenne par service si vous en proposez plusieurs, des recommandations automatiques, quelques citations de citoyens mises en avant, puis la liste complète de vos avis avec recherche et filtres.",
      },
      {
        type: "screenshot",
        screenshot: {
          ecran: "Avis & Réputation",
          zone: "Vue d'ensemble",
          montrer: [
            "la carte de score avec son niveau (Platinum / Gold / Silver / Danger)",
            "le graphique d'évolution sur 30 jours",
            "la répartition des avis du mois par note",
          ],
        },
      },
      {
        type: "list",
        titre: "Ce que vous pouvez faire depuis cet écran",
        items: [
          "Suivre l'évolution de votre score et de votre note moyenne dans le temps.",
          "Répondre publiquement à un avis, en particulier un avis négatif.",
          "Rechercher un avis précis et filtrer par type (positif, négatif, sans réponse, avec réponse) ou par service concerné.",
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
            "le champ de rédaction de la réponse",
            "les boutons Envoyer / Annuler",
            "un avis avec une réponse déjà publiée, pour comparaison",
          ],
        },
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
        contenu: "Le score est calculé sur vos 30 derniers avis évaluables, pas sur l'année entière : un très ancien avis sort progressivement du calcul à mesure que de nouveaux avis arrivent. Les avis masqués ou en brouillon n'entrent jamais dans ce calcul.\n\nUne fois une réponse envoyée, elle s'affiche publiquement sous l'avis et ne peut plus être modifiée depuis cet écran — relisez-la avant d'envoyer.\n\nEn vue lecture seule (selon votre rôle), vous pouvez consulter l'intégralité de l'écran mais le bouton Répondre n'apparaît pas.",
      },
      {
        type: "info",
        titre: "En cas de problème",
        contenu: "Aucun score ne s'affiche : vérifiez le nombre d'avis publiés indiqué à l'écran — 3 avis publiés sont nécessaires avant qu'un score apparaisse.\n\nUn avis que vous savez exister n'apparaît pas dans la liste : vérifiez vos filtres actifs (type, service, recherche texte) — un avis masqué ou encore en brouillon ne remonte jamais ici.",
      },
    ],
    sourceCode: ["lib/reputationScore.ts", "app/[slug]/[id]/components/AvisReputationTab.tsx", "app/api/institution/avis-reputation/status/route.ts", "app/api/institution/avis-reputation/liste/route.ts", "app/api/institution/avis/repondre/route.ts"],
    derniereVerification: "2026-09-24",
    motsClefs: ["réputation", "score", "avis", "santé du compte", "platinum", "gold", "silver", "danger", "répondre à un avis", "avis négatif", "filtrer avis"],
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
          "Choisissez un format : CSV, Excel (.xlsx), JSON, PDF, ou Rapport signé (cachet et empreinte).",
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
