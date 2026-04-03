"use client";

import Link from "next/link";

export default function CGUPage() {
  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#ffffff",
      color: "#1a1a1a",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .legal-wrap {
          max-width: 820px;
          margin: 0 auto;
          padding: 64px 40px 0;
        }

        .page-eyebrow {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #F5A623;
          margin-bottom: 10px;
        }
        .page-title {
          font-size: 32px;
          font-weight: 800;
          color: #0a0a0a;
          letter-spacing: -0.5px;
          line-height: 1.15;
          margin-bottom: 10px;
        }
        .page-meta {
          font-size: 13px;
          color: #888;
          padding-bottom: 28px;
          border-bottom: 2px solid #F5A623;
          margin-bottom: 52px;
        }

        .legal-section {
          margin-bottom: 52px;
        }
        .legal-section h2 {
          font-size: 15px;
          font-weight: 700;
          color: #F5A623;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          margin-bottom: 18px;
          padding-bottom: 10px;
          border-bottom: 1px solid #f0f0f0;
        }
        .legal-section h3 {
          font-size: 14px;
          font-weight: 700;
          color: #111;
          margin: 24px 0 10px;
        }
        .legal-section p {
          font-size: 14px;
          line-height: 1.8;
          color: #3a3a3a;
          margin-bottom: 14px;
        }
        .legal-section ul {
          margin: 8px 0 16px 0;
          padding: 0;
          list-style: none;
        }
        .legal-section ul li {
          font-size: 14px;
          line-height: 1.75;
          color: #3a3a3a;
          padding: 4px 0 4px 18px;
          position: relative;
        }
        .legal-section ul li::before {
          content: "—";
          position: absolute;
          left: 0;
          color: #F5A623;
          font-weight: 700;
        }

        .engagement-block {
          background: #fffbf0;
          border: 1px solid rgba(245,166,35,0.3);
          border-left: 4px solid #F5A623;
          border-radius: 0 6px 6px 0;
          padding: 18px 22px;
          margin: 20px 0 24px;
        }
        .engagement-block p {
          font-size: 14px;
          color: #2a2a2a;
          font-weight: 500;
          margin: 0;
          line-height: 1.7;
        }

        .tarif-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0 20px;
        }
        .tarif-box {
          border: 1px solid #ebebeb;
          border-radius: 6px;
          padding: 18px 20px;
        }
        .tarif-box .tarif-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #F5A623;
          margin-bottom: 6px;
          display: block;
        }
        .tarif-box .tarif-price {
          font-size: 22px;
          font-weight: 800;
          color: #111;
          margin-bottom: 4px;
        }
        .tarif-box .tarif-trial {
          font-size: 11px;
          color: #888;
          margin-bottom: 14px;
        }
        .tarif-box ul {
          margin: 0;
        }
        .tarif-box ul li {
          font-size: 13px;
          color: #444;
          padding: 3px 0 3px 16px;
          margin: 0;
        }
        .tarif-box ul li::before {
          content: "—";
          position: absolute;
          left: 0;
          color: #F5A623;
          font-weight: 700;
          font-size: 12px;
        }

        .contact-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0 20px;
        }
        .contact-box {
          background: #f7f7f7;
          border: 1px solid #ebebeb;
          border-radius: 6px;
          padding: 16px 18px;
        }
        .contact-box .label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #F5A623;
          margin-bottom: 10px;
          display: block;
        }
        .contact-box p {
          font-size: 13px;
          line-height: 1.65;
          color: #333;
          margin: 0;
        }

        .legal-footer {
          margin-top: 80px;
          border-top: 1px solid #e0e0e0;
          background: #fafafa;
        }
        .legal-footer-inner {
          max-width: 820px;
          margin: 0 auto;
          padding: 32px 40px;
        }
        .footer-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 40px;
          margin-bottom: 28px;
          padding-bottom: 28px;
          border-bottom: 1px solid #e8e8e8;
        }
        .footer-brand strong {
          font-size: 13px;
          font-weight: 800;
          color: #111;
          display: block;
          margin-bottom: 3px;
          letter-spacing: 0.3px;
        }
        .footer-brand span {
          font-size: 11px;
          color: #F5A623;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .footer-links-group {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .footer-links-group .group-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #bbb;
          margin-bottom: 8px;
        }
        .footer-links-group a {
          font-size: 13px;
          color: #555;
          text-decoration: none;
          line-height: 1.7;
          transition: color 0.15s;
        }
        .footer-links-group a:hover { color: #F5A623; }
        .footer-links-group a.active {
          color: #F5A623;
          font-weight: 600;
        }
        .footer-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .footer-copy { font-size: 11px; color: #bbb; }
        .footer-version { font-size: 11px; color: #ccc; }

        @media (max-width: 640px) {
          .legal-wrap { padding: 40px 20px 0; }
          .contact-grid, .tarif-grid { grid-template-columns: 1fr; }
          .page-title { font-size: 24px; }
          .footer-top { flex-direction: column; gap: 28px; }
          .legal-footer-inner { padding: 28px 20px; }
        }
      `}</style>

      <div className="legal-wrap">

        <p className="page-eyebrow">Document officiel — République de Guinée</p>
        <h1 className="page-title">Conditions Générales d'Utilisation</h1>
        <p className="page-meta">
          Yelen224 — Opéré par Sempya224 &nbsp;&nbsp;|&nbsp;&nbsp; Version 1.0 &nbsp;&nbsp;|&nbsp;&nbsp; En vigueur depuis Mars 2025
        </p>

        {/* Article 1 */}
        <section className="legal-section">
          <h2>Article 1 — Objet et champ d'application</h2>
          <p>
            Les présentes Conditions Générales d'Utilisation (ci-après "CGU") régissent l'accès et l'utilisation de la plateforme Yelen224, accessible à l'adresse <strong>https://yelen224.com</strong>, ainsi que toutes ses sous-pages, applications et services associés.
          </p>
          <p>
            Yelen224 est une plateforme numérique de prise de rendez-vous officielle, développée et opérée par Sempya224, société technologique dont le siège social est établi au 1895 Morris Avenue, 5ème étage, Bronx, New York 10345, États-Unis, avec une représentation opérationnelle à Conakry, Commune de Ratoma, Cimenterie, 3ème étage, République de Guinée.
          </p>
          <p>
            En accédant à la plateforme Yelen224 et en utilisant ses services, l'utilisateur reconnaît avoir lu, compris et accepté sans réserve l'intégralité des présentes CGU. Si l'utilisateur n'accepte pas ces conditions, il lui est demandé de ne pas utiliser la plateforme.
          </p>
          <p>
            Yelen224 se réserve le droit de modifier les présentes CGU à tout moment. Les modifications entrent en vigueur dès leur publication sur la plateforme. L'utilisation continue de la plateforme après modification vaut acceptation des nouvelles conditions.
          </p>
        </section>

        {/* Article 2 */}
        <section className="legal-section">
          <h2>Article 2 — Définitions</h2>
          <ul>
            <li><strong>Plateforme</strong> — le site web Yelen224 accessible à l'adresse https://yelen224.com, ses applications mobiles et l'ensemble de ses services numériques</li>
            <li><strong>Utilisateur</strong> — toute personne physique accédant à la plateforme, qu'il soit citoyen, prestataire ou représentant d'une institution</li>
            <li><strong>Citoyen</strong> — tout utilisateur inscrit sur la plateforme pour prendre des rendez-vous auprès des institutions et prestataires</li>
            <li><strong>Prestataire</strong> — tout professionnel ou structure privée proposant ses services via la plateforme dans le cadre d'un abonnement Pro ou Premium</li>
            <li><strong>Institution</strong> — toute entité publique ou privée officielle (hôpital, mairie, banque, ambassade, école, tribunal, etc.) inscrite sur la plateforme</li>
            <li><strong>Rendez-vous (RDV)</strong> — le créneau horaire réservé par un citoyen auprès d'une institution ou d'un prestataire via la plateforme</li>
            <li><strong>Compte</strong> — l'espace personnel créé par l'utilisateur sur la plateforme</li>
            <li><strong>Contenu</strong> — tout texte, image, donnée, information ou élément publié sur la plateforme</li>
            <li><strong>Sempya224</strong> — la société éditrice et opératrice de la plateforme Yelen224</li>
          </ul>
        </section>

        {/* Article 3 */}
        <section className="legal-section">
          <h2>Article 3 — Accès à la plateforme et création de compte</h2>

          <h3>3.1 Accès général</h3>
          <p>L'accès à la plateforme Yelen224 est libre et gratuit pour tout utilisateur disposant d'une connexion internet. Certaines fonctionnalités nécessitent la création d'un compte.</p>

          <h3>3.2 Création de compte citoyen</h3>
          <p>La création d'un compte citoyen est gratuite et ouverte à toute personne physique. Pour créer un compte, l'utilisateur doit :</p>
          <ul>
            <li>Fournir un numéro de téléphone valide (guinéen ou international)</li>
            <li>Valider son identité via un code SMS de vérification</li>
            <li>Compléter son profil avec son nom, prénom et ville de résidence</li>
          </ul>

          <h3>3.3 Création de compte prestataire ou institution</h3>
          <ul>
            <li>Fourniture d'informations exactes sur l'activité ou l'institution</li>
            <li>Soumission des documents justificatifs requis selon la catégorie</li>
            <li>Validation par l'équipe Yelen224 sous 48 à 72 heures ouvrées</li>
            <li>Acceptation des conditions tarifaires applicables</li>
          </ul>

          <h3>3.4 Obligations de l'utilisateur</h3>
          <ul>
            <li>Fournir des informations exactes, complètes et à jour lors de son inscription</li>
            <li>Maintenir la confidentialité de ses identifiants de connexion</li>
            <li>Ne pas créer plusieurs comptes pour un même usage</li>
            <li>Ne pas utiliser le compte d'un tiers sans autorisation</li>
            <li>Signaler immédiatement toute utilisation non autorisée de son compte</li>
          </ul>

          <h3>3.5 Suspension et résiliation</h3>
          <p>
            Yelen224 se réserve le droit de suspendre ou de supprimer tout compte en cas de violation des présentes CGU, d'utilisation frauduleuse, de comportement abusif ou de fourniture d'informations erronées, sans préavis ni indemnité.
          </p>
        </section>

        {/* Article 4 */}
        <section className="legal-section">
          <h2>Article 4 — Description des services</h2>

          <h3>4.1 Services aux citoyens (gratuits)</h3>
          <ul>
            <li>Recherche d'institutions et de prestataires vérifiés</li>
            <li>Consultation des profils, horaires, services et avis</li>
            <li>Prise de rendez-vous en ligne avec confirmation SMS et email</li>
            <li>Gestion de l'historique de rendez-vous</li>
            <li>Rappels automatiques avant les rendez-vous</li>
            <li>Notation et avis sur les institutions et prestataires</li>
            <li>Accès aux ambassades et consulats guinéens depuis la diaspora</li>
          </ul>

          <h3>4.2 Services aux prestataires et institutions (payants)</h3>
          <div className="tarif-grid">
            <div className="tarif-box">
              <span className="tarif-label">Plan Pro</span>
              <div className="tarif-price">7 USD<span style={{ fontSize: "13px", fontWeight: "400", color: "#888" }}>/mois</span></div>
              <div className="tarif-trial">2 mois d'essai gratuit</div>
              <ul>
                <li>Profil professionnel complet et personnalisé</li>
                <li>Gestion des disponibilités et créneaux</li>
                <li>Notifications SMS/email automatiques</li>
                <li>Badge "Prestataire Vérifié" Yelen224</li>
                <li>Statistiques de base</li>
                <li>Support prioritaire</li>
              </ul>
            </div>
            <div className="tarif-box" style={{ borderColor: "rgba(245,166,35,0.4)" }}>
              <span className="tarif-label">Plan Premium</span>
              <div className="tarif-price">15 USD<span style={{ fontSize: "13px", fontWeight: "400", color: "#888" }}>/mois</span></div>
              <div className="tarif-trial">3 mois d'essai gratuit</div>
              <ul>
                <li>Toutes les fonctionnalités Pro</li>
                <li>Position prioritaire dans les résultats</li>
                <li>Annonces et communications officielles</li>
                <li>Statistiques avancées et rapports</li>
                <li>Intégration ambassades et diaspora</li>
                <li>Support dédié 24h/24 — 7j/7</li>
                <li>Accès à l'API Yelen224</li>
                <li>Gestion multi-utilisateurs (10 comptes staff)</li>
              </ul>
            </div>
          </div>

          <h3>4.3 Essais gratuits</h3>
          <p>
            Les essais gratuits sont accordés sans carte bancaire requise. À l'issue de la période d'essai, aucun prélèvement automatique n'est effectué sans l'accord explicite de l'utilisateur. Yelen224 envoie un rappel par email 7 jours avant la fin de l'essai.
          </p>
        </section>

        {/* Article 5 */}
        <section className="legal-section">
          <h2>Article 5 — Obligations et responsabilités des utilisateurs</h2>

          <h3>5.1 Utilisation loyale de la plateforme</h3>
          <p>L'utilisateur s'engage à utiliser la plateforme de manière loyale, conforme à sa destination et dans le respect des lois et réglementations applicables. Il est notamment interdit de :</p>
          <ul>
            <li>Publier des informations fausses, trompeuses ou frauduleuses</li>
            <li>Utiliser la plateforme à des fins illicites ou contraires à l'ordre public</li>
            <li>Tenter d'accéder de manière non autorisée aux systèmes informatiques de Yelen224</li>
            <li>Diffuser des virus, malwares ou tout code informatique malveillant</li>
            <li>Harceler, menacer ou insulter d'autres utilisateurs</li>
            <li>Utiliser des robots ou systèmes automatisés sans autorisation</li>
            <li>Reproduire ou exploiter commercialement tout ou partie de la plateforme sans autorisation écrite</li>
          </ul>

          <h3>5.2 Responsabilité des prestataires et institutions</h3>
          <p>Les prestataires et institutions inscrits sont seuls responsables de l'exactitude et de la mise à jour de leurs informations, du respect de leurs engagements de rendez-vous, de la qualité des services proposés, et du respect des réglementations professionnelles applicables.</p>

          <h3>5.3 Avis et notations</h3>
          <p>
            Les utilisateurs s'engagent à ne publier que des avis sincères, basés sur leur expérience réelle. Tout avis frauduleux, diffamatoire ou non fondé peut être signalé et supprimé. Yelen224 modère les avis avant publication et se réserve le droit de supprimer tout contenu inapproprié.
          </p>
        </section>

        {/* Article 6 */}
        <section className="legal-section">
          <h2>Article 6 — Paiements et abonnements</h2>

          <h3>6.1 Tarification</h3>
          <p>Les tarifs des abonnements professionnels sont indiqués en dollars américains (USD) et peuvent être modifiés par Yelen224 avec un préavis de 30 jours. Les modifications de tarif ne s'appliquent pas aux abonnements en cours jusqu'à leur renouvellement.</p>

          <h3>6.2 Modes de paiement acceptés</h3>
          <ul>
            <li>Carte bancaire (Visa, Mastercard)</li>
            <li>Mobile Money (Orange Money, MTN Guinée)</li>
            <li>Virement bancaire (pour les institutions gouvernementales)</li>
            <li>PayPal (pour les utilisateurs de la diaspora)</li>
          </ul>

          <h3>6.3 Facturation</h3>
          <p>La facturation est effectuée mensuellement ou annuellement selon le choix de l'abonné. Une facture officielle est émise pour chaque paiement et envoyée automatiquement par email.</p>

          <h3>6.4 Remboursements</h3>
          <p>Sauf en cas de défaillance technique imputable à Yelen224, les paiements effectués ne sont pas remboursables pour la période en cours. En cas de litige, l'utilisateur peut contacter l'équipe Yelen224 à <strong>contact@yelen224.com</strong>.</p>

          <h3>6.5 Résiliation de l'abonnement</h3>
          <p>L'abonné peut résilier son abonnement à tout moment depuis son tableau de bord. L'accès aux fonctionnalités payantes est maintenu jusqu'à la fin de la période payée. Les données sont conservées pendant 90 jours après la résiliation, délai pendant lequel l'abonné peut réactiver son compte.</p>
        </section>

        {/* Article 7 */}
        <section className="legal-section">
          <h2>Article 7 — Protection des données personnelles</h2>
          <div className="engagement-block">
            <p>Yelen224 <strong>ne vend jamais</strong> les données personnelles des utilisateurs à des tiers. Pour toute information sur le traitement de vos données, consultez notre <Link href="/confidentialite" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "600" }}>Politique de Confidentialité</Link>.</p>
          </div>

          <h3>7.1 Données collectées</h3>
          <ul>
            <li>Nom, prénom et numéro de téléphone (obligatoires à l'inscription)</li>
            <li>Ville de résidence et pays</li>
            <li>Historique des rendez-vous pris via la plateforme</li>
            <li>Avis et notations publiés</li>
            <li>Données de navigation et d'utilisation</li>
          </ul>

          <h3>7.2 Sécurité</h3>
          <ul>
            <li>Chiffrement de bout en bout des données sensibles</li>
            <li>Authentification par SMS — aucun mot de passe stocké en clair</li>
            <li>Hébergement sécurisé via Supabase (certifié ISO 27001)</li>
            <li>Accès aux données limité au personnel autorisé</li>
          </ul>

          <h3>7.3 Droits des utilisateurs</h3>
          <p>
            Tout utilisateur dispose des droits d'accès, de rectification, d'effacement, de portabilité et d'opposition. Pour les exercer : <strong>contact@yelen224.com</strong>
          </p>
        </section>

        {/* Article 8 */}
        <section className="legal-section">
          <h2>Article 8 — Propriété intellectuelle</h2>

          <h3>8.1 Droits de Yelen224</h3>
          <p>
            L'ensemble des éléments constituant la plateforme Yelen224 — notamment le nom, le logo, la charte graphique, les textes, les fonctionnalités, le code source, les bases de données et l'architecture — sont la propriété exclusive de Sempya224 et sont protégés par les lois applicables en matière de propriété intellectuelle.
          </p>
          <p>Toute reproduction, modification, publication ou exploitation de tout ou partie de ces éléments sans autorisation préalable écrite de Sempya224 est strictement interdite.</p>

          <h3>8.2 Contenu des utilisateurs</h3>
          <p>Les utilisateurs conservent la propriété des contenus qu'ils publient sur la plateforme. En publiant un contenu, l'utilisateur accorde à Yelen224 une licence non exclusive, mondiale et gratuite pour utiliser, reproduire, afficher et distribuer ce contenu dans le cadre du fonctionnement de la plateforme.</p>

          <h3>8.3 Marques</h3>
          <p>Les marques "Yelen224" et "Sempya224", ainsi que les logos associés, sont des marques déposées. Leur utilisation sans autorisation préalable écrite est interdite.</p>
        </section>

        {/* Article 9 */}
        <section className="legal-section">
          <h2>Article 9 — Limitation de responsabilité</h2>

          <h3>9.1 Disponibilité de la plateforme</h3>
          <p>Yelen224 s'efforce d'assurer la disponibilité de la plateforme 24h/24 et 7j/7. Toutefois, Yelen224 ne peut garantir une disponibilité sans interruption et se réserve le droit d'effectuer des opérations de maintenance.</p>

          <h3>9.2 Contenu tiers</h3>
          <p>Yelen224 n'est pas responsable du contenu publié par les institutions et prestataires inscrits sur la plateforme. Chaque institution ou prestataire est seul responsable de l'exactitude et de la mise à jour de ses informations.</p>

          <h3>9.3 Rendez-vous</h3>
          <p>Yelen224 agit en tant qu'intermédiaire technique entre les citoyens et les institutions/prestataires. Yelen224 n'est pas responsable du non-respect d'un rendez-vous par une institution ou un prestataire, ni de la qualité des services fournis.</p>

          <h3>9.4 Dommages indirects</h3>
          <p>En aucun cas Yelen224 ne peut être tenue responsable des dommages indirects, pertes de données, pertes de revenus ou préjudices de toute nature résultant de l'utilisation ou de l'impossibilité d'utiliser la plateforme.</p>
        </section>

        {/* Article 10 */}
        <section className="legal-section">
          <h2>Article 10 — Droit applicable et résolution des litiges</h2>

          <h3>10.1 Droit applicable</h3>
          <p>Les présentes CGU sont régies par le droit de la République de Guinée, complété en tant que de besoin par le droit américain applicable à l'État de New York, siège social de Sempya224.</p>

          <h3>10.2 Résolution amiable</h3>
          <p>En cas de litige, l'utilisateur est invité à contacter en premier lieu l'équipe Yelen224 afin de trouver une solution amiable. Yelen224 s'engage à répondre à toute réclamation sous 5 jours ouvrés.</p>

          <div className="contact-grid">
            <div className="contact-box">
              <span className="label">Email</span>
              <p>contact@yelen224.com<br />Objet : [LITIGE CGU]</p>
            </div>
            <div className="contact-box">
              <span className="label">Téléphone</span>
              <p>+1 347 301 6768 (New York)<br />+224 624 35 46 00 (Conakry)</p>
            </div>
          </div>

          <h3>10.3 Juridiction compétente</h3>
          <p>À défaut de résolution amiable dans un délai de 30 jours, tout litige sera soumis à la compétence exclusive des tribunaux compétents de Conakry, République de Guinée, ou des tribunaux de New York, États-Unis, selon la résidence de l'utilisateur.</p>
        </section>

        {/* Article 11 */}
        <section className="legal-section">
          <h2>Article 11 — Contact et informations légales</h2>
          <div className="contact-grid">
            <div className="contact-box">
              <span className="label">Siège social — New York</span>
              <p>Sempya224<br />1895 Morris Avenue, 5ème étage<br />Bronx, New York 10345, États-Unis<br />+1 347 301 6768</p>
            </div>
            <div className="contact-box">
              <span className="label">Représentation — Conakry</span>
              <p>Cimenterie, Commune de Ratoma<br />3ème étage, Conakry<br />République de Guinée<br />+224 624 35 46 00</p>
            </div>
          </div>
          <p><strong>Directeur de la publication :</strong> Aboubakar Balder</p>
          <p><strong>Email :</strong> contact@yelen224.com</p>
          <p><strong>Hébergement :</strong> Supabase Inc., San Francisco, CA, États-Unis</p>
        </section>

      </div>

      {/* ── FOOTER ── */}
      <footer className="legal-footer">
        <div className="legal-footer-inner">
          <div className="footer-top">

            <div className="footer-brand">
              <strong>YELEN224</strong>
              <span>République de Guinée</span>
            </div>

            <div style={{ display: "flex", gap: "48px", flexWrap: "wrap" }}>
              <div className="footer-links-group">
                <span className="group-label">Mentions légales</span>
                <Link href="/confidentialite">Politique de confidentialité</Link>
                <Link href="/cgu" className="active">Conditions générales d'utilisation</Link>
                <Link href="/cookies">Politique des cookies</Link>
              </div>
              <div className="footer-links-group">
                <span className="group-label">Plateforme</span>
                <Link href="/">Accueil</Link>
                <Link href="/faq">Centre d'aide</Link>
                <Link href="/contact">Contact</Link>
              </div>
              <div className="footer-links-group">
                <span className="group-label">Éditeur</span>
                <a href="https://sempya224.com" target="_blank" rel="noreferrer">Sempya224</a>
                <a href="mailto:contact@yelen224.com">contact@yelen224.com</a>
              </div>
            </div>

          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© {new Date().getFullYear()} YELEN224 — Sempya224. Tous droits réservés.</span>
            <span className="footer-version">Version 1.0 — Mars 2025</span>
          </div>
        </div>
      </footer>

    </div>
  );
}