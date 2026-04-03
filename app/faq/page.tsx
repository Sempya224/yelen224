"use client";

import { useState } from "react";

// ── Data ────────────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: "general", label: "Général", icon: "🌍", color: "#F5A623",
    faqs: [
      { id: "g1", question: "C'est quoi Yelen224 exactement ?", reponse: `Yelen224 est la plateforme officielle de prise de rendez-vous de la République de Guinée. Elle connecte les citoyens guinéens — en Guinée et dans 54 pays — aux institutions de l'État, aux services publics, aux hôpitaux, aux banques, aux écoles et aux entreprises.\n\nSon nom vient du mot "Yelen" qui signifie "lumière" en Mandingue.\n\nYelen224 est développée par Sempya224, fondée à New York avec un siège à Conakry.`, liens: [{ label: "Accueil Yelen224", href: "/" }], tags: ["plateforme", "guinée", "état"] },
      { id: "g2", question: "Yelen224 est-elle gratuite pour les citoyens ?", reponse: `Oui — Yelen224 est 100% gratuite pour tous les citoyens guinéens.\n\nVous pouvez :\n• Créer votre compte gratuitement\n• Rechercher des institutions\n• Prendre des rendez-vous sans frais\n• Recevoir des confirmations SMS/email\n• Consulter les horaires et avis\n\nAucune carte bancaire n'est requise pour les citoyens.`, liens: [{ label: "Créer un compte gratuit", href: "/inscription" }], tags: ["gratuit", "compte", "citoyen"] },
      { id: "g3", question: "Dans quels pays Yelen224 est-elle disponible ?", reponse: `Yelen224 est accessible depuis n'importe quel pays avec une connexion internet.\n\n🇬🇳 Guinée — toutes les 8 régions et 33 préfectures\n🇫🇷 France — ambassade à Paris\n🇺🇸 États-Unis — consulat à New York\n🇧🇪 Belgique, 🇨🇦 Canada, 🇩🇪 Allemagne, 🇬🇧 Royaume-Uni\n🌍 Maroc, Sénégal, Côte d'Ivoire et 44 autres pays\n\nObjectif : couvrir les 54 pays de la diaspora guinéenne d'ici fin 2025.`, liens: [{ label: "Voir toutes les ambassades", href: "/recherche" }], tags: ["pays", "diaspora", "ambassade"] },
      { id: "g4", question: "Comment contacter l'équipe Yelen224 ?", reponse: `📍 Siège New York (Bronx)\n1895 Morris Avenue, 5ème étage, NY 10345\n📞 +1 347 301 6768\n\n📍 Siège Conakry (Guinée)\nCimenterie, Commune de Ratoma, 3ème étage\n📞 +224 624 35 46 00\n\n✉️ yelen224gn@gmail.com\n\nRéponse sous 24–48h ouvrées, lun–ven 8h–18h (GMT).`, liens: [{ label: "Formulaire de contact", href: "/contact" }], tags: ["contact", "équipe", "support"] },
      { id: "g5", question: "Qui a créé Yelen224 ?", reponse: `Yelen224 a été fondée par Aboubakar Balder et l'équipe Sempya224, basée à New York avec une présence opérationnelle à Conakry.\n\n🎯 Moderniser l'accès aux services publics guinéens\n🎯 Éliminer les longues files d'attente\n🎯 Connecter la diaspora guinéenne\n🎯 Digitaliser les rendez-vous officiels de l'État`, liens: [{ label: "Contacter l'équipe", href: "/contact" }], tags: ["fondateurs", "mission", "sempya224"] },
    ],
  },
  {
    id: "citoyen", label: "Citoyens", icon: "👤", color: "#22c55e",
    faqs: [
      { id: "c1", question: "Comment créer mon compte citoyen ?", reponse: `Moins de 2 minutes :\n\n1️⃣ Cliquez sur "S'inscrire"\n2️⃣ Entrez votre numéro de téléphone\n3️⃣ Recevez le code SMS\n4️⃣ Complétez votre profil (nom, prénom, ville)\n5️⃣ Compte activé — prenez vos RDV !\n\n⚠️ Utilisez un numéro valide pour vos confirmations de RDV.`, liens: [{ label: "Créer mon compte", href: "/inscription" }], tags: ["inscription", "compte", "SMS"] },
      { id: "c2", question: "Comment prendre un rendez-vous ?", reponse: `Simple et rapide :\n\n1️⃣ Connectez-vous\n2️⃣ Recherchez l'institution (hôpital, mairie, banque...)\n3️⃣ Consultez les disponibilités en temps réel\n4️⃣ Choisissez un créneau\n5️⃣ Confirmez votre RDV\n6️⃣ Recevez la confirmation par SMS et email\n\n📱 Rappel automatique 24h avant votre rendez-vous.`, liens: [{ label: "Rechercher une institution", href: "/recherche" }], tags: ["rendez-vous", "réservation", "créneau"] },
      { id: "c3", question: "Puis-je annuler ou modifier un RDV ?", reponse: `Oui, depuis votre espace personnel :\n\n✅ Annulation jusqu'à 2h avant le RDV\n✅ Modification : choisissez un autre créneau\n✅ Report pour une date ultérieure\n\nAllez dans "Mes rendez-vous" → cliquez sur le RDV → "Modifier" ou "Annuler".`, liens: [{ label: "Mes rendez-vous", href: "/mes-rdv" }], tags: ["annulation", "modification", "gestion"] },
      { id: "c4", question: "Comment laisser un avis ?", reponse: `Après chaque RDV effectué :\n\n1️⃣ Allez dans votre historique\n2️⃣ Cliquez sur le RDV passé\n3️⃣ Notez de 1 à 5 étoiles\n4️⃣ Rédigez votre commentaire (optionnel)\n5️⃣ Soumettez\n\n⭐ Vos avis aident d'autres citoyens et améliorent les services.`, tags: ["avis", "note", "commentaire"] },
      { id: "c5", question: "Mes données sont-elles sécurisées ?", reponse: `🔐 Chiffrement de bout en bout\n🔐 Authentification par SMS\n🔐 Serveurs Supabase (certifié ISO 27001)\n🔐 Accès limité aux institutions que vous choisissez\n🔐 Conformité RGPD\n\nVos données ne sont jamais vendues. Suppression du compte possible à tout moment.`, liens: [{ label: "Politique de confidentialité", href: "#" }], tags: ["sécurité", "données", "confidentialité"] },
      { id: "c6", question: "Comment trouver une institution ?", reponse: `🔍 Par nom : tapez le nom directement\n📍 Par ville / préfecture\n🏷️ Par catégorie : Hôpital, Banque, Mairie, École...\n⭐ Par note : les mieux notées d'abord\n\nAllez sur "Recherche" → entrez votre ville → sélectionnez la catégorie → parcourez les résultats.`, liens: [{ label: "Rechercher", href: "/recherche" }], tags: ["recherche", "localisation", "catégorie"] },
      { id: "c7", question: "J'ai perdu accès à mon numéro de téléphone", reponse: `1️⃣ Page de connexion → "Problème de connexion"\n2️⃣ Renseignez nom, prénom et email associé\n3️⃣ Vérification d'identité sous 24–48h\n4️⃣ Lien de récupération par email\n\n📞 Ou contactez-nous directement :\n+224 624 35 46 00 (Conakry)\n+1 347 301 6768 (New York)`, liens: [{ label: "Support", href: "/contact" }], tags: ["connexion", "récupération", "téléphone"] },
      { id: "c8", question: "Fonctionne sans smartphone ?", reponse: `Oui — Yelen224 fonctionne sur tous les appareils :\n\n💻 Ordinateur\n📱 Smartphone Android / iPhone\n📟 Tablette\n🖥️ Cybercafé\n\nAucune application à télécharger. Tout fonctionne depuis votre navigateur (Chrome, Firefox, Safari).\n\nLa confirmation sera envoyée par SMS sur votre téléphone.`, tags: ["smartphone", "ordinateur", "navigateur"] },
    ],
  },
  {
    id: "prestataire", label: "Prestataires", icon: "🤝", color: "#14b8a6",
    faqs: [
      { id: "p1", question: "Qui peut s'inscrire comme prestataire ?", reponse: `✅ Médecins, infirmiers, sages-femmes\n✅ Avocats, notaires, huissiers\n✅ Comptables, experts-comptables\n✅ Consultants et formateurs\n✅ Prestataires administratifs\n✅ Agences de voyage\n✅ Entrepreneurs et artisans\n✅ Associations et ONG\n\nEn Guinée ou dans la diaspora, rejoignez Yelen224.`, liens: [{ label: "Inscrire mon activité", href: "/institution/inscription" }], tags: ["prestataire", "professionnel"] },
      { id: "p2", question: "Comment s'inscrire comme prestataire ?", reponse: `1️⃣ Cliquez sur "Space Pro"\n2️⃣ Créez votre compte professionnel\n3️⃣ Remplissez votre profil (nom, catégorie, adresse)\n4️⃣ Ajoutez vos créneaux horaires\n5️⃣ Soumettez pour vérification\n6️⃣ Validation sous 48–72h\n7️⃣ En ligne — les citoyens prennent RDV !\n\n🎁 Essai gratuit : 2 mois Pro ou 3 mois Premium sans carte.`, liens: [{ label: "S'inscrire", href: "/institution/inscription" }], tags: ["inscription", "prestataire"] },
      { id: "p3", question: "Plan Pro 7$/mois vs Plan Premium 15$/mois ?", reponse: `⭐ PLAN PRO — 7$/mois\n🎁 2 mois gratuits, sans carte bancaire\n✅ Profil complet et personnalisé\n✅ Gestion des disponibilités\n✅ Notifications SMS/email automatiques\n✅ Badge prestataire vérifié\n✅ Statistiques de base\n✅ Support prioritaire 24h\n\n👑 PLAN PREMIUM — 15$/mois\n🎁 3 mois gratuits, sans carte bancaire\n✅ Tout le Pro, PLUS :\n✅ Position prioritaire dans la recherche\n✅ Statistiques avancées\n✅ Intégration diaspora et ambassades\n✅ Support 24h/24 – 7j/7\n✅ Accès API\n✅ Multi-utilisateurs (10 comptes staff)`, liens: [{ label: "Démarrer l'essai gratuit", href: "/institution/inscription" }], tags: ["pro", "premium", "tarifs"] },
      { id: "p4", question: "Comment fonctionne l'essai gratuit ?", reponse: `⭐ Plan PRO — 2 mois gratuits\n• Accès complet, aucune carte requise\n• Rappel 7 jours avant la fin\n• Aucun frais si vous ne continuez pas\n\n👑 Plan PREMIUM — 3 mois gratuits\n• Accès complet, aucune carte requise\n• Rappel 7 jours avant la fin\n• Aucun frais si vous ne continuez pas\n\n✅ Aucun prélèvement automatique sans votre accord explicite.`, liens: [{ label: "Démarrer mon essai", href: "/institution/inscription" }], tags: ["essai", "gratuit"] },
      { id: "p5", question: "Comment gérer mes RDV reçus ?", reponse: `📅 Vue agenda : jour, semaine ou mois\n🔔 Notifications en temps réel\n✅ Acceptez ou refusez les demandes\n📱 Rappels SMS automatiques aux clients\n📊 Historique complet\n\nVous pouvez aussi bloquer des dates (congés, jours fériés) depuis votre agenda.`, liens: [{ label: "Mon tableau de bord", href: "/institution/dashboard" }], tags: ["agenda", "gestion"] },
      { id: "p6", question: "Comment obtenir le badge 'Vérifié' ?", reponse: `1️⃣ Complétez votre profil à 100%\n2️⃣ Soumettez vos documents :\n   • Médecin : Diplôme + Ordre des médecins\n   • Avocat : Barreau de Conakry\n   • Entrepreneur : RCCM Guinée\n3️⃣ Vérification sous 2 à 5 jours ouvrés\n4️⃣ Badge visible sur votre profil\n\n⭐ Meilleure position + confiance accrue.`, tags: ["badge", "vérification"] },
      { id: "p7", question: "Comment recevoir des paiements ?", reponse: `💰 Modes acceptés par vos clients :\n• Mobile Money (Orange Money, MTN)\n• Carte bancaire (Visa, Mastercard)\n• PayPal (diaspora)\n• Paiement sur place\n\n⚠️ Paiements en ligne disponibles sur le Plan Premium uniquement.`, liens: [{ label: "Passer au Premium", href: "/institution/inscription" }], tags: ["paiement", "revenus", "mobile money"] },
    ],
  },
  {
    id: "institution", label: "Institutions", icon: "🏛️", color: "#3b82f6",
    faqs: [
      { id: "i1", question: "Comment inscrire mon institution officielle ?", reponse: `1️⃣ Cliquez sur "Inscrire mon institution"\n2️⃣ Remplissez le formulaire\n3️⃣ Soumettez les documents requis\n4️⃣ Vérification et validation sous 48–72h\n5️⃣ En ligne !\n\n📋 Documents requis :\n• Hôpital : Agrément Ministère de la Santé\n• École : Autorisation d'ouverture\n• Banque : Licence BCRG\n• Administration : Arrêté de création\n• Ambassade : Accréditation diplomatique`, liens: [{ label: "Inscrire mon institution", href: "/institution/inscription" }], tags: ["inscription", "institution"] },
      { id: "i2", question: "Comment gérer mes disponibilités ?", reponse: `📅 Configurez vos horaires d'ouverture\n📅 Définissez la durée des RDV (15min, 30min, 1h)\n📅 Bloquez des dates (jours fériés, fermetures)\n📅 Gérez plusieurs services\n📅 Voir les RDV en temps réel\n📅 Confirmer ou refuser des demandes\n\nAccessible 24h/24 depuis n'importe quel appareil.`, liens: [{ label: "Tableau de bord", href: "/institution/dashboard" }], tags: ["disponibilités", "créneaux"] },
      { id: "i3", question: "Badge Institution Vérifiée ?", reponse: `✅ Vérification des documents officiels\n✅ Confirmation de l'adresse physique\n✅ Validation des contacts\n✅ Vérification de la légalité\n\n⭐ Meilleure visibilité dans la recherche\n⭐ Badge visible sur votre profil public\n⭐ Confiance accrue des citoyens\n\nDélai : 2 à 5 jours ouvrés.`, tags: ["badge", "vérification"] },
      { id: "i4", question: "Comment gérer les avis citoyens ?", reponse: `📊 Depuis votre tableau de bord :\n• Votre note globale (sur 5 étoiles)\n• Tous les avis avec commentaires\n• Évolution de votre réputation\n\n💬 Répondez aux avis publiquement.\n\n🚨 Signalez les avis frauduleux — traitement sous 48h.`, liens: [{ label: "Mon tableau de bord", href: "/institution/dashboard" }], tags: ["avis", "réputation"] },
    ],
  },
  {
    id: "tarifs", label: "Tarifs", icon: "💰", color: "#a855f7",
    faqs: [
      { id: "t1", question: "Récapitulatif complet des tarifs", reponse: `🆓 CITOYEN — Gratuit à vie\n• Accès complet, RDV illimités, 0$/mois\n\n⭐ PRESTATAIRE PRO — 7$/mois\n🎁 2 mois d'essai gratuit\n• Profil complet, gestion créneaux, SMS/email, badge vérifié, stats, support 24h\n\n👑 PRESTATAIRE PREMIUM — 15$/mois\n🎁 3 mois d'essai gratuit\n• Tout le Pro + position prioritaire, annonces, stats avancées, API, multi-users (10 comptes), support 24h/7j`, liens: [{ label: "Démarrer mon essai", href: "/institution/inscription" }], tags: ["tarifs", "pro", "premium"] },
      { id: "t2", question: "Essai gratuit sans carte bancaire ?", reponse: `⭐ Plan PRO — 2 mois gratuits\n• Aucune carte requise\n• Rappel 7j avant la fin\n• Aucun frais si vous arrêtez\n\n👑 Plan PREMIUM — 3 mois gratuits\n• Aucune carte requise\n• Rappel 7j avant la fin\n• Aucun frais si vous arrêtez\n\n✅ Aucun prélèvement automatique sans votre accord.`, liens: [{ label: "Démarrer mon essai", href: "/institution/inscription" }], tags: ["essai", "gratuit", "sans carte"] },
      { id: "t3", question: "Comment payer mon abonnement ?", reponse: `💳 Carte bancaire (Visa, Mastercard)\n📱 Mobile Money (Orange Money, MTN)\n🏦 Virement bancaire (institutions gouvernementales)\n💵 PayPal (diaspora)\n\nFacturation mensuelle ou annuelle (2 mois offerts sur l'annuel).\nFacture officielle par email à chaque paiement.`, liens: [{ label: "Contact paiement", href: "/contact" }], tags: ["paiement", "mobile money"] },
      { id: "t4", question: "Changer ou annuler mon abonnement ?", reponse: `🔄 Changement de plan :\n• Pro → Premium : immédiat, différence proratisée\n• Premium → Pro : à la prochaine période\n\n❌ Annulation :\n• À tout moment depuis votre tableau de bord\n• Accès maintenu jusqu'à la fin de la période payée\n\n⚠️ Données conservées 90 jours après annulation.`, tags: ["annulation", "flexible"] },
    ],
  },
  {
    id: "technique", label: "Technique", icon: "🛠️", color: "#06b6d4",
    faqs: [
      { id: "tech1", question: "Fonctionne sur mobile sans application ?", reponse: `Oui — Yelen224 est optimisée mobile-first :\n\n📱 Chrome, Safari, Firefox mobile\n💻 Tablette et ordinateur\n\nConçue pour la majorité des utilisateurs guinéens qui accèdent via smartphone.\n\n✅ Recherche, prise de RDV, agenda, confirmations — tout fonctionne.\n\n📲 Application native iOS & Android en développement pour 2025.`, tags: ["mobile", "application"] },
      { id: "tech2", question: "Je ne reçois pas le SMS de vérification", reponse: `1️⃣ Vérifiez l'indicatif pays :\n   • Guinée : +224 6XX XX XX XX\n   • France : +33 6XX XX XX XX\n   • USA : +1 XXX XXX XXXX\n\n2️⃣ Attendez 2 à 3 minutes\n\n3️⃣ Cliquez "Renvoyer le code"\n\n4️⃣ Vérifiez que votre opérateur ne bloque pas les SMS internationaux\n\n5️⃣ Après 10 min, contactez-nous :\n📞 +224 624 35 46 00\n✉️ yelen224gn@gmail.com`, liens: [{ label: "Support", href: "/contact" }], tags: ["SMS", "vérification"] },
      { id: "tech3", question: "Comment signaler un bug ?", reponse: `📋 Préparez :\n• Description du problème\n• Page concernée\n• Appareil et navigateur utilisés\n• Capture d'écran si possible\n\n📤 Signalement :\n1. Formulaire de contact\n2. Email : yelen224gn@gmail.com — objet [BUG]\n3. Téléphone : +1 347 301 6768\n\n⚡ Bugs critiques traités sous 4h ouvrées.`, liens: [{ label: "Signaler un bug", href: "/contact" }], tags: ["bug", "problème"] },
    ],
  },
  {
    id: "diaspora", label: "Diaspora", icon: "✈️", color: "#f97316",
    faqs: [
      { id: "d1", question: "RDV dans une ambassade guinéenne depuis l'étranger ?", reponse: `1️⃣ Connectez-vous\n2️⃣ Recherche → "Ambassade / Consulat"\n3️⃣ Choisissez votre pays de résidence\n4️⃣ Sélectionnez l'ambassade la plus proche\n5️⃣ Choisissez le service\n6️⃣ Réservez votre créneau\n7️⃣ Confirmez et préparez vos documents\n\n🛂 Passeport, actes d'état civil, documents administratifs, assistance consulaire.`, liens: [{ label: "Trouver une ambassade", href: "/recherche" }], tags: ["ambassade", "diaspora", "consulat"] },
      { id: "d2", question: "Fonctionne avec une connexion lente ?", reponse: `Oui — optimisée pour la Guinée :\n\n✅ Fonctionne sur 2G et 3G\n✅ Pages légères, chargement rapide\n✅ Compatible forfaits data limités\n\nConseils :\n• Chrome "mode lite" sur Android\n• Préférez les heures creuses (tôt le matin)\n\n📶 Testé sur Orange Guinée, MTN et Cellcom.`, tags: ["connexion", "2G", "internet lent"] },
      { id: "d3", question: "Prendre RDV pour un proche en Guinée ?", reponse: `Oui — gérez les RDV à distance :\n\n👨‍👩‍👧 Depuis votre compte :\n• Prenez RDV pour un tiers\n• Renseignez ses coordonnées\n• Confirmation sur votre téléphone ET le sien\n\nCas fréquents :\n• Parent en France → RDV médical pour son enfant\n• Guinéen aux USA → renouvellement de passeport des parents\n\n⚠️ Pour les RDV officiels (passeport), présence physique obligatoire le jour J.`, liens: [{ label: "Prendre un RDV", href: "/recherche" }], tags: ["famille", "proche", "diaspora"] },
    ],
  },
];

