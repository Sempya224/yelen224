"use client";

import { useState, useEffect, useRef } from "react";

// ─── INLINE SVG ICONS (no lucide-react needed) ────────────────────────────────
const ic = (d: string, size = 22) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const X = ({ size = 18 }: { size?: number }) => ic("M18 6 6 18M6 6l12 12", size);
const ChevronRight = ({ size = 13 }: { size?: number }) => ic("m9 18 6-6-6-6", size);
const BookOpen = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const TrendingUp = ({ size = 22 }: { size?: number }) => ic("m23 6-9.5 9.5-5-5L1 18M17 6h6v6", size);
const Briefcase = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);
const Users = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const Star = ({ size = 22 }: { size?: number }) => ic("M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z", size);
const Play = ({ size = 24, fill = "none" }: { size?: number; fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const ArrowRight = ({ size = 16 }: { size?: number }) => ic("M5 12h14M12 5l7 7-7 7", size);
const Lightbulb = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.9 10.2 19 8.9 19 7a7 7 0 1 0-14 0c0 1.9 1.1 3.2 2.5 4.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>
  </svg>
);
const Target = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const Clock = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const CheckCircle = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const Zap = ({ size = 22 }: { size?: number }) => ic("M13 2 3 14h9l-1 8 10-12h-9l1-8z", size);
const Globe = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const Heart = ({ size = 22 }: { size?: number }) => ic("M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z", size);
const Award = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
  </svg>
);

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface PopupData {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  image: string;
  content: string[];
  steps?: { label: string; desc: string }[];
  stats?: { value: string; label: string }[];
  cta: string;
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
const POPUPS: PopupData[] = [
  // SECTION 1 — PRÉDICTIONS JEUNESSE
  {
    id: 1,
    title: "Si tu apprends à coder",
    subtitle: "Futur 2030 · Tech",
    icon: <Zap size={22} />, color: "#F59E0B", bgColor: "#FFFBEB",
    image: "https://images.pexels.com/photos/3861958/pexels-photo-3861958.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["En 2030, plus de 60% des emplois en Guinée nécessiteront des compétences numériques.", "Les développeurs guinéens gagnent déjà 3× le salaire moyen local en travaillant à distance.", "Coder aujourd'hui = créer ton propre emploi demain."],
    stats: [{ value: "3×", label: "Salaire moyen" }, { value: "2030", label: "Horizon digital" }, { value: "60%", label: "Emplois tech" }],
    cta: "Commencer à apprendre",
  },
  {
    id: 2,
    title: "Si tu crées ton entreprise",
    subtitle: "Futur 2030 · Entrepreneuriat",
    icon: <TrendingUp size={22} />, color: "#10B981", bgColor: "#ECFDF5",
    image: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["La Guinée compte 13M d'habitants — un marché immense encore peu saturé.", "Les startups africaines lèvent des fonds records chaque année.", "Un entrepreneur guinéen qui résout un vrai problème local peut toucher toute l'Afrique de l'Ouest."],
    stats: [{ value: "13M", label: "Clients potentiels" }, { value: "CEDEAO", label: "Marché régional" }, { value: "+200%", label: "Startups 2024" }],
    cta: "Explorer l'entrepreneuriat",
  },
  {
    id: 3,
    title: "Si tu économises dès 20 ans",
    subtitle: "Futur 2040 · Finance",
    icon: <Star size={22} />, color: "#8B5CF6", bgColor: "#F5F3FF",
    image: "https://images.pexels.com/photos/3943716/pexels-photo-3943716.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Épargner 50 000 GNF/mois pendant 20 ans = capital de départ pour ta retraite.", "Les Guinéens qui investissent tôt dans l'immobilier ou l'agriculture bâtissent un patrimoine solide.", "La discipline financière à 20 ans te protège à 40 ans."],
    stats: [{ value: "20 ans", label: "Commencer tôt" }, { value: "×5", label: "Valeur en 20 ans" }, { value: "0 dette", label: "Objectif liberté" }],
    cta: "Apprendre à épargner",
  },
  {
    id: 4,
    title: "Si tu parles 3 langues",
    subtitle: "Futur 2035 · Compétences",
    icon: <Globe size={22} />, color: "#3B82F6", bgColor: "#EFF6FF",
    image: "https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Français + Anglais + Pular ou Malinké = triple avantage compétitif.", "Les interprètes et traducteurs guinéens sont très demandés par les ONG et entreprises étrangères.", "La langue est ton passeport sans quitter le pays."],
    stats: [{ value: "3", label: "Langues = force" }, { value: "ONG", label: "Débouchés" }, { value: "Diplôme", label: "Sans frontières" }],
    cta: "Développer ses langues",
  },
  {
    id: 5,
    title: "Si tu rejoins une coopérative",
    subtitle: "Futur 2032 · Agriculture",
    icon: <Users size={22} />, color: "#F59E0B", bgColor: "#FFFBEB",
    image: "https://images.pexels.com/photos/1595104/pexels-photo-1595104.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["La Guinée possède 30% des ressources en eau douce d'Afrique de l'Ouest.", "L'agriculture coopérative permet d'exporter et de diviser les coûts.", "Un jeune agriculteur organisé gagne plus qu'un fonctionnaire."],
    stats: [{ value: "30%", label: "Eau douce CEDEAO" }, { value: "Export", label: "Potentiel" }, { value: "Coop", label: "Force collective" }],
    cta: "Rejoindre une coopérative",
  },
  {
    id: 6,
    title: "Si tu deviens mentor",
    subtitle: "Futur 2030 · Leadership",
    icon: <Heart size={22} />, color: "#EF4444", bgColor: "#FEF2F2",
    image: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Enseigner ce que tu sais multiplie ton impact par 10.", "Les mentors construisent des réseaux puissants qui ouvrent des portes invisibles.", "Être respecté dans sa communauté vaut plus que n'importe quel diplôme étranger."],
    stats: [{ value: "×10", label: "Impact multiplié" }, { value: "Réseau", label: "Ta richesse" }, { value: "Respect", label: "Capital social" }],
    cta: "Devenir mentor",
  },

  // SECTION 2 — ORGANISATION LIEU DE TRAVAIL
  {
    id: 7,
    title: "La règle des 5S au bureau",
    subtitle: "Organisation · Méthode japonaise",
    icon: <Briefcase size={22} />, color: "#10B981", bgColor: "#ECFDF5",
    image: "https://images.pexels.com/photos/1181533/pexels-photo-1181533.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Seiri : Trier — éliminer tout ce qui n'est pas utile.", "Seiton : Ranger — une place pour chaque chose.", "Seiso : Nettoyer quotidiennement ton espace.", "Seiketsu : Standardiser les bonnes pratiques.", "Shitsuke : Maintenir la discipline dans le temps."],
    steps: [
      { label: "Trier", desc: "Virer l'inutile" },
      { label: "Ranger", desc: "Chaque objet à sa place" },
      { label: "Nettoyer", desc: "Chaque jour" },
      { label: "Standardiser", desc: "Créer des règles" },
      { label: "Maintenir", desc: "Discipline durable" },
    ],
    cta: "Appliquer les 5S",
  },
  {
    id: 8,
    title: "Zéro file d'attente avec YELEN",
    subtitle: "Organisation · Gestion du temps",
    icon: <Clock size={22} />, color: "#F59E0B", bgColor: "#FFFBEB",
    image: "https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Réserver via YELEN = arriver à l'heure exacte de ton rendez-vous.", "Plus de 3h de file perdue chaque semaine en Guinée par personne active.", "Les institutions qui utilisent YELEN réduisent les attentes de 80%."],
    stats: [{ value: "−80%", label: "Temps d'attente" }, { value: "3h/sem", label: "Économisées" }, { value: "24/7", label: "Réservation" }],
    cta: "Réserver maintenant",
  },
  {
    id: 9,
    title: "Gérer les débordements",
    subtitle: "Organisation · Charge de travail",
    icon: <Target size={22} />, color: "#8B5CF6", bgColor: "#F5F3FF",
    image: "https://images.pexels.com/photos/3184357/pexels-photo-3184357.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["La matrice d'Eisenhower : Urgent+Important = Faire maintenant.", "Déléguer les tâches importantes mais non urgentes.", "Eliminer les tâches ni urgentes ni importantes.", "Bloquer des plages horaires dédiées sans interruption."],
    steps: [
      { label: "Urgent + Important", desc: "Faire maintenant" },
      { label: "Important", desc: "Planifier" },
      { label: "Urgent", desc: "Déléguer" },
      { label: "Ni l'un ni l'autre", desc: "Éliminer" },
    ],
    cta: "Maîtriser ma charge",
  },
  {
    id: 10,
    title: "Routine matinale du champion",
    subtitle: "Organisation · Productivité",
    icon: <Award size={22} />, color: "#3B82F6", bgColor: "#EFF6FF",
    image: "https://images.pexels.com/photos/1118873/pexels-photo-1118873.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["5h00 : Réveil et 10 min de silence.", "5h15 : Sport léger 20 min.", "5h45 : Lecture 15 min.", "6h00 : Planning de la journée — 3 priorités max.", "6h30 : Prêt avant tout le monde = avance sur la journée."],
    steps: [
      { label: "5h00", desc: "Réveil + silence" },
      { label: "5h15", desc: "Sport 20 min" },
      { label: "5h45", desc: "Lecture" },
      { label: "6h00", desc: "3 priorités" },
    ],
    cta: "Adopter la routine",
  },

  // SECTION 3 — RÉUSSIR EN GUINÉE SANS PARTIR
  {
    id: 11,
    title: "Le freelance local-global",
    subtitle: "Réussir · Sans passeport",
    icon: <Globe size={22} />, color: "#10B981", bgColor: "#ECFDF5",
    image: "https://images.pexels.com/photos/4974914/pexels-photo-4974914.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Depuis Conakry, tu peux travailler pour des clients à Paris, Dubaï ou New York.", "Plateformes : Upwork, Fiverr, Malt, LinkedIn — accessibles avec un smartphone.", "Un graphiste guinéen peut gagner 500$/mois sans quitter Ratoma."],
    stats: [{ value: "500$", label: "Possible/mois" }, { value: "WiFi", label: "Tout ce qu'il faut" }, { value: "Conakry", label: "→ Monde entier" }],
    cta: "Lancer son freelance",
  },
  {
    id: 12,
    title: "L'agriculture intelligente",
    subtitle: "Réussir · Terres guinéennes",
    icon: <Lightbulb size={22} />, color: "#F59E0B", bgColor: "#FFFBEB",
    image: "https://images.pexels.com/photos/2165688/pexels-photo-2165688.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["La Guinée est l'un des pays les plus fertiles d'Afrique de l'Ouest.", "L'agri-tech permet de multiplier les rendements par 3 sans plus de terrain.", "Les marchés de Conakry, Kankan et Labé sont sous-approvisionnés."],
    stats: [{ value: "×3", label: "Rendement agri-tech" }, { value: "Fertile", label: "Sol guinéen" }, { value: "3 villes", label: "Marchés actifs" }],
    cta: "Explorer l'agri-tech",
  },
  {
    id: 13,
    title: "Construire ton réseau local",
    subtitle: "Réussir · Connexions",
    icon: <Users size={22} />, color: "#8B5CF6", bgColor: "#F5F3FF",
    image: "https://images.pexels.com/photos/1181622/pexels-photo-1181622.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["En Guinée, les opportunités circulent par le bouche-à-oreille et les cercles de confiance.", "Rejoindre une association professionnelle = accéder à 10× plus d'opportunités.", "Ton réseau est ton filet de sécurité ET ton tremplin."],
    steps: [
      { label: "Identifier", desc: "3 mentors dans ton domaine" },
      { label: "Rejoindre", desc: "1 association pro" },
      { label: "Donner", desc: "Avant de recevoir" },
      { label: "Maintenir", desc: "Contact régulier" },
    ],
    cta: "Construire mon réseau",
  },
  {
    id: 14,
    title: "La formation continue",
    subtitle: "Réussir · Compétences",
    icon: <BookOpen size={22} />, color: "#3B82F6", bgColor: "#EFF6FF",
    image: "https://images.pexels.com/photos/5905558/pexels-photo-5905558.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["YouTube, Coursera, Khan Academy — tout est gratuit en français.", "1h d'apprentissage par jour = 365h de compétences par an.", "Les plus formés en Guinée sont ceux qui apprennent seuls, en ligne."],
    stats: [{ value: "1h/jour", label: "Suffit" }, { value: "Gratuit", label: "YouTube Coursera" }, { value: "365h", label: "Par an" }],
    cta: "Commencer en ligne",
  },

  // SECTION 4 — CITOYEN YELEN
  {
    id: 15,
    title: "Réserver sans se déplacer",
    subtitle: "YELEN · Citoyen actif",
    icon: <CheckCircle size={22} />, color: "#10B981", bgColor: "#ECFDF5",
    image: "https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Depuis ton téléphone, réserve un rendez-vous à la mairie, l'hôpital ou la banque.", "Plus de déplacements inutiles, plus de demi-journées perdues.", "YELEN confirme par SMS — tu arrives, tu es reçu."],
    steps: [
      { label: "Ouvrir YELEN", desc: "Sur mobile" },
      { label: "Choisir", desc: "Ton institution" },
      { label: "Sélectionner", desc: "Date et heure" },
      { label: "Confirmer", desc: "Reçois ton SMS" },
    ],
    cta: "Faire mon premier RDV",
  },
  {
    id: 16,
    title: "Comment YELEN change ta vie",
    subtitle: "YELEN · Impact citoyen",
    icon: <Zap size={22} />, color: "#F59E0B", bgColor: "#FFFBEB",
    image: "https://images.pexels.com/photos/3894378/pexels-photo-3894378.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Chaque heure gagnée en file d'attente = 1h pour ta famille, ton business, ta santé.", "Un citoyen organisé devient un citoyen fort.", "YELEN te donne le contrôle de ton temps — ta ressource la plus précieuse."],
    stats: [{ value: "1h", label: "Gagnée/visite" }, { value: "Ta famille", label: "Bénéficie" }, { value: "Contrôle", label: "De ton temps" }],
    cta: "Rejoindre YELEN",
  },
  {
    id: 17,
    title: "Tu deviens un modèle",
    subtitle: "YELEN · Effet boule de neige",
    icon: <Star size={22} />, color: "#8B5CF6", bgColor: "#F5F3FF",
    image: "https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Quand tu utilises YELEN, tu inspires 5 personnes autour de toi.", "Un quartier qui réserve en ligne = un quartier plus productif.", "Tu contribues à moderniser la Guinée un RDV à la fois."],
    stats: [{ value: "×5", label: "Effet viral" }, { value: "Quartier", label: "Modernisé" }, { value: "1 RDV", label: "= Grand changement" }],
    cta: "Partager YELEN",
  },
  {
    id: 18,
    title: "Donner des retours utiles",
    subtitle: "YELEN · Participation citoyenne",
    icon: <Heart size={22} />, color: "#EF4444", bgColor: "#FEF2F2",
    image: "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Après chaque RDV, note le service reçu via YELEN.", "Tes retours améliorent directement l'expérience des prochains citoyens.", "Un citoyen qui évalue = un citoyen qui gouverne."],
    steps: [
      { label: "Après ton RDV", desc: "Ouvrir YELEN" },
      { label: "Évaluer", desc: "Service sur 5 étoiles" },
      { label: "Commenter", desc: "Ce qui peut s'améliorer" },
      { label: "Impact", desc: "L'institution s'adapte" },
    ],
    cta: "Évaluer un service",
  },
  {
    id: 19,
    title: "YELEN en ambassade",
    subtitle: "YELEN · Diaspora guinéenne",
    icon: <Globe size={22} />, color: "#3B82F6", bgColor: "#EFF6FF",
    image: "https://images.pexels.com/photos/1152077/pexels-photo-1152077.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["En France, Belgique, USA — les ambassades guinéennes utilisent aussi YELEN.", "Plus besoin de prendre congé pour renouveler tes documents.", "YELEN connecte la diaspora à sa patrie dignement."],
    stats: [{ value: "Mondial", label: "Ambassades" }, { value: "Diaspora", label: "Connectée" }, { value: "0 congé", label: "Perdu" }],
    cta: "YELEN à l'étranger",
  },
  {
    id: 20,
    title: "Devenir prescripteur YELEN",
    subtitle: "YELEN · Communauté",
    icon: <Award size={22} />, color: "#10B981", bgColor: "#ECFDF5",
    image: "https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=800",
    content: ["Parraine 5 amis sur YELEN et débloques des avantages prioritaires.", "Les prescripteurs ont accès aux créneaux rares en avant-première.", "Ensemble, on transforme l'administration guinéenne."],
    stats: [{ value: "5 amis", label: "Parrainés" }, { value: "Priorité", label: "Sur les créneaux" }, { value: "Ensemble", label: "On change tout" }],
    cta: "Devenir prescripteur",
  },
];

