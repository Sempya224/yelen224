// Contenu de "Leçons d'argent" (app/menu/lecons-argent) — chantier
// engagement du 25/07/2026. Toutes les données ci-dessous viennent de
// recherches Perplexity commandées par Bryan le 25/07/2026 (Banque
// mondiale, BCRG, Guinéenews, RFI, etc.) — zéro chiffre inventé. Chaque
// leçon référence sa source réelle, affichée dans le quiz comme
// "consumerfinance.gov" l'est dans l'app de référence. Catégories
// reformulées pour la réalité financière guinéenne (mobile money,
// tontines, microfinance) plutôt que calquées sur le modèle américain
// (credit score / carte de crédit sécurisée) qui ne s'applique pas ici.

export type LeconCategorieId = "epargne" | "mobile_money" | "credit" | "revenus" | "budget" | "fraudes";

export const CATEGORIES: { id: LeconCategorieId; label: string }[] = [
  { id: "epargne",      label: "Épargne & tontines" },
  { id: "mobile_money",  label: "Mobile money" },
  { id: "credit",        label: "Microfinance & crédit" },
  { id: "revenus",       label: "Revenus & activité" },
  { id: "budget",        label: "Budget" },
  { id: "fraudes",       label: "Fraudes & protection" },
];

export type LeconQuestion = {
  question: string;
  choix: string[];
  reponseCorrecte: number;
  explication: string;
  source: { label: string; url: string };
};

export type Lecon = {
  id: string;
  categorie: LeconCategorieId;
  titre: string;
  resume: string;
  questions: LeconQuestion[];
};

