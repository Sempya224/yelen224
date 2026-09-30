"use client";

// Migré dans le route group (legal) — chantier Legal Yelen, architecture
// globale de navigation (23/09/2026). Header/footer de site retirés
// (fournis par app/(legal)/layout.tsx). Contenu juridique inchangé.
// Lot 5 — migration modèle A (23/09/2026) : même traitement que CGU (Lot
// 4) — document sans tableau SECTIONS ni id d'ancre au départ,
// LegalTableOfContents ajouté pour la première fois. TOC_SECTIONS ne
// duplique que numero/titre pour la navigation, les <h2> restent
// inchangés. Aucun emoji dans ce document.
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { LEGAL_LAST_UPDATED_LABEL } from "@/lib/legalVersions";
import { LegalTableOfContents } from "../_components/LegalTableOfContents";

const TOC_SECTIONS = [
  { id: "introduction", numero: "1", titre: "Introduction et engagement" },
  { id: "responsable-traitement", numero: "2", titre: "Responsable du traitement" },
  { id: "donnees-collectees", numero: "3", titre: "Données collectées" },
  { id: "finalites", numero: "4", titre: "Finalités du traitement" },
  { id: "partage-destinataires", numero: "5", titre: "Partage et destinataires des données" },
  { id: "duree-conservation", numero: "6", titre: "Durée de conservation" },
  { id: "securite-donnees", numero: "7", titre: "Sécurité des données" },
  { id: "vos-droits", numero: "8", titre: "Vos droits sur vos données" },
  { id: "cookies", numero: "9", titre: "Cookies et technologies similaires" },
  { id: "protection-mineurs", numero: "10", titre: "Protection des mineurs" },
  { id: "modifications", numero: "11", titre: "Modifications de la politique" },
  { id: "contact", numero: "12", titre: "Contact et réclamations" },
];

