"use client";

import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";

const SECTIONS = [
  {
    id: "preambule",
    numero: "1",
    titre: "Préambule et champ d'application",
    contenu: `Les présentes Conditions Générales Prestataires (ci-après "CGP") constituent un accord contractuel juridiquement contraignant entre Sempya224, opérateur de la plateforme Yelen224, et toute entité — institution publique, établissement privé, entreprise, organisation ou professionnel — souhaitant proposer ses services via la plateforme Yelen224 (ci-après "le Prestataire").

Yelen224 est la plateforme officielle de prise de rendez-vous de la République de Guinée, conçue pour connecter les citoyens guinéens — en Guinée et dans 54 pays de la diaspora — aux institutions de l'État, aux services publics, aux entreprises et aux professionnels.

Les présentes CGP s'appliquent à toute entité ayant soumis une demande d'inscription professionnelle sur la plateforme, indépendamment de sa nature juridique, de sa taille ou de son secteur d'activité. Elles complètent et prévalent, en cas de contradiction, sur les Conditions Générales d'Utilisation (CGU) de la plateforme.

En soumettant une demande d'inscription professionnelle sur Yelen224, le Prestataire reconnaît avoir lu, compris et accepté sans réserve l'intégralité des présentes CGP, ainsi que les CGU et la Politique de Confidentialité de la plateforme.

Sempya224 se réserve le droit de modifier les présentes CGP à tout moment avec un préavis de 30 jours. Les modifications sont notifiées par email à l'adresse enregistrée du Prestataire. La poursuite de l'utilisation de la plateforme après ce délai vaut acceptation des nouvelles conditions.`,
  },
  {
    id: "eligibilite",
    numero: "2",
    titre: "Éligibilité et types de prestataires",
    contenu: `2.1 Entités éligibles

Sont éligibles à l'inscription sur la plateforme Yelen224 en tant que Prestataire :

Institutions publiques et para-publiques :
• Ministères et directions centrales de la République de Guinée
• Hôpitaux nationaux, régionaux et préfectoraux
• Mairies, préfectures et sous-préfectures
• Tribunaux et juridictions officielles
• Ambassades et représentations consulaires guinéennes
• Établissements d'enseignement publics (universités, lycées, écoles)
• Agences et établissements publics de toute nature

Entreprises et institutions privées :
• Établissements de santé privés (cliniques, cabinets médicaux, laboratoires)
• Établissements d'enseignement privés agréés
• Banques, établissements de microfinance et institutions financières
• Compagnies d'assurance agréées
• Cabinets juridiques (avocats, notaires, huissiers)
• Entreprises de transport et de logistique
• Organisations non gouvernementales (ONG) et associations reconnues
• Entreprises commerciales de toute taille souhaitant proposer des services avec RDV

Professionnels indépendants :
• Médecins, infirmiers, sages-femmes et professionnels de santé en exercice libéral
• Experts-comptables, conseillers fiscaux et financiers
• Consultants et formateurs certifiés
• Tout professionnel réglementé disposant des autorisations requises

2.2 Conditions d'éligibilité minimales

Pour être éligible, tout Prestataire doit :
• Exercer une activité légale et régulièrement autorisée dans son pays d'établissement
• Disposer des licences, agréments et autorisations professionnelles requises
• Être en mesure de fournir les documents justificatifs demandés lors de la vérification
• Accepter les présentes CGP dans leur intégralité
• Disposer d'un numéro de téléphone et d'une adresse email valides et actifs`,
  },
  {
    id: "inscription",
    numero: "3",
    titre: "Processus d'inscription et vérification",
    contenu: `3.1 Procédure d'inscription

L'inscription d'un Prestataire sur la plateforme Yelen224 suit le processus suivant :

Étape 1 — Soumission du dossier
Le Prestataire accède au formulaire d'inscription via la section "Space Pro" de la plateforme et renseigne :
• Dénomination officielle de l'entité ou nom professionnel
• Catégorie d'activité et type de services proposés
• Adresse complète du siège ou lieu d'exercice principal
• Coordonnées (téléphone, email, site web éventuel)
• Description détaillée des services proposés
• Horaires d'ouverture et capacité d'accueil

Étape 2 — Fourniture des documents justificatifs
Selon la nature du Prestataire, les documents suivants peuvent être requis :

Pour les institutions publiques :
• Acte officiel de création ou d'autorisation
• Référence au Journal Officiel de la République de Guinée si applicable
• Coordonnées du responsable désigné

Pour les entreprises privées :
• Registre du Commerce et du Crédit Mobilier (RCCM) ou équivalent
• Numéro d'identification fiscale
• Agréments professionnels sectoriels (santé, finance, éducation, etc.)
• Pièce d'identité du représentant légal

Pour les professionnels indépendants :
• Diplômes et certifications professionnelles
• Numéro d'inscription à l'ordre professionnel compétent si applicable
• Pièce d'identité en cours de validité

Étape 3 — Instruction du dossier
L'équipe Yelen224 instruit le dossier dans un délai de 48 à 72 heures ouvrées. Durant cette période, l'équipe peut solliciter des documents complémentaires.

Étape 4 — Validation et activation
En cas de validation, le profil Prestataire est activé et rendu visible sur la plateforme. Le Prestataire reçoit une notification de confirmation et peut immédiatement configurer ses disponibilités.

3.2 Motifs de refus

Yelen224 se réserve le droit de refuser toute demande d'inscription sans avoir à se justifier, notamment en cas de :
• Documents incomplets, invalides ou suspects
• Activité illégale ou non réglementaire
• Antécédents de comportements abusifs sur d'autres plateformes
• Non-conformité aux valeurs et standards de la plateforme`,
  },
  {
    id: "obligations",
    numero: "4",
    titre: "Obligations du prestataire",
    contenu: `4.1 Obligations générales

Le Prestataire s'engage à :

Exactitude de l'information :
• Fournir et maintenir à jour des informations exactes, complètes et véridiques sur son profil
• Mettre à jour immédiatement toute modification substantielle (adresse, horaires, services, contacts)
• Signaler sans délai à Yelen224 tout changement de statut juridique, de licence ou d'agrément
• Ne pas induire les citoyens en erreur sur la nature, la portée ou la qualité de ses services

Respect des engagements de rendez-vous :
• Honorer tous les rendez-vous confirmés via la plateforme
• Informer les citoyens concernés en cas d'empêchement ou d'annulation, dans les meilleurs délais
• Proposer systématiquement une solution alternative (report, redirection) en cas d'annulation
• Maintenir un taux d'annulation inférieur à 10% des rendez-vous confirmés

Qualité de service :
• Maintenir les standards de qualité correspondant à sa catégorie professionnelle
• Traiter tous les citoyens avec respect, équité et professionnalisme
• Ne pratiquer aucune discrimination fondée sur l'origine, le sexe, la religion ou tout autre critère
• Respecter les règles déontologiques propres à sa profession

Gestion des données citoyens :
• Traiter les données personnelles des citoyens reçues via la plateforme conformément à la réglementation applicable
• Ne pas utiliser ces données à des fins autres que la réalisation du rendez-vous
• Ne pas revendre ou partager les données citoyens avec des tiers non autorisés
• Assurer la confidentialité des échanges avec les citoyens

4.2 Obligations de disponibilité

Le Prestataire s'engage à :
• Maintenir ses disponibilités à jour sur la plateforme en temps réel
• Bloquer les créneaux indisponibles (congés, fermetures) suffisamment à l'avance
• Répondre aux demandes de rendez-vous dans un délai maximum de 24 heures ouvrées
• Informer Yelen224 de toute fermeture exceptionnelle durable (plus de 5 jours ouvrés)

4.3 Obligations de communication

Le Prestataire s'engage à :
• Utiliser un langage professionnel, respectueux et approprié dans toutes ses communications
• Répondre aux avis citoyens publiés sur son profil de manière constructive et professionnelle
• Ne pas solliciter frauduleusement des avis positifs ou tenter de supprimer des avis négatifs légitimes
• Communiquer via la plateforme de manière transparente et honnête`,
  },
  {
    id: "tarification",
    numero: "5",
    titre: "Tarification et abonnements",
    contenu: `5.1 Modèle tarifaire

Yelen224 propose aux Prestataires deux formules d'abonnement professionnels, conçues pour répondre aux besoins de toutes les structures, des petits cabinets aux grandes institutions :

⭐ PLAN PRO — 7 USD par mois
Période d'essai gratuit : 2 mois complets, sans engagement, sans carte bancaire

Fonctionnalités incluses :
• Profil Prestataire complet et personnalisable (description, logo, photos, services)
• Gestion des disponibilités et créneaux horaires en temps réel
• Système de notifications automatiques SMS et email vers les citoyens
• Badge officiel "Prestataire Vérifié" Yelen224
• Tableau de bord de gestion des rendez-vous
• Statistiques de base (nombre de RDV, vues profil, taux de confirmation)
• Support client prioritaire (réponse sous 24 heures ouvrées)
• Visibilité dans les résultats de recherche de la plateforme
• Accès à la fonctionnalité QR Code personnalisé

👑 PLAN PREMIUM — 15 USD par mois
Période d'essai gratuit : 3 mois complets, sans engagement, sans carte bancaire

Toutes les fonctionnalités du Plan Pro, enrichies de :
• Position prioritaire et mise en avant dans les résultats de recherche
• Module d'annonces et de communications officielles vers les patients/clients
• Statistiques avancées et rapports détaillés exportables (PDF, Excel)
• Intégration complète avec le réseau des ambassades et consulats guinéens
• Support dédié 24 heures sur 24, 7 jours sur 7
• Accès à l'API Yelen224 pour intégrations techniques personnalisées
• Gestion multi-utilisateurs (jusqu'à 10 comptes staff avec rôles différenciés)
• Page profil premium avec bannière personnalisée et mise en page enrichie
• Accès anticipé aux nouvelles fonctionnalités de la plateforme

5.2 Tarification annuelle

Les Prestataires optant pour une facturation annuelle bénéficient de 2 mois offerts, soit :
• Plan Pro annuel : 70 USD/an (au lieu de 84 USD)
• Plan Premium annuel : 150 USD/an (au lieu de 180 USD)

5.3 Tarification institutionnelle spéciale

Pour les grandes institutions publiques (ministères, hôpitaux nationaux, universités d'État, ambassades), Yelen224 propose des tarifications institutionnelles négociées. Veuillez contacter notre équipe commerciale à contact@yelen224.com pour un devis personnalisé.

5.4 Essais gratuits

Les périodes d'essai sont accordées dans les conditions suivantes :
• Aucune carte bancaire requise lors de l'inscription à l'essai
• Accès complet à toutes les fonctionnalités du plan souscrit pendant la durée de l'essai
• Notification par email 7 jours avant la fin de la période d'essai
• À l'issue de l'essai, aucun prélèvement automatique sans accord explicite du Prestataire
• Un seul essai par entité juridique — les tentatives de cumul d'essais sont détectées et bloquées`,
  },
  {
    id: "paiement",
    numero: "6",
    titre: "Paiement et facturation",
    contenu: `6.1 Modalités de paiement

Les abonnements Yelen224 peuvent être réglés par les moyens suivants :

Moyens de paiement acceptés :
• Carte bancaire internationale (Visa, Mastercard) — via notre prestataire de paiement sécurisé
• Mobile Money (Orange Money Guinée, MTN Mobile Money Guinée)
• Virement bancaire — réservé aux institutions publiques et grandes entreprises (sur demande)
• PayPal — disponible pour les Prestataires de la diaspora et à l'international

6.2 Cycle de facturation

• La facturation est mensuelle ou annuelle selon le choix du Prestataire
• La facturation débute à l'issue de la période d'essai gratuit
• Une facture officielle est émise et envoyée automatiquement par email à chaque renouvellement
• Les factures sont libellées en USD et incluent le détail des services souscrits

6.3 Défaut de paiement

En cas de non-paiement à l'échéance :
• Yelen224 adresse un rappel automatique par email dans les 3 jours suivant l'échéance
• Un délai de grâce de 7 jours est accordé avant toute suspension
• À l'issue du délai de grâce, le profil est suspendu (invisible des citoyens) mais non supprimé
• La régularisation du paiement entraîne la réactivation immédiate du profil
• Au-delà de 30 jours sans régularisation, le compte peut être définitivement clôturé

6.4 Politique de remboursement

• Les sommes versées ne font l'objet d'aucun remboursement pour la période d'abonnement en cours
• En cas de défaillance technique majeure imputable à Yelen224 ayant empêché l'accès aux services pendant plus de 72 heures consécutives, un avoir ou un remboursement proratisé peut être accordé sur demande
• Toute demande de remboursement doit être adressée à contact@yelen224.com dans un délai de 30 jours suivant le fait générateur`,
  },
  {
    id: "propriete",
    numero: "7",
    titre: "Propriété intellectuelle et contenu",
    contenu: `7.1 Contenu publié par le Prestataire

Le Prestataire conserve la pleine propriété de l'ensemble des contenus qu'il publie sur son profil Yelen224 (textes, logos, images, descriptions de services, etc.).

En publiant ces contenus sur la plateforme, le Prestataire accorde à Yelen224 une licence non exclusive, mondiale, gratuite et pour la durée de l'abonnement pour :
• Afficher le contenu sur la plateforme Yelen224 et ses interfaces associées
• Reproduire le contenu à des fins de mise en cache et d'optimisation technique
• Utiliser le nom et le logo du Prestataire dans les résultats de recherche et les communications de la plateforme

Le Prestataire garantit que les contenus publiés sont libres de droits ou qu'il dispose des autorisations nécessaires pour leur utilisation, et s'engage à indemniser Yelen224 contre tout recours de tiers relatif à ces contenus.

7.2 Propriété de la plateforme

Le Prestataire reconnaît que l'ensemble des éléments de la plateforme Yelen224 (interface, algorithmes, base de données, code source, marques) sont la propriété exclusive de Sempya224 et ne peut en faire usage à des fins autres que celles prévues par les présentes CGP.

7.3 Données générées

Les données agrégées et anonymisées générées par l'activité du Prestataire sur la plateforme (statistiques d'utilisation, tendances) peuvent être utilisées par Yelen224 à des fins d'amélioration de la plateforme et d'établissement de rapports sectoriels, sans que cela ne porte atteinte aux droits du Prestataire.`,
  },
  {
    id: "confidentialite",
    numero: "8",
    titre: "Confidentialité et protection des données",
    contenu: `8.1 Données des citoyens

Dans le cadre de l'utilisation de la plateforme, le Prestataire est amené à recevoir des données personnelles de citoyens (nom, prénom, numéro de téléphone, motif du rendez-vous). Le Prestataire s'engage à :

• Traiter ces données exclusivement dans le cadre de la réalisation du rendez-vous concerné
• Ne pas conserver ces données au-delà de la durée nécessaire à la prestation de service
• Ne pas partager ces données avec des tiers non autorisés
• Mettre en œuvre des mesures de sécurité appropriées pour protéger ces données
• Respecter les droits des citoyens sur leurs données (accès, rectification, effacement)
• Signaler immédiatement à Yelen224 tout incident de sécurité affectant des données citoyens

8.2 Données du Prestataire

Yelen224 traite les données du Prestataire conformément à sa Politique de Confidentialité. Les données professionnelles du Prestataire sont utilisées pour :
• La gestion de son compte et de son abonnement
• L'affichage de son profil sur la plateforme
• L'émission des factures et la gestion des paiements
• La communication relative aux services Yelen224

8.3 Sécurité

Le Prestataire s'engage à maintenir la confidentialité de ses identifiants de connexion à la plateforme et à ne pas les partager, à l'exception des membres de son personnel autorisés dans le cadre du plan multi-utilisateurs.`,
  },
  {
    id: "responsabilite",
    numero: "9",
    titre: "Responsabilité et garanties",
    contenu: `9.1 Responsabilité du Prestataire

Le Prestataire est seul et entièrement responsable de :
• La qualité et la conformité des services proposés via la plateforme
• L'exactitude et l'actualité des informations publiées sur son profil
• Le respect de ses engagements envers les citoyens ayant réservé un rendez-vous
• Le respect des réglementations professionnelles, sanitaires, fiscales et légales qui lui sont applicables
• Tout dommage causé à un citoyen ou à un tiers dans le cadre de ses services
• Les litiges opposant le Prestataire à des citoyens relatifs à des prestations effectuées via la plateforme

Le Prestataire s'engage à indemniser Yelen224 contre tout recours, plainte, condamnation ou frais (y compris les honoraires d'avocats) résultant d'un manquement du Prestataire à ses obligations.

9.2 Responsabilité de Yelen224

Yelen224 agit exclusivement en qualité d'intermédiaire technique et ne peut être tenue responsable de :
• La qualité des services fournis par les Prestataires
• Le non-respect par un Prestataire de ses engagements envers les citoyens
• Les litiges entre Prestataires et citoyens
• Les interruptions de service dues à des événements de force majeure

Yelen224 garantit la disponibilité de la plateforme avec un objectif de 99,5% de disponibilité mensuelle, hors maintenances programmées notifiées à l'avance.

9.3 Limitation de responsabilité

La responsabilité de Yelen224 envers un Prestataire, pour quelque cause que ce soit, est limitée au montant des sommes versées par le Prestataire au cours des 3 derniers mois précédant le fait générateur du dommage.`,
  },
  {
    id: "suspension",
    numero: "10",
    titre: "Suspension et résiliation",
    contenu: `10.1 Suspension temporaire

Yelen224 se réserve le droit de suspendre temporairement l'accès d'un Prestataire à la plateforme dans les cas suivants :

Suspension immédiate et sans préavis :
• Comportement gravement préjudiciable aux citoyens (fraude, maltraitance, abus)
• Violation grave des présentes CGP ou des CGU
• Activité illégale détectée ou signalée
• Suspicion de compromission du compte (sécurité)
• Signalements multiples et fondés de citoyens

Suspension avec préavis de 72 heures :
• Taux d'annulation de rendez-vous supérieur à 10% sur un mois
• Informations de profil manifestement erronées ou trompeuses
• Non-renouvellement d'une licence ou d'un agrément professionnel requis
• Défaut de paiement après délai de grâce

10.2 Résiliation à l'initiative du Prestataire

Le Prestataire peut résilier son abonnement à tout moment depuis son tableau de bord. La résiliation prend effet à la fin de la période d'abonnement en cours. Aucun remboursement n'est effectué pour la période restante.

10.3 Résiliation à l'initiative de Yelen224

Yelen224 peut résilier définitivement le compte d'un Prestataire avec un préavis de 30 jours dans les cas suivants :
• Violations répétées des CGP malgré mise en demeure
• Comportement systématiquement préjudiciable à l'image de la plateforme
• Cessation d'activité du Prestataire
• Décision stratégique de Yelen224 (avec remboursement proratisé des sommes versées)

En cas de résiliation, les données du Prestataire sont conservées 90 jours avant suppression définitive.

10.4 Conséquences de la résiliation

À la résiliation du compte :
• Le profil devient invisible des citoyens immédiatement
• Les rendez-vous confirmés antérieurs à la résiliation doivent être honorés
• Les données du Prestataire sont conservées 90 jours puis supprimées
• Le Prestataire peut demander l'export de ses données dans ce délai`,
  },
  {
    id: "litiges",
    numero: "11",
    titre: "Médiation et résolution des litiges",
    contenu: `11.1 Engagement de Yelen224

Yelen224 s'engage à traiter tout litige avec sérieux, équité et dans les meilleurs délais. Notre équipe est disponible pour accompagner les Prestataires dans la résolution de tout différend, qu'il implique des citoyens ou la plateforme elle-même.

11.2 Procédure de médiation interne

En cas de litige entre un Prestataire et un citoyen signalé via la plateforme, Yelen224 peut intervenir en qualité de médiateur selon la procédure suivante :

1. Réception du signalement par l'équipe Yelen224
2. Notification des deux parties dans les 48 heures
3. Collecte des éléments de chaque partie (délai de 5 jours ouvrés)
4. Proposition de médiation par l'équipe Yelen224 (délai de 7 jours ouvrés)
5. Décision de médiation communiquée aux deux parties

Yelen224 se réserve le droit de prendre des mesures sur le profil du Prestataire (avertissement, suspension) si la médiation révèle un manquement à ses obligations.

11.3 Résolution amiable des litiges avec Yelen224

Tout litige entre un Prestataire et Yelen224 doit en premier lieu faire l'objet d'une tentative de résolution amiable par :
• Email à contact@yelen224.com avec l'objet [LITIGE PRESTATAIRE]
• Appel téléphonique : +224 624 35 46 00 ou +1 347 301 6768

Yelen224 s'engage à répondre à toute réclamation sous 5 jours ouvrés et à proposer une solution dans les 30 jours.

11.4 Juridiction compétente

À défaut de résolution amiable dans un délai de 30 jours, tout litige sera soumis à la compétence des tribunaux compétents de Conakry, République de Guinée, ou de New York, États-Unis, selon la localisation du Prestataire. Le droit applicable est celui de la République de Guinée, complété par le droit de l'État de New York.`,
  },
  {
    id: "contact",
    numero: "12",
    titre: "Contact et informations",
    contenu: `Pour toute question relative aux présentes CGP, à votre abonnement ou à votre partenariat avec Yelen224 :

Équipe commerciale et partenariats :
✉️ contact@yelen224.com
Objet : [PARTENARIAT PRESTATAIRE]

Support technique :
✉️ contact@yelen224.com
Objet : [SUPPORT TECHNIQUE]

Questions juridiques et conformité :
✉️ contact@yelen224.com
Objet : [JURIDIQUE / CGP]

Siège New York (Bronx) :
📍 1895 Morris Avenue, 5ème étage, NY 10345
📞 +1 347 301 6768

Représentation Conakry (Guinée) :
📍 Cimenterie, Commune de Ratoma, 3ème étage
📞 +224 624 35 46 00

Horaires de disponibilité :
Lundi – Vendredi : 8h00 – 18h00 (GMT)
Réponse garantie sous 48 heures ouvrées

Date de dernière mise à jour : Mars 2025
Version en vigueur : 1.0`,
  },
];