// ── FAQ Item ─────────────────────────────────────────────────────────────────
function FAQItem({ faq, sectionColor }: { faq: { question: string; reponse: string; liens?: { href: string; label: string }[] }; sectionColor: string }) {
  const [open, setOpen] = useState(false);
  const [vote, setVote] = useState(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", textAlign: "left",
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(12px)",
          border: "1.5px solid rgba(255,255,255,0.85)",
          borderRadius: "18px",
          padding: "18px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px",
          cursor: "pointer",
          boxShadow: "0 2px 12px rgba(200,140,0,0.08)",
          transition: "transform 0.12s ease, box-shadow 0.12s ease",
        }}
        onTouchStart={e => { e.currentTarget.style.transform = "scale(0.98)"; }}
        onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
      >
        <span style={{ color: "#1a1200", fontSize: "15px", fontWeight: "700", lineHeight: 1.4, flex: 1, fontFamily: "'Sora', sans-serif" }}>
          {faq.question}
        </span>
        <div style={{
          width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
          background: `linear-gradient(135deg, ${sectionColor}22, ${sectionColor}44)`,
          border: `1.5px solid ${sectionColor}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sectionColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Bottom sheet panel */}
      {open && (
        <>
          <style>{`
            @keyframes sheetIn { from { transform: translateY(100%) } to { transform: translateY(0) } }
            @keyframes overlayIn { from { opacity: 0 } to { opacity: 1 } }
          `}</style>

          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(6px)",
              animation: "overlayIn 0.2s ease forwards",
            }}
          />

          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
            background: "linear-gradient(160deg, #FFF8E7 0%, #FFFBF0 100%)",
            borderRadius: "28px 28px 0 0",
            maxHeight: "88vh",
            display: "flex", flexDirection: "column",
            animation: "sheetIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            boxShadow: "0 -8px 48px rgba(200,140,0,0.15)",
          }}>
            {/* Handle bar */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px" }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "rgba(200,140,0,0.25)" }} />
            </div>

            {/* Sheet header */}
            <div style={{ padding: "8px 24px 16px", borderBottom: "1px solid rgba(200,140,0,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: sectionColor }} />
                <span style={{ color: sectionColor, fontSize: "10px", fontWeight: "800", letterSpacing: "2px", fontFamily: "'Sora', sans-serif" }}>RÉPONSE</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: "30px", height: "30px", borderRadius: "50%",
                  background: "rgba(200,140,0,0.08)", border: "1px solid rgba(200,140,0,0.15)",
                  color: "#8B6914", fontSize: "14px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >✕</button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: "auto", padding: "20px 24px 40px", flex: 1 }}>
              <h2 style={{ color: "#1a1200", fontSize: "18px", fontWeight: "900", lineHeight: 1.3, margin: "0 0 20px", fontFamily: "'Sora', sans-serif", letterSpacing: "-0.3px" }}>
                {faq.question}
              </h2>

              <div style={{
                color: "#5c4a1a", fontSize: "14px", lineHeight: 1.85,
                whiteSpace: "pre-line",
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(200,140,0,0.15)",
                borderRadius: "16px",
                padding: "18px",
                marginBottom: "16px",
                fontFamily: "'Sora', sans-serif",
              }}>
                {faq.reponse}
              </div>

              {/* Liens */}
              {(faq.liens?.length ?? 0) > 0 && (
                <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                 {faq.liens!.map(lien => (
                    <a key={lien.href} href={lien.href} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: `linear-gradient(135deg, ${sectionColor}18, ${sectionColor}08)`,
                      border: `1.5px solid ${sectionColor}30`,
                      color: sectionColor, fontSize: "13px", fontWeight: "700",
                      padding: "13px 18px", borderRadius: "14px", textDecoration: "none",
                      fontFamily: "'Sora', sans-serif",
                    }}>
                      <span>{lien.label}</span>
                      <span>→</span>
                    </a>
                  ))}
                </div>
              )}

              {/* Tags */}
              {faq.tags && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>
                  {faq.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: "11px", color: "#8B6914",
                      background: "rgba(200,140,0,0.1)", border: "1px solid rgba(200,140,0,0.2)",
                      padding: "3px 10px", borderRadius: "20px", fontFamily: "'Sora', sans-serif",
                    }}>#{tag}</span>
                  ))}
                </div>
              )}

              {/* Vote */}
              <div style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(200,140,0,0.15)", borderRadius: "16px", padding: "16px" }}>
                <p style={{ color: "#1a1200", fontSize: "13px", fontWeight: "700", margin: "0 0 12px", fontFamily: "'Sora', sans-serif" }}>
                  Cette réponse vous a-t-elle aidé ?
                </p>
                {!vote ? (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setVote("yes")} style={{
                      flex: 1, padding: "12px", borderRadius: "12px",
                      border: "1.5px solid rgba(34,197,94,0.3)",
                      background: "rgba(34,197,94,0.08)",
                      color: "#16a34a", fontSize: "14px", fontWeight: "700", cursor: "pointer",
                      fontFamily: "'Sora', sans-serif",
                    }}>👍 Oui !</button>
                    <button onClick={() => setVote("no")} style={{
                      flex: 1, padding: "12px", borderRadius: "12px",
                      border: "1.5px solid rgba(200,140,0,0.2)",
                      background: "rgba(200,140,0,0.05)",
                      color: "#8B6914", fontSize: "14px", fontWeight: "600", cursor: "pointer",
                      fontFamily: "'Sora', sans-serif",
                    }}>👎 Pas vraiment</button>
                  </div>
                ) : vote === "yes" ? (
                  <div style={{ textAlign: "center", padding: "10px" }}>
                    <div style={{ fontSize: "28px", marginBottom: "6px" }}>✅</div>
                    <p style={{ color: "#16a34a", fontSize: "13px", fontWeight: "700", margin: 0, fontFamily: "'Sora', sans-serif" }}>Merci ! Heureux d'avoir aidé.</p>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ color: "#8B6914", fontSize: "13px", margin: "0 0 10px", fontFamily: "'Sora', sans-serif" }}>Merci. Notre équipe peut vous aider.</p>
                    <a href="/contact" style={{
                      display: "inline-block", background: "#F5A623",
                      color: "#1a1200", fontWeight: "800", fontSize: "13px",
                      padding: "10px 22px", borderRadius: "12px", textDecoration: "none",
                      fontFamily: "'Sora', sans-serif",
                    }}>Contacter le support →</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FAQPage() {
  const [activeSection, setActiveSection] = useState("general");
  const [search, setSearch] = useState("");

  const currentSection = SECTIONS.find(s => s.id === activeSection);
  const filteredFAQs = search.trim()
    ? SECTIONS.flatMap(s => s.faqs).filter(f =>
        f.question.toLowerCase().includes(search.toLowerCase()) ||
        f.reponse.toLowerCase().includes(search.toLowerCase()) ||
        f.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : currentSection.faqs;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #FFF3CC 0%, #FFE680 35%, #FFDA40 65%, #FFF0B3 100%)",
      fontFamily: "'Sora', -apple-system, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        ::-webkit-scrollbar { display: none; }
        input::placeholder { color: rgba(140,100,0,0.45); }
        input:focus { outline: none; }
      `}</style>

      {/* Safe area top spacer */}
      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      {/* ── Hero ── */}
      <div style={{ padding: "28px 20px 0" }}>
        {/* Logo mini */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(245,166,35,0.4)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "900", color: "#1a1200", letterSpacing: "0.5px", lineHeight: 1 }}>YELEN<span style={{ color: "#c47a00" }}>224</span></div>
            <div style={{ fontSize: "8px", color: "#8B6914", letterSpacing: "1.5px", fontWeight: "600" }}>CENTRE D'AIDE</div>
          </div>
        </div>

        <h1 style={{ fontSize: "28px", fontWeight: "900", color: "#1a1200", margin: "0 0 6px", letterSpacing: "-0.8px", lineHeight: 1.1 }}>
          Questions<br /><span style={{ color: "#c47a00" }}>fréquentes</span>
        </h1>
        <p style={{ color: "#6b5000", fontSize: "13px", margin: "0 0 20px", lineHeight: 1.6 }}>
          Citoyens, prestataires, institutions & diaspora guinéenne.
        </p>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: "24px" }}>
          <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", pointerEvents: "none" }}>🔍</div>
          <input
            type="text"
            placeholder="Rechercher une question..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "14px 44px 14px 44px",
              borderRadius: "16px",
              border: "2px solid rgba(255,255,255,0.9)",
              background: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(12px)",
              color: "#1a1200", fontSize: "14px", fontFamily: "'Sora', sans-serif",
              fontWeight: "500",
              boxShadow: "0 4px 20px rgba(200,140,0,0.12)",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "#8B6914", fontSize: "16px", padding: "4px",
            }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Section tabs (horizontal scroll) ── */}
      {!search && (
        <div style={{ overflowX: "auto", paddingLeft: "20px", paddingBottom: "4px", marginBottom: "16px", display: "flex", gap: "8px", scrollbarWidth: "none" }}>
          {SECTIONS.map(section => {
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                style={{
                  flexShrink: 0,
                  padding: "9px 16px",
                  borderRadius: "20px",
                  border: isActive ? `2px solid ${section.color}` : "2px solid rgba(255,255,255,0.6)",
                  background: isActive ? section.color : "rgba(255,255,255,0.6)",
                  color: isActive ? "#fff" : "#6b5000",
                  fontSize: "12px", fontWeight: "700",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "5px",
                  fontFamily: "'Sora', sans-serif",
                  boxShadow: isActive ? `0 4px 14px ${section.color}44` : "none",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: "14px" }}>{section.icon}</span>
                {section.label}
              </button>
            );
          })}
          <div style={{ width: "12px", flexShrink: 0 }} />
        </div>
      )}

      {/* ── FAQ list ── */}
      <div style={{ padding: "0 20px 100px" }}>
        {/* Search result count */}
        {search && (
          <p style={{ color: "#6b5000", fontSize: "12px", marginBottom: "14px", fontWeight: "600" }}>
            {filteredFAQs.length} résultat{filteredFAQs.length !== 1 ? "s" : ""} pour « {search} »
          </p>
        )}

        {/* Section title */}
        {!search && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <span style={{ fontSize: "22px" }}>{currentSection.icon}</span>
            <div>
              <h2 style={{ color: "#1a1200", fontSize: "17px", fontWeight: "900", margin: 0, letterSpacing: "-0.3px" }}>{currentSection.label}</h2>
              <p style={{ color: "#8B6914", fontSize: "11px", margin: 0, fontWeight: "600" }}>{currentSection.faqs.length} questions</p>
            </div>
          </div>
        )}

        {filteredFAQs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredFAQs.map(faq => {
              const sec = SECTIONS.find(s => s.faqs.some(f => f.id === faq.id));
              return <FAQItem key={faq.id} faq={faq} sectionColor={sec?.color || "#F5A623"} />;
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔍</div>
            <h3 style={{ color: "#1a1200", fontSize: "16px", fontWeight: "900", margin: "0 0 8px" }}>Aucune question trouvée</h3>
            <p style={{ color: "#6b5000", fontSize: "13px", maxWidth: "280px", margin: "0 auto 20px", lineHeight: 1.6 }}>
              Contactez directement notre équipe.
            </p>
            <a href="/contact" style={{ display: "inline-block", background: "#F5A623", color: "#1a1200", fontWeight: "800", fontSize: "14px", padding: "13px 28px", borderRadius: "16px", textDecoration: "none", fontFamily: "'Sora', sans-serif", boxShadow: "0 4px 16px rgba(245,166,35,0.4)" }}>
              Contacter le support →
            </a>
          </div>
        )}

        {/* Bottom CTA */}
        {!search && (
          <div style={{ marginTop: "32px", background: "rgba(255,255,255,0.65)", backdropFilter: "blur(12px)", border: "1.5px solid rgba(255,255,255,0.9)", borderRadius: "24px", padding: "24px", textAlign: "center", boxShadow: "0 4px 24px rgba(200,140,0,0.1)" }}>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>💬</div>
            <h3 style={{ color: "#1a1200", fontSize: "16px", fontWeight: "900", margin: "0 0 6px" }}>Votre question n'est pas ici ?</h3>
            <p style={{ color: "#6b5000", fontSize: "12px", maxWidth: "280px", margin: "0 auto 16px", lineHeight: 1.6 }}>
              Disponible lun–ven 8h–18h GMT depuis Conakry et New York.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <a href="/contact" style={{ background: "#F5A623", color: "#1a1200", fontWeight: "800", fontSize: "14px", padding: "14px 24px", borderRadius: "16px", textDecoration: "none", fontFamily: "'Sora', sans-serif", boxShadow: "0 4px 16px rgba(245,166,35,0.35)" }}>
                Nous contacter →
              </a>
              <a href="tel:+13473016768" style={{ background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(200,140,0,0.25)", color: "#1a1200", fontWeight: "700", fontSize: "13px", padding: "13px 24px", borderRadius: "16px", textDecoration: "none", fontFamily: "'Sora', sans-serif" }}>
                📞 +1 347 301 6768
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Safe area bottom */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </div>
  );
}