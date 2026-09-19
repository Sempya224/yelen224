-- Chantier Taxonomie des activités — Phase 1, migration 1/8. Crée les 15
-- catégories fixes validées par le CEO
-- (docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md §4/§19 décision B).
-- Remplace à terme institutions.secteur comme classification principale
-- (secteur reste gelée en lecture seule, jamais supprimée — Phase 5 du
-- plan d'implémentation, non exécutée par cette migration).
--
-- RLS : lecture publique nécessaire (wizard/fiche/recherche future),
-- écriture service_role uniquement — seule exception délibérée au
-- Pattern C "zéro policy" de ce chantier, justifiée par l'absence de
-- toute donnée sensible ici (juste une classification déjà publique par
-- nature). Même forme que la policy institutions_public_read déjà
-- existante (supabase/migrations/20260709000014_policy_institutions_public_read.sql).
CREATE TABLE activite_categories (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  ordre       integer NOT NULL DEFAULT 0,
  actif       boolean NOT NULL DEFAULT true,
  cree_le     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO activite_categories (code, label, description, ordre) VALUES
  ('institutions_publiques_administratif',  'Institutions publiques & services administratifs',    'Mairies, préfectures, ambassades, services d''état civil et administrations.', 1),
  ('sante_medical',                          'Santé & services médicaux',                            'Hôpitaux, cliniques, cabinets médicaux, pharmacies, laboratoires.', 2),
  ('finance_assurance_paiements',            'Finance, assurance & paiements',                       'Banques, microfinance, assurance, transfert d''argent, bureaux de change.', 3),
  ('droit_comptabilite_conseil',             'Droit, comptabilité & conseil professionnel',          'Avocats, notaires, experts-comptables et conseil directement lié à ces professions réglementées.', 4),
  ('technologie_numerique_telecom',          'Technologie, numérique & télécommunications',          'Développement logiciel, plateformes numériques, télécommunications, infrastructure IT.', 5),
  ('education_formation_recherche',          'Éducation, formation & recherche',                     'Écoles, universités, centres de formation professionnelle, instituts de recherche.', 6),
  ('hebergement_restauration_evenements',    'Hébergement, restauration & événements',               'Hôtels, restaurants, organisateurs d''événements, traiteurs.', 7),
  ('transport_logistique_mobilite',          'Transport, logistique & mobilité',                     'Transport de personnes, transit/dédouanement, livraison, location de véhicules.', 8),
  ('btp_immobilier_technique',               'BTP, immobilier & services techniques',                'Construction, agences immobilières, bureaux d''études, services techniques à l''échelle d''un chantier.', 9),
  ('agriculture_elevage_rural',              'Agriculture, élevage & services ruraux',               'Exploitations agricoles, coopératives, vétérinaires, fourniture d''intrants agricoles.', 10),
  ('artisanat_fabrication_reparation',       'Artisanat, fabrication & réparation',                  'Savoir-faire individuel ou en atelier : menuiserie, couture, réparation, fabrication artisanale.', 11),
  ('beaute_bien_etre_sport',                 'Beauté, bien-être & sport',                            'Coiffure, instituts de beauté, salles de sport, coachs sportifs.', 12),
  ('communication_medias_creation',          'Communication, médias & création',                     'Agences de communication, studios de production, médias, graphisme et design.', 13),
  ('services_entreprises_externalisation',   'Services aux entreprises & externalisation',           'Centres d''appels, recrutement/RH, nettoyage professionnel, sécurité privée, conseil en gestion.', 14),
  ('associations_ong_organisations',         'Associations, ONG & organisations professionnelles',   'ONG, associations communautaires, organisations professionnelles et syndicats.', 15);

ALTER TABLE activite_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY activite_categories_public_read ON activite_categories
  FOR SELECT TO anon, authenticated
  USING (actif);

REVOKE INSERT, UPDATE, DELETE ON activite_categories FROM PUBLIC, anon, authenticated;