export default function ConditionsPrestatairesPage() {
  const { theme } = useTheme();
  const C = T[theme];
  const [activeSection, setActiveSection] = useState("preambule");

  const currentSection = SECTIONS.find(s => s.id === activeSection)!;
  const currentIndex = SECTIONS.findIndex(s => s.id === activeSection);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", transition: "background-color 0.3s ease, color 0.3s ease" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        .nav-item:hover { background-color: rgba(245,166,35,0.06) !important; color: #F5A623 !important; }
      `}</style>

      {/* HEADER */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        backgroundColor: theme === "dark" ? "rgba(8,8,18,0.96)" : "rgba(248,248,251,0.96)",
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${C.borderCard}`,
        paddingTop: "env(safe-area-inset-top)", paddingRight: "40px", paddingBottom: 0, paddingLeft: "40px",
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{ position: "relative", width: "34px", height: "34px" }}>
              <div style={{ position: "absolute", inset: 0, backgroundColor: "#F5A623", borderRadius: "9px", transform: "rotate(6deg)", opacity: 0.3 }} />
              <div style={{ position: "relative", width: "34px", height: "34px", backgroundColor: "#F5A623", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3" strokeLinecap="round">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
                </svg>
              </div>
            </div>
            <div>
              <p style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: 0, letterSpacing: "0.5px", lineHeight: 1 }}>YELEN224</p>
              <p style={{ color: "#F5A623", fontSize: "8px", margin: 0, letterSpacing: "2px", fontWeight: "600" }}>REPUBLIQUE DE GUINEE</p>
            </div>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <Link href="/cgu" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>CGU</Link>
            <Link href="/confidentialite" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>Confidentialité</Link>
            <Link href="/mentions-legales" style={{ color: C.textSubtle, fontSize: "13px", textDecoration: "none" }}>Mentions légales</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={{
        padding: "56px 40px 40px",
        background: theme === "dark" ? "linear-gradient(160deg, #080812 0%, #0d0d1f 60%, #080812 100%)" : "linear-gradient(160deg, #f8f8fb 0%, #f0f0fa 60%, #f8f8fb 100%)",
        borderBottom: `1px solid ${C.borderSubtle}`,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-80px", right: "-80px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(245,166,35,0.06) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "20px", padding: "5px 14px", marginBottom: "16px" }}>
            <span style={{ fontSize: "12px" }}>🤝</span>
            <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700", letterSpacing: "1.5px" }}>ACCORD CONTRACTUEL OFFICIEL — YELEN224</span>
          </div>
          <h1 style={{ color: C.text, fontSize: "clamp(26px, 4vw, 42px)", fontWeight: "900", letterSpacing: "-1px", margin: "0 0 12px", lineHeight: 1.05 }}>
            Conditions Générales<br />
            <span style={{ color: "#F5A623" }}>Prestataires & Institutions</span>
          </h1>
          <p style={{ color: C.textMuted, fontSize: "15px", maxWidth: "600px", margin: "0 0 20px", lineHeight: 1.75 }}>
            Document contractuel régissant les droits et obligations des institutions, entreprises et professionnels proposant leurs services via la plateforme Yelen224.
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {[
              { label: "🏛️ Institutions publiques", color: "#F5A623" },
              { label: "🏥 Établissements de santé", color: "#F5A623" },
              { label: "🏦 Banques & Finance", color: "#F5A623" },
              { label: "🎓 Éducation", color: "#F5A623" },
              { label: "⚖️ Cabinets juridiques", color: "#F5A623" },
            ].map(tag => (
              <span key={tag.label} style={{ backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", color: tag.color, fontSize: "11px", fontWeight: "600", padding: "4px 12px", borderRadius: "20px" }}>
                {tag.label}
              </span>
            ))}
          </div>
          <div style={{ marginTop: "20px", padding: "14px 18px", borderRadius: "10px", backgroundColor: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.15)", display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <p style={{ color: C.textMuted, fontSize: "13px", margin: 0, lineHeight: 1.5 }}>
              En soumettant votre demande d'inscription professionnelle sur Yelen224, vous acceptez sans réserve les présentes conditions. Version 1.0 — Mars 2025.
            </p>
          </div>
        </div>
      </section>

      {/* CORPS */}
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 40px 80px", display: "grid", gridTemplateColumns: "260px 1fr", gap: "32px", alignItems: "start" }}>

        {/* Sommaire sticky */}
        <nav style={{ position: "sticky", top: "80px", backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px" }}>
          <p style={{ color: C.textSubtle, fontSize: "10px", fontWeight: "700", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 12px 8px" }}>Sommaire</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className="nav-item"
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 12px", borderRadius: "8px",
                  border: "none", cursor: "pointer", textAlign: "left",
                  backgroundColor: activeSection === s.id ? "rgba(245,166,35,0.08)" : "transparent",
                  color: activeSection === s.id ? "#F5A623" : C.textSubtle,
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{
                  width: "20px", height: "20px", borderRadius: "6px", flexShrink: 0,
                  backgroundColor: activeSection === s.id ? "rgba(245,166,35,0.15)" : C.borderSubtle,
                  color: activeSection === s.id ? "#F5A623" : C.textFaint,
                  fontSize: "10px", fontWeight: "800",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{s.numero}</span>
                <span style={{ fontSize: "12px", fontWeight: activeSection === s.id ? "700" : "500", lineHeight: 1.3 }}>{s.titre}</span>
              </button>
            ))}
          </div>

          {/* CTA inscription */}
          <div style={{ marginTop: "16px", padding: "14px", borderRadius: "10px", backgroundColor: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)" }}>
            <p style={{ color: C.text, fontSize: "12px", fontWeight: "700", margin: "0 0 4px" }}>Prêt à rejoindre ?</p>
            <p style={{ color: C.textSubtle, fontSize: "11px", margin: "0 0 10px", lineHeight: 1.5 }}>2 mois d'essai gratuit — sans carte bancaire</p>
            <Link href="/institution/inscription" style={{
              display: "block", textAlign: "center",
              backgroundColor: "#F5A623", color: "#080812",
              fontWeight: "700", fontSize: "12px",
              padding: "9px", borderRadius: "8px", textDecoration: "none",
            }}>
              Inscrire mon institution →
            </Link>
          </div>
        </nav>

        {/* Contenu article */}
        <div>
          {/* Barre progression */}
          <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, height: "4px", borderRadius: "2px", backgroundColor: C.borderSubtle, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "2px", backgroundColor: "#F5A623", width: `${((currentIndex + 1) / SECTIONS.length) * 100}%`, transition: "width 0.3s ease" }} />
            </div>
            <span style={{ color: C.textFaint, fontSize: "11px", fontWeight: "600", flexShrink: 0 }}>
              Article {currentIndex + 1} / {SECTIONS.length}
            </span>
          </div>

          <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "16px", padding: "36px", marginBottom: "16px" }}>
            {/* En-tête article */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px", paddingBottom: "20px", borderBottom: `1px solid ${C.borderSubtle}` }}>
              <div style={{
                width: "48px", height: "48px", borderRadius: "12px", flexShrink: 0,
                backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#F5A623", fontSize: "20px", fontWeight: "900",
              }}>{currentSection.numero}</div>
              <div>
                <p style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700", letterSpacing: "2px", margin: "0 0 4px" }}>ARTICLE {currentSection.numero}</p>
                <h2 style={{ color: C.text, fontSize: "22px", fontWeight: "900", margin: 0, letterSpacing: "-0.5px" }}>
                  {currentSection.titre}
                </h2>
              </div>
            </div>

            {/* Corps */}
            <div style={{ color: C.textMuted, fontSize: "14px", lineHeight: 1.95, whiteSpace: "pre-line" }}>
              {currentSection.contenu}
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "space-between", marginBottom: "16px" }}>
            <button
              onClick={() => { if (currentIndex > 0) setActiveSection(SECTIONS[currentIndex - 1].id); }}
              disabled={currentIndex === 0}
              style={{
                padding: "10px 20px", borderRadius: "10px",
                border: `1px solid ${C.borderCard}`,
                backgroundColor: "transparent",
                color: currentIndex === 0 ? C.textFaint : C.text,
                fontSize: "13px", fontWeight: "600",
                cursor: currentIndex === 0 ? "default" : "pointer",
                opacity: currentIndex === 0 ? 0.4 : 1,
              }}
            >← Article précédent</button>

            <button
              onClick={() => { if (currentIndex < SECTIONS.length - 1) setActiveSection(SECTIONS[currentIndex + 1].id); }}
              disabled={currentIndex === SECTIONS.length - 1}
              style={{
                padding: "10px 20px", borderRadius: "10px",
                border: "1px solid rgba(245,166,35,0.3)",
                backgroundColor: "rgba(245,166,35,0.06)",
                color: currentIndex === SECTIONS.length - 1 ? C.textFaint : "#F5A623",
                fontSize: "13px", fontWeight: "700",
                cursor: currentIndex === SECTIONS.length - 1 ? "default" : "pointer",
                opacity: currentIndex === SECTIONS.length - 1 ? 0.4 : 1,
              }}
            >Article suivant →</button>
          </div>

          {/* CTA inscription bas */}
          <div style={{ padding: "24px 28px", borderRadius: "14px", background: theme === "dark" ? "linear-gradient(135deg, #0D0D1A 0%, #131325 100%)" : "linear-gradient(135deg, #f8f8fb 0%, #f0f0fa 100%)", border: "1px solid rgba(245,166,35,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <p style={{ color: C.text, fontSize: "15px", fontWeight: "800", margin: "0 0 6px" }}>
                Votre institution est prête à rejoindre Yelen224 ?
              </p>
              <p style={{ color: C.textSubtle, fontSize: "13px", margin: 0 }}>
                Plan Pro (2 mois gratuits) ou Premium (3 mois gratuits) — sans engagement, sans carte bancaire.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
              <Link href="/contact" style={{ backgroundColor: "transparent", border: "1px solid rgba(245,166,35,0.3)", color: "#F5A623", fontWeight: "600", fontSize: "13px", padding: "11px 20px", borderRadius: "9px", textDecoration: "none" }}>
                Nous contacter
              </Link>
              <Link href="/institution/inscription" style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px", padding: "11px 20px", borderRadius: "9px", textDecoration: "none" }}>
                Démarrer l'essai gratuit →
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ backgroundColor: C.footerBg, borderTop: `1px solid ${C.border}`, padding: "28px 40px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <p style={{ color: C.textFaint, fontSize: "12px", margin: 0 }}>© {new Date().getFullYear()} YELEN224 — Sempya224. Tous droits réservés.</p>
          <div style={{ display: "flex", gap: "20px" }}>
            <Link href="/cgu" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>CGU</Link>
            <Link href="/confidentialite" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Confidentialité</Link>
            <Link href="/mentions-legales" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Mentions légales</Link>
            <Link href="/contact" style={{ color: C.textFaint, fontSize: "12px", textDecoration: "none" }}>Contact</Link>
            <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ color: "#F5A623", fontSize: "12px", textDecoration: "none", fontWeight: "700" }}>Sempya224</a>
          </div>
        </div>
      </footer>
    </div>
  );
}