const VIDEOS = [
  { id: "7u45eMXjwLw", title: "Réussir en Guinée" },
  { id: "jc3GFosaxow", title: "Entrepreneuriat africain" },
  { id: "-HE6NvX4Kv8", title: "Organisation & productivité" },
  { id: "GcYCtFAjVbk", title: "Digital & avenir" },
  { id: "kqeKHWNUibg", title: "Jeunesse guinéenne" },
];

const SECTIONS = [
  { id: "predictions", label: "🔮 Prédictions", color: "#F59E0B" },
  { id: "organisation", label: "⚡ Organisation", color: "#10B981" },
  { id: "reussir", label: "🚀 Réussir", color: "#8B5CF6" },
  { id: "citoyen", label: "🌍 Citoyen YELEN", color: "#3B82F6" },
  { id: "formation", label: "🎓 Formation", color: "#EF4444" },
];

// ─── POPUP COMPONENT ──────────────────────────────────────────────────────────
function Popup({ data, onClose }: { data: PopupData; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
        style={{ background: data.bgColor, border: `2px solid ${data.color}22` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Image header */}
        <div className="relative h-48 sm:h-56 overflow-hidden rounded-t-3xl sm:rounded-t-3xl">
          <img
            src={data.image}
            alt={data.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, ${data.bgColor})` }} />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: "rgba(255,255,255,0.9)" }}
          >
            <X size={18} color="#374151" />
          </button>
          <div className="absolute bottom-3 left-4">
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: data.color, color: "#fff" }}>
              {data.subtitle}
            </span>
          </div>
        </div>

        <div className="px-5 pb-8 pt-2">
          {/* Title */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${data.color}22` }}>
              <span style={{ color: data.color }}>{data.icon}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{data.title}</h2>
          </div>

          {/* Stats */}
          {data.stats && (
            <div className="grid grid-cols-3 gap-2 mb-5">
              {data.stats.map((s, i) => (
                <div key={i} className="rounded-2xl p-3 text-center" style={{ background: `${data.color}15` }}>
                  <div className="text-xl font-black" style={{ color: data.color }}>{s.value}</div>
                  <div className="text-[10px] text-gray-500 font-medium mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Steps */}
          {data.steps && (
            <div className="mb-5 space-y-2">
              {data.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: `${data.color}10` }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: data.color }}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-800">{s.label}</div>
                    <div className="text-xs text-gray-500">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="space-y-3 mb-6">
            {data.content.map((c, i) => (
              <div key={i} className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${data.color}22` }}>
                  <CheckCircle size={12} style={{ color: data.color }} />
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{c}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
            style={{ background: `linear-gradient(135deg, ${data.color}, ${data.color}cc)` }}
          >
            {data.cta} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ARTICLE CARD ─────────────────────────────────────────────────────────────
function ArticleCard({ item, onClick }: { item: PopupData; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left rounded-3xl overflow-hidden shadow-md active:scale-95 transition-all duration-200 hover:shadow-xl hover:-translate-y-1"
      style={{ border: `1.5px solid ${item.color}22` }}
    >
      <div className="relative h-40 overflow-hidden">
        <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.6))` }} />
        <div className="absolute top-3 left-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: item.color }}>
            {item.icon}
          </div>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <span className="text-[10px] font-semibold text-white/80">{item.subtitle}</span>
        </div>
      </div>
      <div className="p-4" style={{ background: item.bgColor }}>
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2">{item.title}</h3>
        <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: item.color }}>
          Lire l'article <ChevronRight size={13} />
        </div>
      </div>
    </button>
  );
}

// ─── VIDEO CARD ───────────────────────────────────────────────────────────────
function VideoCard({ video }: { video: typeof VIDEOS[0] }) {
  const thumb = `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`;
  return (
    <div className="relative rounded-3xl overflow-hidden shadow-md" style={{ border: "1.5px solid #F59E0B22" }}>
      <div className="relative">
        <img src={thumb} alt={video.title} className="w-full h-44 object-cover" />
        {/* YELEN overlay brand */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg" style={{ background: "#F59E0B" }}>
            <Play size={24} fill="white" color="white" />
          </div>
        </div>
        {/* YELEN logo stamp - top right */}
        <div className="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-black shadow" style={{ background: "#F59E0B", color: "#fff" }}>
          YELEN224
        </div>
        {/* Disable real redirect with overlay */}
        <div className="absolute inset-0 cursor-default" />
      </div>
      <div className="p-3" style={{ background: "#FFFBEB" }}>
        <p className="text-sm font-bold text-gray-800 leading-snug">{video.title}</p>
        <p className="text-xs text-gray-400 mt-1">Contenu éducatif YELEN</p>
      </div>
    </div>
  );
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SectionHeader({ emoji, title, subtitle, color }: { emoji: string; title: string; subtitle: string; color: string }) {
  return (
    <div className="mb-6">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold mb-3" style={{ background: `${color}18`, color }}>
        <span>{emoji}</span> {subtitle}
      </div>
      <h2 className="text-2xl font-black text-gray-900 leading-tight">{title}</h2>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function EducationPage() {
  const [activePopup, setActivePopup] = useState<PopupData | null>(null);
  const [activeSection, setActiveSection] = useState("predictions");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const predictionItems = POPUPS.slice(0, 6);
  const orgItems = POPUPS.slice(6, 10);
  const reussirItems = POPUPS.slice(10, 14);
  const citoyenItems = POPUPS.slice(14, 20);

  return (
    <div className="min-h-screen" style={{ background: "#FFFEF0", fontFamily: "'Nunito', sans-serif" }}>
      {/* Google Font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');`}</style>

      {/* ── HERO ── */}
      <div className="relative overflow-hidden px-5 pt-12 pb-10" style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FDF6D8 50%, #FFFEF0 100%)" }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #F59E0B, transparent)", transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #10B981, transparent)", transform: "translate(-30%, 30%)" }} />
        <div className="relative z-10 max-w-md mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold mb-4" style={{ background: "#F59E0B", color: "#fff" }}>
            <BookOpen size={14} /> Centre d'éducation YELEN224
          </div>
          <h1 className="text-3xl font-black text-gray-900 leading-tight mb-3">
            Apprends. Agis.<br />
            <span style={{ color: "#F59E0B" }}>Change la Guinée.</span>
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed max-w-xs mx-auto">
            Tout ce qu'un citoyen guinéen doit savoir pour réussir, s'organiser et construire son avenir sans quitter son pays.
          </p>
        </div>
      </div>

      {/* ── NAV TABS ── */}
      <div className="sticky top-0 z-30 px-4 py-3 overflow-x-auto" style={{ background: "rgba(255,254,240,0.95)", backdropFilter: "blur(10px)", borderBottom: "1px solid #F59E0B22" }}>
        <div className="flex gap-2 min-w-max">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
              style={activeSection === s.id
                ? { background: s.color, color: "#fff", boxShadow: `0 4px 12px ${s.color}44` }
                : { background: `${s.color}15`, color: s.color }
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-8 space-y-14">

        {/* ── SECTION 1 : PRÉDICTIONS ── */}
        <div ref={el => { sectionRefs.current["predictions"] = el; }}>
          <SectionHeader emoji="🔮" title="Si tu fais ça, voici ton futur" subtitle="Prédictions 2030–2040" color="#F59E0B" />
          <div className="grid grid-cols-2 gap-4">
            {predictionItems.map(item => (
              <ArticleCard key={item.id} item={item} onClick={() => setActivePopup(item)} />
            ))}
          </div>
        </div>

        {/* ── SECTION 2 : ORGANISATION ── */}
        <div ref={el => { sectionRefs.current["organisation"] = el; }}>
          <SectionHeader emoji="⚡" title="Organiser ton espace & éviter les files" subtitle="Productivité & organisation" color="#10B981" />
          <div className="grid grid-cols-2 gap-4">
            {orgItems.map(item => (
              <ArticleCard key={item.id} item={item} onClick={() => setActivePopup(item)} />
            ))}
          </div>
        </div>

        {/* ── SECTION 3 : RÉUSSIR ── */}
        <div ref={el => { sectionRefs.current["reussir"] = el; }}>
          <SectionHeader emoji="🚀" title="Réussir en Guinée sans quitter le pays" subtitle="Opportunités locales" color="#8B5CF6" />
          <div className="grid grid-cols-2 gap-4">
            {reussirItems.map(item => (
              <ArticleCard key={item.id} item={item} onClick={() => setActivePopup(item)} />
            ))}
          </div>
        </div>

        {/* ── SECTION 4 : CITOYEN YELEN ── */}
        <div ref={el => { sectionRefs.current["citoyen"] = el; }}>
          <SectionHeader emoji="🌍" title="Agir en citoyen YELEN" subtitle="Impact & transformation" color="#3B82F6" />
          <div className="grid grid-cols-2 gap-4">
            {citoyenItems.map(item => (
              <ArticleCard key={item.id} item={item} onClick={() => setActivePopup(item)} />
            ))}
          </div>
        </div>

        {/* ── SECTION 5 : FORMATION VIDÉO ── */}
        <div ref={el => { sectionRefs.current["formation"] = el; }}>
          <SectionHeader emoji="🎓" title="Vidéos de formation" subtitle="Centre d'apprentissage YELEN" color="#EF4444" />
          <div className="grid grid-cols-1 gap-4">
            {VIDEOS.map(v => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </div>

        {/* ── CTA FINAL ── */}
        <div className="rounded-3xl p-6 text-center" style={{ background: "linear-gradient(135deg, #FEF3C7, #FDE68A)", border: "2px solid #F59E0B44" }}>
          <div className="text-4xl mb-3">🇬🇳</div>
          <h3 className="text-xl font-black text-gray-900 mb-2">La Guinée que tu veux, commence avec toi.</h3>
          <p className="text-sm text-gray-600 mb-5">Rejoins YELEN224 et deviens acteur du changement.</p>
          <button className="w-full py-4 rounded-2xl text-white font-black text-base shadow-lg" style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}>
            Rejoindre YELEN224 →
          </button>
        </div>

      </div>

      {/* ── POPUP ── */}
      {activePopup && <Popup data={activePopup} onClose={() => setActivePopup(null)} />}
    </div>
  );
}