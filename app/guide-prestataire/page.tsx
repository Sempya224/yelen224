"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────
type SectionType = "text" | "warn" | "tip" | "info" | "list" | "checklist" | "steps" | "plans";

interface Section {
  titre: string;
  contenu?: string | null;
  type: SectionType;
  items?: string[];
}

interface Chapitre {
  id: string;
  numero: string;
  titre: string;
  icon: string;
  duree: string;
  niveau: string;
  couleur: string;
  resume: string;
  sections: Section[];
}

interface Plan {
  label: string;
  prix: string;
  essai: string;
  couleur: string;
  items: string[];
}

// ── Data ────────────────────────────────────────────────────────────────────
const CHAPITRES: Chapitre[] = [
  {
    id: "inscription", numero: "01", titre: "Inscription et vérification", icon: "🚀", duree: "5 min", niveau: "Débutant", couleur: "#22c55e",
    resume: "Créez votre compte pro et obtenez votre validation officielle Yelen224.",
    sections: [
      { titre: "Accéder au formulaire", contenu: "Rendez-vous sur Yelen224 → cliquez sur \"Space Pro\" depuis l'accueil. L'inscription pro est distincte de l'inscription citoyen — utilisez exclusivement le formulaire Space Pro.", type: "text" },
      { titre: "⚠️ Important", contenu: "Ne créez pas un compte citoyen si vous souhaitez proposer vos services.", type: "warn" },
      { titre: "Informations requises", type: "list", items: ["Dénomination officielle de l'institution", "Catégorie de service (hôpital, banque, mairie...)", "Adresse complète de l'établissement", "Numéro de téléphone principal", "Email professionnel", "Site web officiel (si disponible)"] },
      { titre: "💡 Conseil pro", contenu: "Utilisez le nom officiel exact tel qu'il apparaît sur vos documents légaux. Cela facilite la vérification et renforce la confiance.", type: "tip" },
      { titre: "Choisir votre plan", type: "plans" },
      { titre: "Documents à soumettre", type: "list", items: ["Institutions publiques : Acte officiel de création, numéro JO, pièce d'identité du responsable", "Entreprises privées : RCCM, NIF, agréments sectoriels, pièce d'identité du représentant", "Professionnels indépendants : Diplômes, numéro d'ordre professionnel, pièce d'identité valide", "Format accepté : PDF, JPG, PNG — max 10 MB"] },
      { titre: "Délais de validation", type: "list", items: ["📩 Accusé de réception : immédiat", "📩 Dossier en examen : dans les 24h", "📩 Documents complémentaires si besoin : 48h", "📩 Validation et activation : 72h ouvrées"] },
    ],
  },
  {
    id: "profil", numero: "02", titre: "Configuration du profil", icon: "🏛️", duree: "15 min", niveau: "Débutant", couleur: "#3b82f6",
    resume: "Construisez un profil complet qui inspire confiance aux citoyens.",
    sections: [
      { titre: "ℹ️ Saviez-vous ?", contenu: "Les institutions avec un profil à 100% reçoivent en moyenne 3× plus de demandes de RDV.", type: "info" },
      { titre: "Informations générales", contenu: "Tableau de bord → Mon profil → Informations générales\n\nChamps obligatoires : nom officiel, catégorie, description (min 150 caractères), adresse complète, téléphone et email.\n\nChamps recommandés : site web, réseaux sociaux, WhatsApp pro, langues parlées.", type: "text" },
      { titre: "💡 Exemple de bonne description", contenu: "\"L'Agence Ecobank de Matam vous accueille pour l'ouverture de comptes, les transferts d'argent et les crédits. Équipe bilingue français/pular, du lundi au vendredi sur RDV.\"", type: "tip" },
      { titre: "Logo et identité visuelle", type: "list", items: ["Format PNG ou JPG (fond transparent préféré)", "Dimensions min : 400×400 px — max 5 MB", "Photo de couverture Premium : 1200×400 px — max 10 MB", "Le logo apparaît dans les résultats et confirmations de RDV"] },
      { titre: "Services proposés", contenu: "Listez précisément chaque service. Précisez la durée, le tarif indicatif, les documents à apporter et les conditions particulières.", type: "text" },
      { titre: "Progression du profil", type: "checklist", items: ["Informations générales complètes", "Logo uploadé", "Au moins 3 services renseignés", "Disponibilités configurées", "Document officiel soumis", "Badge vérifié obtenu"] },
    ],
  },
  {
    id: "disponibilites", numero: "03", titre: "Disponibilités et créneaux", icon: "📅", duree: "10 min", niveau: "Débutant", couleur: "#F5A623",
    resume: "Configurez votre agenda et définissez les créneaux disponibles.",
    sections: [
      { titre: "Horaires hebdomadaires", contenu: "Tableau de bord → Disponibilités\n\n• Lundi : 08h00 – 17h00 ✅\n• Mardi : 08h00 – 17h00 ✅\n• Mercredi : 08h00 – 12h00 ✅\n• Jeudi : 08h00 – 17h00 ✅\n• Vendredi : 08h00 – 16h00 ✅\n• Samedi / Dimanche : Fermé ❌", type: "text" },
      { titre: "Durée des créneaux", type: "list", items: ["15 min — consultations rapides, retraits de documents", "30 min — consultations médicales standard", "45 min — consultations spécialisées", "1 heure — bilans complets, consultations juridiques"] },
      { titre: "💡 Conseil pro", contenu: "Ajoutez 5 min de tampon entre créneaux pour éviter les retards en cascade. Paramètres → Paramètres avancés.", type: "tip" },
      { titre: "⚠️ Fermetures exceptionnelles", contenu: "Bloquez vos dates d'absence au minimum 72h à l'avance. Les citoyens avec un RDV existant seront notifiés automatiquement.", type: "warn" },
      { titre: "Conseils avancés", type: "list", items: ["💡 Réservez 2–3 créneaux libres/jour pour les urgences", "💡 Consultez vos statistiques pour identifier les pics", "💡 Anticipez Tabaski, Korité, vacances scolaires", "💡 Configurez un délai min de réservation (ex: 2h avant)"] },
    ],
  },
  {
    id: "rdv", numero: "04", titre: "Gestion des rendez-vous", icon: "✅", duree: "10 min", niveau: "Intermédiaire", couleur: "#a855f7",
    resume: "Maîtrisez le flux complet des RDV — de la demande à l'après-visite.",
    sections: [
      { titre: "Flux complet d'un RDV", type: "steps", items: ["Demande reçue — notification push + SMS + email", "Confirmation ou refus dans les 24h", "Rappels automatiques envoyés au citoyen J-1", "Jour du RDV — liste complète dans \"Aujourd'hui\"", "Marquage après RDV : Effectué / No-show / Reporté", "Invitation avis automatique 48h après le RDV"] },
      { titre: "⚠️ Règle automatique", contenu: "Tout RDV non traité dans les 24h est automatiquement confirmé par le système. Traitez vos demandes rapidement.", type: "warn" },
      { titre: "Annulations citoyen", contenu: "Le citoyen peut annuler jusqu'à 2h avant. Le créneau est libéré automatiquement et vous recevez une notification.", type: "text" },
      { titre: "Annulations de votre côté", contenu: "Sélectionnez le RDV → Annuler → motif obligatoire → proposition d'alternative recommandée. Le citoyen est notifié par SMS et email.", type: "text" },
      { titre: "⚠️ Attention", contenu: "Un taux d'annulation supérieur à 10% peut entraîner une suspension temporaire de votre profil.", type: "warn" },
      { titre: "Vues disponibles", type: "list", items: ["Vue Aujourd'hui — RDV du jour", "Vue Semaine — agenda hebdomadaire", "Vue Mois — visualisation avec compteurs", "Vue Liste — filtres par statut, service, période, citoyen"] },
      { titre: "Export (Plan Premium)", type: "list", items: ["PDF — impression et archivage", "Excel / CSV — vos outils internes", "iCal — Google Calendar, Outlook"] },
    ],
  },
  {
    id: "statistiques", numero: "05", titre: "Comprendre les statistiques", icon: "📊", duree: "8 min", niveau: "Intermédiaire", couleur: "#06b6d4",
    resume: "Analysez vos performances et prenez des décisions éclairées.",
    sections: [
      { titre: "Plan PRO — Stats de base", type: "list", items: ["Nombre total de RDV par période", "Taux de confirmation et de no-show", "Vues du profil et note moyenne", "Évolution mensuelle des RDV"] },
      { titre: "Plan PREMIUM — Stats avancées", type: "list", items: ["Répartition des RDV par service", "Heatmap jours et heures de pointe", "Provenance géographique des citoyens", "Taux de conversion vues → RDV", "Comparaison mois/mois et année/année", "Rapports exportables PDF et Excel", "Rapport mensuel automatique le 1er du mois"] },
      { titre: "Interpréter vos KPIs", contenu: "Taux de confirmation :\n🟢 > 90%  Excellent\n🟡 70–90%  Correct\n🔴 < 70%   Préoccupant\n\nTaux de no-show :\n🟢 < 5%   Excellent\n🟡 5–15%  Normal\n🔴 > 15%  Élevé\n\nNote moyenne :\n🟢 4.5–5.0  Excellent\n🟡 3.5–4.4  Bien\n🔴 < 3.5    À améliorer", type: "text" },
      { titre: "💡 Conversion faible ?", contenu: "Beaucoup de vues mais peu de RDV ? Vérifiez vos disponibilités, votre description, votre logo et vos horaires.", type: "tip" },
    ],
  },
  {
    id: "annonces", numero: "06", titre: "Utiliser les annonces", icon: "📢", duree: "8 min", niveau: "Intermédiaire", couleur: "#f97316",
    resume: "Communiquez officiellement avec les citoyens. (Plan Premium uniquement)",
    sections: [
      { titre: "⚠️ Plan Premium uniquement", contenu: "Cette fonctionnalité est réservée aux abonnés Premium (15$/mois — 3 mois d'essai gratuit).", type: "warn" },
      { titre: "Types d'annonces autorisées", type: "list", items: ["✅ Changements d'horaires, fermetures temporaires", "✅ Nouveaux services ou nouveaux praticiens", "✅ Campagnes de santé, journées portes ouvertes", "✅ Alertes et communications officielles", "❌ Publicité commerciale excessive interdite", "❌ Contenu politique ou religieux interdit"] },
      { titre: "Créer une annonce", contenu: "Tableau de bord → Annonces → Nouvelle annonce\n\nRemplissez : titre (max 60 car.), corps (max 500 car.), type (Information / Alerte / Actualité / Fermeture), dates de début et fin.\n\nModération < 2h avant publication.", type: "text" },
      { titre: "Exemple — Fermeture exceptionnelle", contenu: "\"Nos agences seront fermées le 28 mars pour la fête nationale. Nous vous accueillons à nouveau le 31 mars. Vos RDV sont maintenus ou reprogrammés sur demande.\"", type: "tip" },
      { titre: "Exemple — Nouveau service", contenu: "\"Nous accueillons Dr. Camara, cardiologue certifié. Consultations chaque mardi et jeudi de 9h à 13h. Prenez RDV dès maintenant.\"", type: "tip" },
      { titre: "Bonnes pratiques", type: "list", items: ["Limitez-vous à 1–2 annonces actives simultanément", "Rédigez des messages courts et orientés vers l'action", "Supprimez les annonces obsolètes dès que possible"] },
    ],
  },
  {
    id: "badge", numero: "07", titre: "Obtenir le badge vérifié", icon: "✓", duree: "5 min", niveau: "Débutant", couleur: "#eab308",
    resume: "Le badge vérifié est votre sceau de confiance officiel sur Yelen224.",
    sections: [
      { titre: "Pourquoi le badge est crucial", type: "list", items: ["+65% de vues profil", "+80% de taux de conversion vers les RDV", "Meilleure position dans les résultats de recherche", "Badge visible sur toutes vos communications", "Accès aux fonctionnalités avancées"] },
      { titre: "Conditions d'éligibilité", type: "checklist", items: ["Profil complété à 100%", "Logo officiel uploadé", "Au moins 3 services renseignés", "Disponibilités configurées", "Documents justificatifs conformes", "Téléphone et email vérifiés", "Aucune violation des CGP"] },
      { titre: "Processus de vérification", contenu: "Tableau de bord → Document officiel → Soumettre pour vérification\n\nNotre équipe examine votre dossier en 2 à 5 jours ouvrés : authenticité des documents, confirmation de l'adresse, vérification des contacts et de la légalité.", type: "text" },
      { titre: "Maintien du badge", type: "list", items: ["✅ Maintenez votre profil à jour en permanence", "✅ Renouvelez vos documents avant expiration", "✅ Respectez vos engagements envers les citoyens", "🔴 Retiré si signalements répétés fondés", "🔴 Retiré si informations manifestement fausses"] },
      { titre: "Renouvellement annuel", contenu: "Le badge fait l'objet d'un contrôle annuel automatique. Vous serez notifié 30 jours avant l'échéance.", type: "info" },
    ],
  },
  {
    id: "abonnements", numero: "08", titre: "Abonnements Pro & Premium", icon: "💳", duree: "8 min", niveau: "Débutant", couleur: "#ec4899",
    resume: "Gérez votre facturation et optimisez votre investissement Yelen224.",
    sections: [
      { titre: "Comparatif des plans", type: "plans" },
      { titre: "Tarification annuelle", contenu: "• Plan Pro annuel : 70$/an (économisez 14$)\n• Plan Premium annuel : 150$/an (économisez 30$)", type: "info" },
      { titre: "Modes de paiement", type: "list", items: ["💳 Carte bancaire (Visa, Mastercard)", "📱 Mobile Money (Orange Money, MTN Guinée)", "🏦 Virement bancaire (institutions gouvernementales)", "💵 PayPal (diaspora et institutions internationales)"] },
      { titre: "Upgrade Pro → Premium", contenu: "Mon abonnement → Changer de plan → Premium → Confirmer.\n\nEffet immédiat. La différence de prix est proratisée pour la période en cours.", type: "text" },
      { titre: "Résiliation", contenu: "À tout moment depuis Mon abonnement → Résilier. Accès maintenu jusqu'à la fin de la période payée. Données conservées 90 jours.", type: "text" },
    ],
  },
  {
    id: "qrcode", numero: "09", titre: "QR code et partage", icon: "📲", duree: "5 min", niveau: "Débutant", couleur: "#14b8a6",
    resume: "Votre QR code permet à tout citoyen d'accéder à votre profil en 1 seconde.",
    sections: [
      { titre: "Caractéristiques du QR code", type: "list", items: ["✅ Unique — lié exclusivement à votre établissement", "✅ Permanent — ne change jamais", "✅ Gratuit — inclus dans tous les plans", "✅ Haute résolution — qualité d'impression professionnelle", "✅ Personnalisé — logo Yelen224 intégré au centre"] },
      { titre: "Téléchargement", contenu: "Tableau de bord → Mon QR code\n\nFormats : PNG (fond blanc), SVG (grand format), PDF (impression directe)\nTailles : 500×500 px (digital) ou 2000×2000 px (impression)", type: "text" },
      { titre: "Dans votre établissement", type: "list", items: ["À l'entrée : panneau d'accueil \"Scannez pour prendre RDV\"", "En salle d'attente : affiche A4 ou A3", "À l'accueil / réception : support de comptoir", "Sur les portes des consultations et bureaux"] },
      { titre: "Sur vos supports", type: "list", items: ["Cartes de visite et ordonnances", "Flyers et brochures", "Site web et page Facebook officielle", "Signature email et WhatsApp Business"] },
      { titre: "Statistiques QR (Premium)", contenu: "Suivez : nombre de scans par période, appareils utilisés, taux de conversion scan → RDV, localisation géographique.", type: "info" },
    ],
  },
  {
    id: "support", numero: "10", titre: "Support et signalements", icon: "🛟", duree: "5 min", niveau: "Débutant", couleur: "#ef4444",
    resume: "Accédez au support Yelen224 et gérez les signalements citoyens.",
    sections: [
      { titre: "Canaux de support", contenu: "Plan PRO — Support prioritaire :\n📩 yelen224gn@gmail.com — Réponse < 24h (Lun–Ven, 8h–18h GMT)\n\nPlan PREMIUM — Support dédié 24h/24 :\n📩 Email prioritaire\n📞 +1 347 301 6768 (New York)\n📞 +224 624 35 46 00 (Conakry)\n💬 Chat en direct depuis le tableau de bord\nRéponse < 4h, 24h/24 – 7j/7", type: "text" },
      { titre: "Types de demandes", type: "list", items: ["[BUG] + description — problème technique", "[ABONNEMENT] + demande — facturation", "[SÉCURITÉ] + situation — compte compromis", "[PROFIL] + demande — modification de profil", "[PARTENARIAT] + institution — accord spécial"] },
      { titre: "Gérer un signalement citoyen", contenu: "Tableau de bord → Signalements\n\nProcédure : notification sous 48h → collecte de votre version (5 jours) → décision Yelen224 (7 jours) → mesures éventuelles.", type: "text" },
      { titre: "Répondre à un avis négatif", contenu: "1. Lisez calmement et répondez dans les 48h\n2. Reconnaissez les faits légitimes\n3. Expliquez les malentendus sans accusation\n4. Proposez une solution concrète\n5. Invitez à vous recontacter directement", type: "text" },
      { titre: "💡 Exemple de bonne réponse", contenu: "\"Merci pour votre retour. Le délai ce jour-là était dû à une urgence médicale. Nous avons renforcé notre équipe. N'hésitez pas à nous appeler pour reprogrammer dans les meilleures conditions.\"", type: "tip" },
    ],
  },
];

