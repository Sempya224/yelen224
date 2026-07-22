-- Migration : ajout catégorie sur paid_services (refonte écran Mes Services, 16/07/2026)
-- Texte libre, pas de CHECK constraint : le dropdown de l'écran propose la
-- taxonomie SECTEURS existante (lib/institutionTaxonomy.tsx, déjà utilisée
-- pour institutions.secteur) + une option "Autre" à texte libre.
ALTER TABLE paid_services ADD COLUMN categorie text;
