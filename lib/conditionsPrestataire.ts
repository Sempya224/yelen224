// Conditions d'utilisation prestataire — texte d'exemple (19/07/2026).
// Distinct des CGU/Confidentialité génériques (app/cgu,
// app/confidentialite), spécifique aux institutions. Contenu
// provisoire, rédigé pour couvrir les points essentiels de l'activité
// réelle de la plateforme — à remplacer par le texte définitif une fois
// rédigé avec conseillers/avocat/CEO (voir CLAUDE.md /backlog-technique).
export const CONDITIONS_PRESTATAIRE_VERSION = "1.0-exemple";

export const CONDITIONS_PRESTATAIRE: { titre: string; texte: string }[] = [
  {
    titre: "Objet",
    texte: "Yelen224 met en relation votre établissement avec des citoyens souhaitant prendre rendez-vous. La plateforme facilite cette mise en relation mais n'est pas partie aux rendez-vous eux-mêmes : la responsabilité du service rendu (médical, administratif, financier ou autre selon votre secteur) reste entièrement la vôtre.",
  },
  {
    titre: "Compte et informations",
    texte: "Vous vous engagez à fournir des informations exactes sur votre établissement (identité, coordonnées, horaires, services) et à les maintenir à jour. La validation de votre compte par l'équipe Yelen224 atteste d'une vérification de premier niveau, pas d'une garantie de qualité de service.",
  },
  {
    titre: "Données des citoyens",
    texte: "Les informations des citoyens ayant pris rendez-vous avec vous (nom, téléphone, historique de rendez-vous, notes que vous rédigez) vous sont confiées dans le seul cadre de la relation créée via la plateforme. Vous vous engagez à ne pas les réutiliser à d'autres fins, ni les transmettre à un tiers sans consentement.",
  },
  {
    titre: "Rendez-vous et services payants",
    texte: "Vous êtes libre de définir vos créneaux et, le cas échéant, des services payants avec paiement sur place. Yelen224 ne collecte ni ne reverse aucun paiement entre vous et le citoyen — la plateforme génère uniquement un code de confirmation.",
  },
  {
    titre: "Signalements et modération",
    texte: "Yelen224 peut suspendre ou refuser un compte en cas de signalements fondés, d'informations frauduleuses ou d'usage contraire à l'intérêt des citoyens. Vous pouvez contester une décision en contactant le support.",
  },
  {
    titre: "Résiliation",
    texte: "Vous pouvez demander la suppression de votre compte à tout moment depuis les paramètres. La résiliation n'efface pas rétroactivement les rendez-vous déjà honorés ni les obligations légales éventuellement associées à votre activité.",
  },
];