export default function ConfidentialitePage() {
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  return (
    <>
      <style>{`
        .legal-wrap {
          max-width: 820px;
          margin: 0 auto;
          padding: 24px 24px 0;
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
          border-bottom: 1px solid ${C.borderSubtle};
        }
        .legal-section h3 {
          font-size: 14px;
          font-weight: 700;
          color: ${C.text};
          margin: 24px 0 10px;
        }
        .legal-section p {
          font-size: 14px;
          line-height: 1.8;
          color: ${C.textMuted};
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
          color: ${C.textMuted};
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
          background: ${isDark ? "rgba(245,166,35,0.08)" : "#fffbf0"};
          border: 1px solid rgba(245,166,35,0.3);
          border-left: 4px solid #F5A623;
          border-radius: 0 6px 6px 0;
          padding: 18px 22px;
          margin: 20px 0 24px;
        }
        .engagement-block p {
          font-size: 14px;
          color: ${C.text};
          font-weight: 500;
          margin: 0;
          line-height: 1.7;
        }

        .contact-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0 20px;
        }
        .contact-box {
          background: ${isDark ? "rgba(255,255,255,0.03)" : "#f7f7f7"};
          border: 1px solid ${C.borderCard};
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
          color: ${C.textMuted};
          margin: 0;
        }

        .divider {
          border: none;
          border-top: 1px solid ${C.borderSubtle};
          margin: 0 0 52px;
        }

        @media (max-width: 640px) {
          .legal-wrap { padding: 16px 16px 0; }
          .contact-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* HERO */}
      <section style={{ padding: "24px 24px 32px", background: isDark ? "linear-gradient(160deg, #080812 0%, #0d0d1f 60%, #080812 100%)" : "linear-gradient(160deg, #f8f8fb 0%, #f0f0fa 60%, #f8f8fb 100%)", borderBottom: `1px solid ${C.borderSubtle}` }}>
        <div style={{ maxWidth: "820px", margin: "0 auto" }}>
          <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "2px", textTransform: "uppercase", color: "#F5A623", margin: "0 0 10px" }}>Document officiel — République de Guinée</p>
          <h1 style={{ color: C.text, fontSize: "clamp(26px, 4vw, 32px)", fontWeight: "800", letterSpacing: "-0.5px", lineHeight: 1.15, margin: "0 0 10px" }}>Politique de Confidentialité</h1>
          <p style={{ color: C.textFaint, fontSize: "13px", margin: 0 }}>
            Yelen224 — Opéré par Sempya224 &nbsp;&nbsp;|&nbsp;&nbsp; {LEGAL_LAST_UPDATED_LABEL}
          </p>
        </div>
      </section>

      {/* ── CONTENU ── */}
      <style>{`
        .confidentialite-layout { grid-template-columns: 240px 1fr; }
        @media (max-width: 899px) {
          .confidentialite-layout { grid-template-columns: 1fr; }
        }
      `}</style>
      <main className="confidentialite-layout" style={{ display: "grid", gap: "32px", alignItems: "start", padding: "24px 0 40px" }}>

      <LegalTableOfContents sections={TOC_SECTIONS} />

      <div className="legal-wrap">

        {/* Article 1 */}
        <section className="legal-section" id="introduction">
          <h2>Article 1 — Introduction et engagement</h2>
          <p>
            Yelen224, opérée par Sempya224, accorde une importance fondamentale à la protection de la vie privée de ses utilisateurs. La présente Politique de Confidentialité décrit de manière transparente la façon dont nous collectons, utilisons, stockons, protégeons et partageons vos données personnelles lorsque vous utilisez la plateforme Yelen224 accessible à l&apos;adresse <strong>https://yelen224.com</strong>.
          </p>
          <p>
            Cette politique s&apos;applique à tous les utilisateurs de la plateforme : citoyens guinéens, prestataires professionnels, institutions officielles et visiteurs non inscrits.
          </p>
          <p>
            En utilisant Yelen224, vous reconnaissez avoir pris connaissance de la présente politique et consentez au traitement de vos données personnelles dans les conditions décrites ci-dessous.
          </p>
          <div className="engagement-block">
            <p>
              <strong>Engagement fondamental :</strong> Vos données personnelles ne sont jamais vendues à des tiers. Elles sont utilisées exclusivement pour vous fournir les services Yelen224 et améliorer votre expérience sur la plateforme.
            </p>
          </div>
          <p>
            Contact : <strong>contact@yelen224.com</strong> &nbsp;|&nbsp; +224 624 35 46 00 (Conakry) &nbsp;|&nbsp; +1 347 301 6768 (New York)
          </p>
        </section>

        {/* Article 2 */}
        <section className="legal-section" id="responsable-traitement">
          <h2>Article 2 — Responsable du traitement</h2>
          <p>Le responsable du traitement de vos données personnelles est :</p>
          <div className="contact-grid">
            <div className="contact-box">
              <span className="label">Siège social</span>
              <p>Sempya224<br />1895 Morris Avenue, 5ème étage<br />Bronx, New York 10345<br />États-Unis<br />+1 347 301 6768</p>
            </div>
            <div className="contact-box">
              <span className="label">Représentation Guinée</span>
              <p>Cimenterie, Commune de Ratoma<br />3ème étage, Conakry<br />République de Guinée<br />+224 624 35 46 00</p>
            </div>
          </div>
          <p>Directeur de la publication : <strong>Aboubakar Balder</strong> — contact@yelen224.com</p>
          <p>
            En tant que responsable du traitement, Sempya224 détermine les finalités et les moyens du traitement de vos données personnelles, conformément aux réglementations applicables en République de Guinée et aux États-Unis.
          </p>
        </section>

        {/* Article 3 */}
        <section className="legal-section" id="donnees-collectees">
          <h2>Article 3 — Données collectées</h2>

          <h3>3.1 Données collectées directement auprès de vous</h3>
          <p><strong>Données d&apos;identité :</strong></p>
          <ul>
            <li>Nom et prénom</li>
            <li>Numéro de téléphone (identifiant principal)</li>
            <li>Adresse email (optionnelle pour les citoyens, obligatoire pour les prestataires)</li>
            <li>Ville et pays de résidence</li>
          </ul>
          <p><strong>Données de rendez-vous :</strong></p>
          <ul>
            <li>Historique des rendez-vous pris via la plateforme</li>
            <li>Institutions et prestataires consultés</li>
            <li>Créneaux horaires réservés</li>
            <li>Statut des rendez-vous (confirmé, annulé, effectué)</li>
          </ul>
          <p><strong>Données professionnelles (prestataires et institutions) :</strong></p>
          <ul>
            <li>Nom et description de l&apos;activité ou institution</li>
            <li>Adresse professionnelle complète</li>
            <li>Documents justificatifs soumis pour vérification</li>
            <li>Horaires d&apos;ouverture et disponibilités</li>
          </ul>
          <p><strong>Données de contenu :</strong></p>
          <ul>
            <li>Avis et notations publiés sur la plateforme</li>
            <li>Messages envoyés via le formulaire de contact</li>
          </ul>

          <h3>3.2 Données collectées automatiquement</h3>
          <ul>
            <li>Adresse IP</li>
            <li>Type et version du navigateur</li>
            <li>Système d&apos;exploitation</li>
            <li>Pages visitées et durée de consultation</li>
            <li>Données de connexion et logs de sécurité</li>
          </ul>

          <h3>3.3 Données que nous ne collectons jamais</h3>
          <ul>
            <li>Numéros de carte bancaire (gérés par les prestataires de paiement)</li>
            <li>Données biométriques</li>
            <li>Géolocalisation en temps réel</li>
            <li>Contenu de vos communications privées</li>
          </ul>
        </section>

        {/* Article 4 */}
        <section className="legal-section" id="finalites">
          <h2>Article 4 — Finalités du traitement</h2>

          <h3>4.1 Fourniture des services Yelen224</h3>
          <ul>
            <li>Création et gestion de votre compte utilisateur</li>
            <li>Authentification sécurisée par SMS</li>
            <li>Facilitation de la prise de rendez-vous</li>
            <li>Envoi des confirmations et rappels de rendez-vous</li>
            <li>Gestion de votre historique et préférences</li>
          </ul>

          <h3>4.2 Communication</h3>
          <ul>
            <li>Envoi de confirmations de RDV par SMS et email</li>
            <li>Rappels automatiques 24h avant vos rendez-vous</li>
            <li>Notifications relatives à votre compte</li>
            <li>Réponses à vos demandes de support</li>
          </ul>

          <h3>4.3 Amélioration des services</h3>
          <ul>
            <li>Analyse de l&apos;utilisation pour améliorer la plateforme</li>
            <li>Détection et correction des bugs</li>
            <li>Développement de nouvelles fonctionnalités</li>
            <li>Statistiques agrégées et anonymisées</li>
          </ul>

          <h3>4.4 Sécurité et prévention des fraudes</h3>
          <ul>
            <li>Détection des activités frauduleuses ou malveillantes</li>
            <li>Protection de l&apos;intégrité de la plateforme</li>
            <li>Vérification de l&apos;identité des prestataires et institutions</li>
          </ul>

          <h3>4.5 Obligations légales</h3>
          <ul>
            <li>Respect des obligations légales et réglementaires applicables</li>
            <li>Réponse aux demandes des autorités compétentes</li>
            <li>Conservation des données comptables et fiscales</li>
          </ul>

          <h3>Base légale du traitement</h3>
          <ul>
            <li><strong>Exécution du contrat</strong> — pour les services que vous avez demandés</li>
            <li><strong>Consentement</strong> — pour les communications marketing</li>
            <li><strong>Intérêt légitime</strong> — pour la sécurité et l&apos;amélioration des services</li>
            <li><strong>Obligation légale</strong> — pour les obligations réglementaires</li>
          </ul>
        </section>

        {/* Article 5 */}
        <section className="legal-section" id="partage-destinataires">
          <h2>Article 5 — Partage et destinataires des données</h2>
          <div className="engagement-block">
            <p>Yelen224 <strong>ne vend jamais</strong> vos données personnelles à des tiers à des fins commerciales. Vos données ne sont partagées que dans les cas strictement nécessaires au fonctionnement du service.</p>
          </div>

          <h3>5.1 Partage avec les institutions et prestataires</h3>
          <p>
            Lorsque vous prenez un rendez-vous, les informations nécessaires (nom, prénom, numéro de téléphone) sont partagées avec l&apos;institution ou le prestataire concerné. Ce partage est limité aux informations strictement nécessaires à la réalisation du rendez-vous.
          </p>

          <h3>5.2 Prestataires techniques</h3>
          <ul>
            <li><strong>Supabase</strong> — base de données et hébergement, San Francisco, États-Unis, certifié ISO 27001</li>
            <li><strong>Prestataires SMS</strong> — envoi des codes de vérification et confirmations</li>
            <li><strong>Prestataires email</strong> — envoi des notifications et confirmations</li>
            <li><strong>Prestataires de paiement</strong> — traitement sécurisé des abonnements</li>
          </ul>
          <p>Ces prestataires n&apos;ont accès qu&apos;aux données strictement nécessaires à leurs missions et sont contractuellement tenus de protéger vos données.</p>

          <h3>5.3 Transferts internationaux</h3>
          <p>
            Yelen224 opère depuis les États-Unis et la Guinée. Vos données peuvent être transférées et stockées dans ces deux pays. Nous prenons toutes les mesures nécessaires pour assurer un niveau de protection adéquat.
          </p>

          <h3>5.4 Autorités compétentes</h3>
          <p>Yelen224 peut communiquer vos données aux autorités judiciaires ou administratives compétentes si la loi l&apos;exige.</p>
        </section>

        {/* Article 6 */}
        <section className="legal-section" id="duree-conservation">
          <h2>Article 6 — Durée de conservation</h2>
          <ul>
            <li><strong>Données de compte actif</strong> — conservées pendant toute la durée de votre inscription</li>
            <li><strong>Données de profil après suppression</strong> — supprimées dans les 90 jours</li>
            <li><strong>Historique de rendez-vous</strong> — supprimé dans les 90 jours</li>
            <li><strong>Avis publiés</strong> — anonymisés ou supprimés sur demande</li>
            <li><strong>Données comptables et de facturation</strong> — conservées 7 ans (obligations légales)</li>
            <li><strong>Logs de sécurité</strong> — conservés 12 mois</li>
            <li><strong>Données de navigation</strong> — conservées 6 mois maximum</li>
            <li><strong>Données de vérification prestataires</strong> — pendant l&apos;inscription + 1 an après résiliation</li>
          </ul>
          <p>À l&apos;issue des délais de conservation, vos données sont définitivement supprimées ou anonymisées de façon irréversible.</p>
        </section>

        {/* Article 7 */}
        <section className="legal-section" id="securite-donnees">
          <h2>Article 7 — Sécurité des données</h2>

          <h3>7.1 Mesures techniques</h3>
          <ul>
            <li>Chiffrement de bout en bout — données sensibles chiffrées en transit et au repos</li>
            <li>Authentification par SMS — aucun mot de passe stocké en clair</li>
            <li>Protocole HTTPS — toutes les communications sont chiffrées</li>
            <li>Hébergement via Supabase — certifié ISO 27001 et SOC 2 Type II</li>
            <li>Sauvegardes régulières automatiques et sécurisées</li>
            <li>Surveillance 24h/24 — détection automatique des activités suspectes</li>
            <li>Pare-feu et systèmes anti-intrusion</li>
          </ul>

          <h3>7.2 Mesures organisationnelles</h3>
          <ul>
            <li>Accès aux données limité au personnel autorisé</li>
            <li>Formation du personnel aux bonnes pratiques</li>
            <li>Procédures de réponse aux incidents de sécurité</li>
            <li>Audits de sécurité réguliers</li>
          </ul>
          <p>
            En cas de violation de données susceptible d&apos;engendrer un risque élevé pour vos droits, Yelen224 s&apos;engage à vous en informer dans les meilleurs délais et à prendre toutes les mesures correctives nécessaires.
          </p>
        </section>

        {/* Article 8 */}
        <section className="legal-section" id="vos-droits">
          <h2>Article 8 — Vos droits sur vos données</h2>
          <p>Conformément aux réglementations applicables, vous disposez des droits suivants :</p>
          <ul>
            <li><strong>Droit d&apos;accès</strong> — consulter l&apos;ensemble des données personnelles que nous détenons à votre sujet</li>
            <li><strong>Droit de rectification</strong> — demander la correction de toute donnée inexacte ou incomplète</li>
            <li><strong>Droit à l&apos;effacement</strong> — demander la suppression de vos données, sous réserve de nos obligations légales</li>
            <li><strong>Droit à la limitation</strong> — demander la limitation du traitement dans certaines circonstances</li>
            <li><strong>Droit à la portabilité</strong> — recevoir vos données dans un format structuré ou les transférer vers un autre responsable</li>
            <li><strong>Droit d&apos;opposition</strong> — vous opposer au traitement de vos données à des fins de prospection commerciale</li>
            <li><strong>Retrait du consentement</strong> — à tout moment, sans affecter la licéité du traitement antérieur</li>
          </ul>
          <p>
            <strong>Pour exercer vos droits :</strong> contact@yelen224.com — Objet : <em>[DONNÉES PERSONNELLES]</em><br />
            Délai de réponse maximum : 30 jours.
          </p>
        </section>

        {/* Article 9 */}
        <section className="legal-section" id="cookies">
          <h2>Article 9 — Cookies et technologies similaires</h2>

          <h3>9.1 Cookies strictement nécessaires (non désactivables)</h3>
          <ul>
            <li>Cookie de session — maintient votre connexion active</li>
            <li>Cookie de sécurité — protège contre les attaques CSRF</li>
            <li>Cookie de thème — mémorise votre préférence dark/light mode</li>
          </ul>

          <h3>9.2 Cookies analytiques (avec votre consentement)</h3>
          <ul>
            <li>Analyse de l&apos;utilisation pour améliorer la plateforme</li>
            <li>Mesure des performances des pages</li>
            <li>Identification des problèmes techniques</li>
          </ul>

          <h3>9.3 Gestion de vos cookies</h3>
          <p>
            Vous pouvez à tout moment accepter ou refuser les cookies non essentiels, supprimer les cookies depuis les paramètres de votre navigateur, ou configurer votre navigateur pour bloquer certains types de cookies. La désactivation des cookies strictement nécessaires peut altérer le fonctionnement de la plateforme. Pour le détail complet de chaque cookie utilisé et sa durée de conservation, consultez notre <Link href="/politique-cookies" style={{ color: "#F5A623", textDecoration: "none", fontWeight: "600" }}>Politique des Cookies</Link>.
          </p>
        </section>

        {/* Article 10 */}
        <section className="legal-section" id="protection-mineurs">
          <h2>Article 10 — Protection des mineurs</h2>
          <p>
            La plateforme Yelen224 est destinée aux personnes âgées de 16 ans et plus. Nous ne collectons pas sciemment de données personnelles auprès de personnes de moins de 16 ans sans le consentement préalable de leurs parents ou tuteurs légaux.
          </p>
          <p>
            Si vous êtes parent ou tuteur et que votre enfant de moins de 16 ans a fourni des données sans votre consentement, contactez-nous immédiatement à <strong>contact@yelen224.com</strong>.
          </p>
          <p>
            Pour les rendez-vous médicaux ou administratifs concernant des mineurs, un adulte responsable (parent ou tuteur légal) doit s&apos;inscrire et gérer les rendez-vous au nom du mineur.
          </p>
        </section>

        {/* Article 11 */}
        <section className="legal-section" id="modifications">
          <h2>Article 11 — Modifications de la politique</h2>
          <p>
            Yelen224 se réserve le droit de modifier la présente Politique de Confidentialité à tout moment, notamment pour se conformer aux évolutions légales et réglementaires, tenir compte des évolutions de la plateforme, ou améliorer la transparence des informations fournies.
          </p>
          <p>
            En cas de modification substantielle, vous serez informé par email (si fourni), par notification sur la plateforme lors de votre prochaine connexion, et par publication de la nouvelle version sur cette page avec indication de la date de mise à jour.
          </p>
          <p>La poursuite de l&apos;utilisation de la plateforme après notification vaut acceptation de la nouvelle politique.</p>
        </section>

        {/* Article 12 */}
        <section className="legal-section" id="contact">
          <h2>Article 12 — Contact et réclamations</h2>
          <div className="contact-grid">
            <div className="contact-box">
              <span className="label">Siège New York</span>
              <p>Sempya224<br />1895 Morris Avenue, 5ème étage<br />Bronx, New York 10345, États-Unis<br />+1 347 301 6768</p>
            </div>
            <div className="contact-box">
              <span className="label">Représentation Conakry</span>
              <p>Cimenterie, Commune de Ratoma<br />3ème étage, Conakry<br />République de Guinée<br />+224 624 35 46 00</p>
            </div>
          </div>
          <p><strong>Email :</strong> contact@yelen224.com — Objet : [CONFIDENTIALITÉ]</p>
          <ul>
            <li>Demandes standard — sous 30 jours</li>
            <li>Demandes urgentes (violation de données) — sous 72 heures</li>
            <li>Demandes complexes — sous 90 jours avec notification préalable</li>
          </ul>
          <p>
            Si vous estimez que vos droits ne sont pas respectés, vous avez la possibilité de déposer une réclamation auprès des autorités compétentes en matière de protection des données dans votre pays de résidence.
          </p>
        </section>

      </div>
      </main>
    </>
  );
}
