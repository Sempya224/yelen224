-- Bascule citoyen_projets.secteur des 9 valeurs SECTEURS (institution,
-- lib/institutionTaxonomy.tsx) vers les 15 codes activite_categories
-- (lib/activiteVisuels.tsx, mêmes catégories que l'écran Recherche).
--
-- Revirement explicite de Bryan le 27/09/2026 : la migration
-- 20260927000001 (même jour) affirmait que "15 catégories" (mention du
-- brief CEO) ne correspondait à aucune taxonomie existante en base —
-- c'était faux, activite_categories existe déjà et alimente
-- app/recherche/RechercheInner.tsx. Les 15 catégories réelles sont
-- sémantiquement les bonnes pour "Mes projets" (orienté activité
-- citoyenne, pas profil institution).
--
-- Contrainte retirée avant le backfill, jamais l'inverse (piège connu,
-- voir CLAUDE.md) : ADD CONSTRAINT validerait toute la table
-- immédiatement, y compris les lignes encore sur l'ancien code.
ALTER TABLE citoyen_projets DROP CONSTRAINT IF EXISTS citoyen_projets_secteur_check;

-- Mapping 1:1 le plus proche vers les nouveaux codes, pour toute ligne
-- déjà écrite depuis le lancement de "Mes projets" plus tôt le
-- 27/09/2026 (secteur "services_divers", plus générique, mappé vers le
-- plus proche équivalent "Services pro").
UPDATE citoyen_projets SET secteur = CASE secteur
  WHEN 'sante'                  THEN 'sante_medical'
  WHEN 'administratif'          THEN 'institutions_publiques_administratif'
  WHEN 'financier'               THEN 'finance_assurance_paiements'
  WHEN 'juridique'                THEN 'droit_comptabilite_conseil'
  WHEN 'beaute_bien_etre'         THEN 'beaute_bien_etre_sport'
  WHEN 'artisanat'                THEN 'artisanat_fabrication_reparation'
  WHEN 'services_divers'          THEN 'services_entreprises_externalisation'
  WHEN 'hotel'                    THEN 'hebergement_restauration_evenements'
  WHEN 'technologie_numerique'    THEN 'technologie_numerique_telecom'
  ELSE secteur
END
WHERE secteur IS NOT NULL;

ALTER TABLE citoyen_projets ADD CONSTRAINT citoyen_projets_secteur_check CHECK (secteur IN (
  'institutions_publiques_administratif', 'sante_medical', 'finance_assurance_paiements',
  'droit_comptabilite_conseil', 'technologie_numerique_telecom', 'education_formation_recherche',
  'hebergement_restauration_evenements', 'transport_logistique_mobilite', 'btp_immobilier_technique',
  'agriculture_elevage_rural', 'artisanat_fabrication_reparation', 'beaute_bien_etre_sport',
  'communication_medias_creation', 'services_entreprises_externalisation', 'associations_ong_organisations'
));