const PLANS: Plan[] = [
  { label: "Plan PRO", prix: "7$/mois", essai: "🎁 2 mois gratuits", couleur: "#F5A623", items: ["Profil complet", "Gestion créneaux", "SMS/email auto", "Badge vérifié", "Stats de base", "Support 24h"] },
  { label: "Plan PREMIUM", prix: "15$/mois", essai: "🎁 3 mois gratuits", couleur: "#a855f7", items: ["Tout le Pro +", "Position prioritaire", "Annonces", "Stats avancées", "API Yelen224", "10 comptes staff", "Support 24h/7j"] },
];

// ── Section Block ────────────────────────────────────────────────────────────
function SectionBlock({ section, chapCouleur }: { section: Section; chapCouleur: string }) {
  if (section.type === "text") return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.8px", margin: "0 0 8px", textTransform: "uppercase" }}>{section.titre}</p>
      <div style={{ background: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(255,255,255,0.9)", borderRadius: "16px", padding: "16px" }}>
        <p style={{ color: "#3a2800", fontSize: "14px", lineHeight: 1.8, margin: 0, whiteSpace: "pre-line", fontWeight: "500" }}>{section.contenu}</p>
      </div>
    </div>
  );

  if (section.type === "warn") return (
    <div style={{ marginBottom: "16px", background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.25)", borderRadius: "16px", padding: "14px 16px" }}>
      <p style={{ color: "#dc2626", fontSize: "13px", fontWeight: "700", margin: 0, lineHeight: 1.6 }}>{section.titre}</p>
      {section.contenu && <p style={{ color: "#b91c1c", fontSize: "13px", margin: "6px 0 0", lineHeight: 1.6, fontWeight: "500" }}>{section.contenu}</p>}
    </div>
  );

  if (section.type === "tip") return (
    <div style={{ marginBottom: "16px", background: "rgba(245,166,35,0.1)", border: "1.5px solid rgba(245,166,35,0.3)", borderRadius: "16px", padding: "14px 16px" }}>
      <p style={{ color: "#92400e", fontSize: "12px", fontWeight: "800", letterSpacing: "1.2px", margin: "0 0 6px", textTransform: "uppercase" }}>{section.titre}</p>
      <p style={{ color: "#78350f", fontSize: "13px", margin: 0, lineHeight: 1.7, fontStyle: "italic", fontWeight: "500" }}>{section.contenu}</p>
    </div>
  );

  if (section.type === "info") return (
    <div style={{ marginBottom: "16px", background: "rgba(59,130,246,0.08)", border: "1.5px solid rgba(59,130,246,0.25)", borderRadius: "16px", padding: "14px 16px" }}>
      <p style={{ color: "#1d4ed8", fontSize: "12px", fontWeight: "800", letterSpacing: "1.2px", margin: "0 0 6px", textTransform: "uppercase" }}>{section.titre}</p>
      <p style={{ color: "#1e3a8a", fontSize: "13px", margin: 0, lineHeight: 1.7, fontWeight: "500" }}>{section.contenu}</p>
    </div>
  );

  if (section.type === "list") return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.8px", margin: "0 0 8px", textTransform: "uppercase" }}>{section.titre}</p>
      <div style={{ background: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(255,255,255,0.9)", borderRadius: "16px", overflow: "hidden" }}>
        {(section.items ?? []).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 16px", borderBottom: i < (section.items ?? []).length - 1 ? "1px solid rgba(200,140,0,0.1)" : "none" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: chapCouleur, marginTop: "6px", flexShrink: 0 }} />
            <p style={{ color: "#3a2800", fontSize: "13px", margin: 0, lineHeight: 1.6, fontWeight: "500" }}>{item}</p>
          </div>
        ))}
      </div>
    </div>
  );

  if (section.type === "checklist") return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.8px", margin: "0 0 8px", textTransform: "uppercase" }}>{section.titre}</p>
      <div style={{ background: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(255,255,255,0.9)", borderRadius: "16px", overflow: "hidden" }}>
        {(section.items ?? []).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderBottom: i < (section.items ?? []).length - 1 ? "1px solid rgba(200,140,0,0.1)" : "none" }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: "rgba(34,197,94,0.12)", border: "1.5px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#16a34a", fontSize: "11px", fontWeight: "900" }}>✓</span>
            </div>
            <p style={{ color: "#3a2800", fontSize: "13px", margin: 0, lineHeight: 1.5, fontWeight: "500" }}>{item}</p>
          </div>
        ))}
      </div>
    </div>
  );

  if (section.type === "steps") return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.8px", margin: "0 0 8px", textTransform: "uppercase" }}>{section.titre}</p>
      <div style={{ background: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(255,255,255,0.9)", borderRadius: "16px", padding: "8px 0" }}>
        {(section.items ?? []).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 16px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: chapCouleur, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "11px", fontWeight: "900", color: "#fff" }}>{i + 1}</div>
            <p style={{ color: "#3a2800", fontSize: "13px", margin: 0, lineHeight: 1.6, fontWeight: "500", paddingTop: "3px" }}>{item}</p>
          </div>
        ))}
      </div>
    </div>
  );

  if (section.type === "plans") return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{ color: "#8B6914", fontSize: "10px", fontWeight: "800", letterSpacing: "1.8px", margin: "0 0 8px", textTransform: "uppercase" }}>Choisir votre plan</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {PLANS.map(plan => (
          <div key={plan.label} style={{ background: "rgba(255,255,255,0.72)", border: `2px solid ${plan.couleur}40`, borderRadius: "16px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <div style={{ color: plan.couleur, fontSize: "12px", fontWeight: "900", letterSpacing: "0.5px" }}>{plan.label}</div>
                <div style={{ color: "#1a1200", fontSize: "20px", fontWeight: "900", lineHeight: 1.1 }}>{plan.prix}</div>
              </div>
              <div style={{ background: `${plan.couleur}15`, border: `1px solid ${plan.couleur}30`, borderRadius: "10px", padding: "5px 10px" }}>
                <span style={{ color: plan.couleur, fontSize: "11px", fontWeight: "800" }}>{plan.essai}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {plan.items.map(f => (
                <span key={f} style={{ background: `${plan.couleur}10`, border: `1px solid ${plan.couleur}25`, color: "#3a2800", fontSize: "11px", fontWeight: "600", padding: "3px 10px", borderRadius: "20px" }}>{f}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}

// ── Main Page ────────────────────────────────────────────────────────────────
// useSearchParams() exige un <Suspense> parent (piège build Netlify déjà
// rencontré ailleurs, voir CLAUDE.md) — export par défaut wrapper tout en
// bas du fichier, le vrai composant est GuidePrestataireInner.
function GuidePrestataireInner() {
  const searchParams = useSearchParams();
  const [activeChap, setActiveChap] = useState("inscription");
  const [menuOpen, setMenuOpen] = useState(false);

  // Lien direct depuis le popover "Aide Yelen" (chantier "Refonte Aide &
  // ressources", 06/09/2026, ?chapitre=<id>) — ignoré silencieusement si
  // l'id ne correspond à aucun chapitre réel.
  useEffect(() => {
    const c = searchParams.get("chapitre");
    if (c && CHAPITRES.some(ch => ch.id === c)) setActiveChap(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chap = CHAPITRES.find(c => c.id === activeChap) ?? CHAPITRES[0];
  const idx = CHAPITRES.findIndex(c => c.id === activeChap);

  const niveauColor = (n: string) => n === "Débutant" ? "#22c55e" : n === "Intermédiaire" ? "#F5A623" : "#a855f7";

  const goNext = () => { if (idx < CHAPITRES.length - 1) { setActiveChap(CHAPITRES[idx + 1].id); window.scrollTo({ top: 0, behavior: "smooth" }); } };
  const goPrev = () => { if (idx > 0) { setActiveChap(CHAPITRES[idx - 1].id); window.scrollTo({ top: 0, behavior: "smooth" }); } };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #FFF3CC 0%, #FFE680 35%, #FFDA40 65%, #FFF0B3 100%)", fontFamily: "'TikTokDisplayFont', 'TikTokTextFont', -apple-system, sans-serif" }}>
      <style>{`
        @font-face {
          font-family: 'TikTokDisplayFont';
          src: url('https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/webapp/main/webapp-login/TTFHaxSchrift.2e1e3d6e.woff2') format('woff2');
          font-weight: 700 900;
        }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes chapIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .chap-content { animation: chapIn 0.25s ease forwards; }
      `}</style>

      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      {/* Top bar */}
      <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(245,166,35,0.4)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "900", color: "#1a1200", letterSpacing: "0.5px", lineHeight: 1 }}>YELEN<span style={{ color: "#c47a00" }}>224</span></div>
            <div style={{ fontSize: "8px", color: "#8B6914", letterSpacing: "1.5px", fontWeight: "700" }}>GUIDE PRESTATAIRES</div>
          </div>
        </div>
        <button onClick={() => setMenuOpen(true)} style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(255,255,255,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", cursor: "pointer" }}>
          {[0,1,2].map(i => <div key={i} style={{ width: "14px", height: "2px", borderRadius: "1px", background: "#1a1200" }} />)}
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.6)", border: "1px solid rgba(200,140,0,0.2)", borderRadius: "20px", padding: "4px 12px", marginBottom: "10px" }}>
          <span style={{ fontSize: "10px" }}>📚</span>
          <span style={{ color: "#8B6914", fontSize: "9px", fontWeight: "800", letterSpacing: "1.5px" }}>DOCUMENTATION OFFICIELLE</span>
        </div>
        <h1 style={{ fontSize: "26px", fontWeight: "900", color: "#1a1200", margin: "0 0 6px", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
          Guide<br /><span style={{ color: "#c47a00" }}>Prestataires</span>
        </h1>
        <p style={{ color: "#6b5000", fontSize: "12px", margin: "0 0 16px", lineHeight: 1.6 }}>10 chapitres · Tout savoir pour gérer votre présence pro sur Yelen224.</p>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ flex: 1, height: "5px", borderRadius: "3px", background: "rgba(200,140,0,0.15)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: "3px", background: "linear-gradient(90deg, #F5A623, #e8950f)", width: `${((idx + 1) / CHAPITRES.length) * 100}%`, transition: "width 0.3s ease" }} />
          </div>
          <span style={{ color: "#8B6914", fontSize: "11px", fontWeight: "800", flexShrink: 0 }}>{idx + 1}/{CHAPITRES.length}</span>
        </div>
      </div>

      {/* Chapter tabs */}
      <div style={{ overflowX: "auto", paddingLeft: "20px", paddingBottom: "4px", display: "flex", gap: "8px", scrollbarWidth: "none", marginBottom: "16px" }}>
        {CHAPITRES.map((c) => {
          const isActive = activeChap === c.id;
          return (
            <button key={c.id} onClick={() => setActiveChap(c.id)} style={{
              flexShrink: 0, padding: "8px 14px", borderRadius: "20px",
              border: isActive ? `2px solid ${c.couleur}` : "1.5px solid rgba(255,255,255,0.7)",
              background: isActive ? c.couleur : "rgba(255,255,255,0.6)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              boxShadow: isActive ? `0 4px 14px ${c.couleur}44` : "none",
              transition: "all 0.15s ease",
            }}>
              <span style={{ fontSize: "14px" }}>{c.icon}</span>
              <span style={{ color: isActive ? "#fff" : "#6b5000", fontSize: "11px", fontWeight: "800", whiteSpace: "nowrap" }}>{c.numero}. {c.titre}</span>
            </button>
          );
        })}
        <div style={{ width: "12px", flexShrink: 0 }} />
      </div>

      {/* Chapter content */}
      <div key={activeChap} className="chap-content" style={{ padding: "0 20px 100px" }}>
        <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", border: `2px solid ${chap.couleur}30`, borderRadius: "20px", padding: "18px", marginBottom: "16px", boxShadow: `0 4px 20px ${chap.couleur}15` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `${chap.couleur}18`, border: `2px solid ${chap.couleur}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 }}>{chap.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: chap.couleur, fontSize: "9px", fontWeight: "900", letterSpacing: "2px", marginBottom: "2px" }}>CHAPITRE {chap.numero}</div>
              <h2 style={{ color: "#1a1200", fontSize: "17px", fontWeight: "900", margin: 0, letterSpacing: "-0.3px", lineHeight: 1.2 }}>{chap.titre}</h2>
            </div>
          </div>
          <p style={{ color: "#6b5000", fontSize: "13px", margin: "0 0 10px", lineHeight: 1.6, fontWeight: "500" }}>{chap.resume}</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <span style={{ background: `${niveauColor(chap.niveau)}15`, border: `1px solid ${niveauColor(chap.niveau)}35`, color: niveauColor(chap.niveau), fontSize: "10px", fontWeight: "800", padding: "3px 10px", borderRadius: "20px" }}>● {chap.niveau}</span>
            <span style={{ background: "rgba(200,140,0,0.1)", border: "1px solid rgba(200,140,0,0.2)", color: "#8B6914", fontSize: "10px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px" }}>⏱ {chap.duree}</span>
          </div>
        </div>

        {chap.sections.map((section, i) => (
          <SectionBlock key={i} section={section} chapCouleur={chap.couleur} />
        ))}

        {idx === CHAPITRES.length - 1 && (
          <div style={{ background: "rgba(255,255,255,0.72)", border: "2px solid rgba(245,166,35,0.4)", borderRadius: "20px", padding: "24px", textAlign: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎉</div>
            <h3 style={{ color: "#1a1200", fontSize: "18px", fontWeight: "900", margin: "0 0 6px" }}>Guide terminé !</h3>
            <p style={{ color: "#6b5000", fontSize: "13px", margin: "0 0 16px", lineHeight: 1.6 }}>Vous êtes prêt à lancer votre présence professionnelle sur Yelen224.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/institution/inscription" style={{ background: "linear-gradient(135deg,#F5A623,#e8950f)", color: "#1a1200", fontWeight: "900", fontSize: "14px", padding: "14px", borderRadius: "14px", textDecoration: "none", textAlign: "center", boxShadow: "0 4px 16px rgba(245,166,35,0.4)" }}>Inscrire mon institution →</Link>
              <Link href="/contact" style={{ background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(200,140,0,0.25)", color: "#1a1200", fontWeight: "700", fontSize: "13px", padding: "13px", borderRadius: "14px", textDecoration: "none", textAlign: "center" }}>Parler à l&apos;équipe</Link>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={goPrev} disabled={idx === 0} style={{ flex: 1, padding: "13px", borderRadius: "14px", border: "1.5px solid rgba(200,140,0,0.25)", background: "rgba(255,255,255,0.6)", color: idx === 0 ? "rgba(140,100,0,0.3)" : "#6b5000", fontSize: "13px", fontWeight: "700", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.4 : 1 }}>← Précédent</button>
          <button onClick={goNext} disabled={idx === CHAPITRES.length - 1} style={{ flex: 1, padding: "13px", borderRadius: "14px", border: `1.5px solid ${chap.couleur}50`, background: `${chap.couleur}12`, color: idx === CHAPITRES.length - 1 ? "rgba(140,100,0,0.3)" : chap.couleur, fontSize: "13px", fontWeight: "800", cursor: idx === CHAPITRES.length - 1 ? "default" : "pointer", opacity: idx === CHAPITRES.length - 1 ? 0.4 : 1 }}>Suivant →</button>
        </div>
      </div>

      {/* Drawer */}
      {menuOpen && (
        <>
          <style>{`@keyframes drawerIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", animation: "fadeIn 0.2s ease" }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 301, width: "min(320px, 90vw)", background: "linear-gradient(160deg, #FFF8E0 0%, #FFF0B3 100%)", animation: "drawerIn 0.28s cubic-bezier(0.16,1,0.3,1) forwards", display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(200,140,0,0.15)" }}>
            <div style={{ padding: "20px", borderBottom: "1px solid rgba(200,140,0,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "#1a1200", fontSize: "14px", fontWeight: "900" }}>Chapitres</div>
                <div style={{ color: "#8B6914", fontSize: "11px", fontWeight: "600" }}>{CHAPITRES.length} chapitres · ~50 min</div>
              </div>
              <button onClick={() => setMenuOpen(false)} style={{ width: "30px", height: "30px", borderRadius: "50%", background: "rgba(200,140,0,0.1)", border: "1px solid rgba(200,140,0,0.2)", color: "#8B6914", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "8px" }}>
              {CHAPITRES.map((c) => {
                const isActive = activeChap === c.id;
                return (
                  <button key={c.id} onClick={() => { setActiveChap(c.id); setMenuOpen(false); }} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "12px",
                    padding: "12px", borderRadius: "14px", marginBottom: "4px",
                    border: isActive ? `1.5px solid ${c.couleur}50` : "1.5px solid transparent",
                    background: isActive ? `${c.couleur}12` : "transparent",
                    cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: isActive ? `${c.couleur}20` : "rgba(200,140,0,0.1)", color: isActive ? c.couleur : "#8B6914", fontSize: "11px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.numero}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: isActive ? c.couleur : "#1a1200", fontSize: "13px", fontWeight: "800", lineHeight: 1.2 }}>{c.icon} {c.titre}</div>
                      <div style={{ color: "#8B6914", fontSize: "10px", fontWeight: "600", marginTop: "2px" }}>{c.duree} · {c.niveau}</div>
                    </div>
                    {isActive && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.couleur, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "16px", borderTop: "1px solid rgba(200,140,0,0.15)" }}>
              <Link href="/institution/inscription" style={{ display: "block", textAlign: "center", background: "#F5A623", color: "#1a1200", fontWeight: "900", fontSize: "13px", padding: "13px", borderRadius: "14px", textDecoration: "none", boxShadow: "0 4px 14px rgba(245,166,35,0.35)" }}>S&apos;inscrire gratuitement →</Link>
            </div>
          </div>
        </>
      )}

      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </div>
  );
}

export default function GuidePrestatairePage() {
  return (
    <Suspense fallback={null}>
      <GuidePrestataireInner/>
    </Suspense>
  );
}