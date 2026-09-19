-- Chantier Taxonomie des activités — Phase 1, migration 2/8. Table des
-- activités exactes (niveau sous la catégorie) — curées et administrables
-- en base (jamais un fichier TypeScript de 120-140 entrées, exigence CEO
-- explicite). Seules les 23 activités de la catégorie Technologie sont
-- semées ici : seule catégorie dont le contenu a été sourcé/validé dans
-- docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md §6.2 — semer le
-- squelette "à valider" des 14 autres catégories (§7 de la spec)
-- présenterait des données non consolidées comme finales.
--
-- regulatory_status : attribut orthogonal à la catégorie/activité,
-- jamais mélangé avec elles (spec §10bis). Seules 3 activités ont un
-- statut sourcé (ARPT) à ce stade ; toutes les autres restent
-- non_regulated par défaut, sauf preuve contraire future.
CREATE TABLE activites (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  categorie_id      uuid NOT NULL REFERENCES activite_categories(id),
  code              text NOT NULL UNIQUE,
  label             text NOT NULL,
  description       text,
  alias             text[] NOT NULL DEFAULT '{}',
  ordre             integer NOT NULL DEFAULT 0,
  statut            text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','desactivee')),
  regulatory_status text NOT NULL DEFAULT 'non_regulated'
    CHECK (regulatory_status IN ('non_regulated','regulated','license_required','accreditation_required','professional_order','verification_required')),
  regulatory_source text,
  cree_le           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activites_categorie_idx ON activites (categorie_id);

INSERT INTO activites (categorie_id, code, label, description, alias, regulatory_status, regulatory_source, ordre)
SELECT c.id, v.code, v.label, v.description, v.alias, v.regulatory_status, v.regulatory_source, v.ordre_seed
FROM (VALUES
  ('fournisseur_solutions_sms', 'Fournisseur de solutions SMS', 'Entreprise fournissant des services professionnels d''envoi, réception, automatisation ou intégration SMS.', ARRAY['SMS provider','plateforme SMS','service SMS','passerelle SMS','SMS API','services SMS'], 'verification_required', 'Décret A/2021/086/MPTEN/CAB/SGG (ouverture des codes USSD/VAS), ARPT — un fournisseur SMS opérant via agrégation/API est un "fournisseur de services à valeur ajoutée" au sens de ce cadre.', 1),
  ('fournisseur_solutions_ussd', 'Fournisseur de solutions USSD', 'Entreprise fournissant des services interactifs accessibles par code USSD, agréée par l''ARPT.', ARRAY['USSD provider','service USSD','code USSD'], 'verification_required', 'Décret A/2021/086/MPTEN/CAB/SGG, ARPT.', 2),
  ('operateur_telecom', 'Opérateur télécom', 'Exploitant d''un réseau de télécommunications ouvert au public (licence 2G/3G/4G).', ARRAY['opérateur mobile','télécommunications'], 'license_required', 'Loi n°2005/018/AN, Loi L/2023/0008/CNT, ARPT (licences 2G/3G/4G confirmées, ex. MTN-Guinée).', 3),
  ('fournisseur_acces_internet', 'Fournisseur d''accès Internet', 'Fournit un accès Internet fixe/mobile aux particuliers/entreprises.', ARRAY['FAI','ISP'], 'non_regulated', NULL, 4),
  ('developpement_logiciel', 'Développement logiciel', 'Conception et réalisation de logiciels sur mesure pour des tiers.', ARRAY['dev logiciel','logiciel sur mesure','ERP','application métier'], 'non_regulated', NULL, 5),
  ('developpement_web', 'Développement web', 'Conception et réalisation de sites/applications web.', ARRAY['dev web','création de site'], 'non_regulated', NULL, 6),
  ('developpement_mobile', 'Développement d''applications mobiles', 'Conception et réalisation d''applications mobiles.', ARRAY['app mobile','dev mobile'], 'non_regulated', NULL, 7),
  ('plateforme_saas_numerique', 'Plateforme SaaS / numérique', 'Édition et exploitation d''un logiciel en ligne par abonnement.', ARRAY['SaaS','plateforme en ligne','solution logicielle'], 'non_regulated', NULL, 8),
  ('agence_digitale', 'Agence digitale', 'Agence proposant développement/intégration technique pour des tiers.', ARRAY['agence web','agence numérique'], 'non_regulated', NULL, 9),
  ('conseil_informatique', 'Conseil informatique', 'Accompagnement stratégique/technique en systèmes d''information, sans exécution.', ARRAY['consulting IT','conseil IT'], 'non_regulated', NULL, 10),
  ('integration_informatique', 'Intégration informatique', 'Mise en œuvre technique de systèmes/logiciels tiers chez le client.', ARRAY['intégrateur','intégration système'], 'non_regulated', NULL, 11),
  ('infogerance_maintenance_informatique', 'Infogérance & maintenance informatique', 'Prise en charge opérationnelle récurrente du système d''information d''un client.', ARRAY['infogérance','support IT','maintenance informatique'], 'non_regulated', NULL, 12),
  ('infrastructure_informatique_reseau', 'Infrastructure informatique et réseau', 'Conception/déploiement de réseaux et infrastructures physiques/virtuelles.', ARRAY['réseau','infrastructure IT'], 'non_regulated', NULL, 13),
  ('hebergement_web_cloud', 'Hébergement web & cloud', 'Hébergement de sites/applications/infrastructures pour des tiers.', ARRAY['hébergement','cloud','infrastructure cloud'], 'non_regulated', NULL, 14),
  ('cybersecurite', 'Cybersécurité', 'Protection des systèmes d''information contre les menaces numériques.', ARRAY['sécurité informatique','sécurité IT'], 'non_regulated', NULL, 15),
  ('solutions_paiement_numerique', 'Solutions de paiement numérique', 'Fourniture de passerelles/API de paiement électronique (mobile money, cartes) pour des tiers.', ARRAY['passerelle de paiement','agrégateur paiement'], 'non_regulated', NULL, 16),
  ('fintech_technologie_financiere', 'Fintech / technologie financière', 'Développement de produits financiers innovants (hors établissement financier réglementé lui-même).', ARRAY['technologie financière'], 'non_regulated', NULL, 17),
  ('intelligence_artificielle_donnees', 'Intelligence artificielle et données', 'Conception de solutions IA/analyse de données pour des tiers.', ARRAY['IA','data','analyse de données'], 'non_regulated', NULL, 18),
  ('formation_informatique', 'Formation informatique', 'Organisme dispensant des formations techniques en informatique/numérique.', ARRAY['formation IT','formation numérique'], 'non_regulated', NULL, 19),
  ('telephonie_entreprise', 'Téléphonie d''entreprise', 'Solutions de téléphonie fixe/IP pour entreprises.', ARRAY['téléphonie IP','standard téléphonique'], 'non_regulated', NULL, 20),
  ('centre_donnees', 'Centre de données / services data', 'Exploitation d''un datacenter ou de services d''hébergement de données à grande échelle.', ARRAY['datacenter','hébergement de données'], 'non_regulated', NULL, 21),
  ('vente_maintenance_materiel_informatique', 'Vente et maintenance de matériel informatique', 'Vente de matériel informatique accompagnée d''un service de maintenance/support.', ARRAY['matériel informatique','vente + support IT'], 'non_regulated', NULL, 22),
  ('communication_numerique_marketing_digital', 'Communication numérique, marketing digital & réseaux sociaux', 'Exécution technique de campagnes/gestion de présence numérique pour des tiers.', ARRAY['marketing digital','community management','communication numérique','gestion réseaux sociaux','production de contenu numérique'], 'non_regulated', NULL, 23)
) AS v(code, label, description, alias, regulatory_status, regulatory_source, ordre_seed)
JOIN activite_categories c ON c.code = 'technologie_numerique_telecom';

ALTER TABLE activites ENABLE ROW LEVEL SECURITY;

CREATE POLICY activites_public_read ON activites
  FOR SELECT TO anon, authenticated
  USING (statut = 'active');

REVOKE INSERT, UPDATE, DELETE ON activites FROM PUBLIC, anon, authenticated;