export const LECONS: Lecon[] = [
  {
    id: "tontines",
    categorie: "epargne",
    titre: "Les tontines : comment ça marche vraiment",
    resume: "Le fonctionnement réel d'une tontine, et les risques à connaître avant d'y participer.",
    questions: [
      {
        question: "Comment fonctionne une tontine ?",
        choix: [
          "Un groupe cotise régulièrement et chaque membre reçoit la cagnotte à tour de rôle",
          "Une banque prête de l'argent contre un salaire fixe",
          "Un assureur rembourse en cas de perte de revenu",
          "Un compte bloqué qui verse des intérêts chaque mois",
        ],
        reponseCorrecte: 0,
        explication: "Une tontine repose sur la confiance : le groupe fixe un montant et une fréquence de cotisation, puis chaque membre touche la cagnotte à son tour, sans dossier bancaire.",
        source: { label: "Banque mondiale — Diagnostic de l'inclusion financière en Guinée", url: "https://documents1.worldbank.org/curated/en/577621548998046677/pdf/Guinea-Financial-Inclusion-Diagnostic.pdf" },
      },
      {
        question: "Quel est le principal risque documenté d'une tontine informelle ?",
        choix: [
          "Des frais bancaires élevés",
          "L'absence de contrat et le risque que l'organisateur disparaisse avec les fonds",
          "Un plafond de cotisation fixé par la loi",
          "Une obligation de déclarer ses revenus",
        ],
        reponseCorrecte: 1,
        explication: "Sans contrat ni supervision, une tontine dépend entièrement de la confiance entre membres — la Banque mondiale pointe justement la faiblesse de la protection du consommateur sur ce type d'épargne informelle en Guinée.",
        source: { label: "Banque mondiale — Diagnostic de l'inclusion financière en Guinée", url: "https://documents1.worldbank.org/curated/en/577621548998046677/pdf/Guinea-Financial-Inclusion-Diagnostic.pdf" },
      },
      {
        question: "Pour quelqu'un sans compte bancaire, quelles sont les alternatives formelles à la tontine en Guinée ?",
        choix: [
          "Les institutions de microfinance et la monnaie électronique (mobile money)",
          "Uniquement les grandes banques internationales",
          "Il n'existe aucune alternative formelle",
          "Les bureaux de change de rue",
        ],
        reponseCorrecte: 0,
        explication: "En 2017, la Guinée comptait 25 institutions de microfinance (dont 22 actives) et 3 établissements de monnaie électronique agréés — Orange Money, MTN Money et Paycard.",
        source: { label: "Banque mondiale — Diagnostic de l'inclusion financière en Guinée", url: "https://documents1.worldbank.org/curated/en/577621548998046677/pdf/Guinea-Financial-Inclusion-Diagnostic.pdf" },
      },
    ],
  },
  {
    id: "mobile-money-reflexes",
    categorie: "mobile_money",
    titre: "Mobile money : les bons réflexes",
    resume: "Les frais réels, et les réflexes à avoir pour éviter les arnaques les plus courantes.",
    questions: [
      {
        question: "Chez Orange Money, combien coûte un retrait entre 2 000 et 100 000 GNF (grille rappelée en mars 2026) ?",
        choix: ["1 000 GNF", "5 000 GNF", "1% du montant", "C'est gratuit"],
        reponseCorrecte: 0,
        explication: "La grille tarifaire relayée en janvier 2025 et rappelée par Orange Money en mars 2026 fixe ce retrait à 1 000 GNF ; au-delà, les frais passent en pourcentage (1% puis 0,8% selon les tranches).",
        source: { label: "Guinéenews — Orange Money rappelle la grille tarifaire (mars 2026)", url: "https://guineenews.org/2026/03/11/orange-money-rappelle-le-respect-de-la-grille-tarifaire-pour-les-operations-de-retrait/" },
      },
      {
        question: "Que ne faut-il jamais communiquer, même à quelqu'un qui se présente comme un agent mobile money ?",
        choix: ["Son numéro de téléphone", "Son code PIN", "Son nom complet", "Sa ville"],
        reponseCorrecte: 1,
        explication: "Le code PIN ne doit jamais être partagé — c'est le réflexe de base rappelé face aux arnaques les plus fréquentes (faux agents, phishing par SMS, fraude au retrait).",
        source: { label: "Guinéenews — Orange Money, grille tarifaire et service client", url: "https://guineenews.org/2026/03/11/orange-money-rappelle-le-respect-de-la-grille-tarifaire-pour-les-operations-de-retrait/" },
      },
    ],
  },
  {
    id: "credit-avant-emprunter",
    categorie: "credit",
    titre: "Le crédit en Guinée : avant d'emprunter",
    resume: "Comment fonctionne vraiment l'accès au crédit — et pourquoi \"score de crédit\" ne veut pas dire la même chose ici.",
    questions: [
      {
        question: "En Guinée, existe-t-il un \"score de crédit\" public consultable par un particulier, comme aux États-Unis ?",
        choix: [
          "Oui, chaque citoyen peut le consulter en ligne",
          "Non — aucune preuve d'un tel dispositif public accessible aux particuliers n'a été trouvée ; la BCRG encadre plutôt les établissements de crédit",
          "Oui, mais seulement dans les grandes banques",
          "Non, la Guinée n'a aucune supervision du crédit",
        ],
        reponseCorrecte: 1,
        explication: "Le recueil bancaire et financier de la BCRG impose aux établissements de crédit de transmettre certaines informations à la Banque Centrale (supervision institutionnelle), mais rien n'indique un score individuel public comme dans certains pays.",
        source: { label: "Recueil bancaire et financier de la BCRG (2017)", url: "https://droitguineen.com/lois/code-bcrg-2017-recueil-bancaire-et-financier-bcrg" },
      },
      {
        question: "Quel est l'ordre de grandeur des taux pratiqués par les institutions de microfinance en Guinée ?",
        choix: ["2 à 5% par an", "30 à 36% par an", "100% par an", "0%, c'est réglementé gratuit"],
        reponseCorrecte: 1,
        explication: "Une étude sur la microfinance guinéenne relève des taux de l'ordre de 30 à 36% par an, sur des durées généralement inférieures à 12 mois — une donnée à traiter comme un ordre de grandeur, pas un chiffre officiel à jour.",
        source: { label: "Étude sur la microfinance en Guinée (base.socioeco.org)", url: "https://base.socioeco.org/docs/bah_apha_-_amadou.pdf" },
      },
      {
        question: "Avant de prendre un microcrédit, quelle est la précaution la plus importante ?",
        choix: [
          "Vérifier que l'institution est agréée et réellement en activité",
          "Emprunter le montant maximum proposé",
          "Ne jamais lire les conditions",
          "Emprunter auprès de plusieurs institutions en même temps",
        ],
        reponseCorrecte: 0,
        explication: "La supervision des institutions de microfinance existe en Guinée, mais le cadre de protection du consommateur reste à renforcer — vérifier l'agrément de l'institution est donc la première précaution.",
        source: { label: "Banque mondiale — Diagnostic de l'inclusion financière en Guinée", url: "https://documents1.worldbank.org/curated/en/577621548998046677/pdf/Guinea-Financial-Inclusion-Diagnostic.pdf" },
      },
    ],
  },
  {
    id: "demarrer-activite",
    categorie: "revenus",
    titre: "Démarrer une activité : les bons réflexes",
    resume: "Les conseils qui reviennent le plus souvent chez les structures d'accompagnement guinéennes.",
    questions: [
      {
        question: "Quel conseil revient le plus souvent chez les incubateurs guinéens pour démarrer une activité ?",
        choix: [
          "Investir tout de suite dans un stock important",
          "Commencer petit, tester la demande, calculer le besoin en trésorerie",
          "Emprunter le maximum possible dès le premier mois",
          "Attendre d'avoir un local avant de commencer",
        ],
        reponseCorrecte: 1,
        explication: "Les structures d'accompagnement guinéennes recommandent de commencer petit et de tester la demande avant de surdimensionner le stock ou le matériel.",
        source: { label: "AllAfrica — Guide des incubateurs en Guinée", url: "https://fr.allafrica.com/stories/202511190555.html" },
      },
      {
        question: "Quel organisme public guinéen est cité comme référence pour la formalisation et l'appui aux créateurs d'entreprise ?",
        choix: ["APIP", "La CENI", "Le FMI", "La CEDEAO"],
        reponseCorrecte: 0,
        explication: "L'APIP est citée comme acteur public de référence, aux côtés de programmes comme le FONIJ, le PONEJ et le PEJ.",
        source: { label: "Thèse — Entrepreneuriat en Guinée (HAL)", url: "https://theses.hal.science/tel-04354824v1/file/These-2022-EDGE-Sciences_de_gestion-DIALLO_Mamadou_Saidou.pdf" },
      },
    ],
  },
  {
    id: "budget-revenu-irregulier",
    categorie: "budget",
    titre: "Gérer un revenu irrégulier",
    resume: "Une méthode de budget adaptée à un revenu qui varie d'un mois à l'autre, pas un modèle occidental rigide.",
    questions: [
      {
        question: "Avec un revenu irrégulier, quelle est la meilleure première étape budgétaire ?",
        choix: [
          "Séparer les dépenses essentielles du reste, avant de dépenser le surplus",
          "Dépenser normalement et voir ce qu'il reste en fin de mois",
          "Ne rien épargner tant que le revenu n'est pas stable",
          "Emprunter pour lisser les mois faibles",
        ],
        reponseCorrecte: 0,
        explication: "La méthode des \"deux budgets\" (survie / confortable) consiste à fixer d'abord le minimum vital indispensable, puis à mettre le surplus en réserve pour les mois faibles.",
        source: { label: "No More Debts — Budget à revenu irrégulier", url: "https://nomoredebts.org/blog/budgeting-saving/3-ways-to-create-personal-budget-plan-with-irregular-income" },
      },
      {
        question: "Quel était le taux d'inflation en Guinée en 2025, selon la Banque mondiale ?",
        choix: ["Environ 3,2%", "Environ 15%", "Environ 0%", "Environ 50%"],
        reponseCorrecte: 0,
        explication: "L'inflation est retombée à 3,2% en 2025 (contre 5,1% en 2024), portée notamment par le ralentissement des prix des transports et des denrées alimentaires.",
        source: { label: "Banque mondiale — Guinée", url: "https://www.banquemondiale.org/ext/fr/country/guinea" },
      },
    ],
  },
  {
    id: "reconnaitre-arnaque",
    categorie: "fraudes",
    titre: "Reconnaître une arnaque financière",
    resume: "Le signal d'alerte le plus classique, illustré par une affaire réelle survenue en Guinée.",
    questions: [
      {
        question: "Quel est le signal d'alerte le plus classique d'une arnaque à l'investissement ?",
        choix: [
          "Une promesse de rendement rapide et garanti",
          "Un taux d'intérêt de 2% par an",
          "Un rendez-vous dans une agence bancaire",
          "Un délai de remboursement de 10 ans",
        ],
        reponseCorrecte: 0,
        explication: "Les promesses de gains rapides et garantis sont la marque de fabrique des arnaques à l'investissement — aucun placement légitime ne peut garantir un rendement élevé sans risque.",
        source: { label: "RFI — L'affaire RichVIP/SVIP en Guinée", url: "https://www.rfi.fr/fr/afrique/20231030-guin%C3%A9e-pr%C3%A8s-de-2000-personnes-victimes-d-une-escroquerie-mont%C3%A9e-par-richvip-et-svip" },
      },
      {
        question: "Quelle affaire récente en Guinée illustre une arnaque de type pyramide de Ponzi ?",
        choix: ["RichVIP/SVIP", "Le lancement de NimbaPay", "La réforme de la BCRG", "L'arrivée de Coris Bank"],
        reponseCorrecte: 0,
        explication: "Le scandale RichVIP/SVIP a fait près de 2 000 victimes signalées en Guinée, avec des promesses de rendements rapides et élevés typiques d'un schéma pyramidal.",
        source: { label: "RFI — L'affaire RichVIP/SVIP en Guinée", url: "https://www.rfi.fr/fr/afrique/20231030-guin%C3%A9e-pr%C3%A8s-de-2000-personnes-victimes-d-une-escroquerie-mont%C3%A9e-par-richvip-et-svip" },
      },
    ],
  },
];

export function leconParId(id: string): Lecon | undefined {
  return LECONS.find(l => l.id === id);
}
