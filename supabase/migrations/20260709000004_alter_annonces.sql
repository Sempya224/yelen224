-- Migration : annonces — alignement avec le modèle du code (audit 09/07/2026)
ALTER TABLE annonces RENAME COLUMN cree_le TO created_at;
ALTER TABLE annonces DROP COLUMN publiee;

ALTER TABLE annonces ADD COLUMN type text NOT NULL DEFAULT 'information';
ALTER TABLE annonces ADD COLUMN statut text NOT NULL DEFAULT 'publiee';
ALTER TABLE annonces ADD COLUMN date_expiration date;
ALTER TABLE annonces ADD COLUMN date_publication timestamptz;
ALTER TABLE annonces ADD COLUMN nb_vues integer NOT NULL DEFAULT 0;
ALTER TABLE annonces ADD COLUMN nb_clics integer NOT NULL DEFAULT 0;
ALTER TABLE annonces ADD COLUMN image_url text;
ALTER TABLE annonces ADD COLUMN epingle boolean NOT NULL DEFAULT false;
ALTER TABLE annonces ADD COLUMN regions_cibles jsonb;