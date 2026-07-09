-- Migration : institutions — alignement avec le modèle du code (audit 09/07/2026)
-- Renommages
ALTER TABLE institutions RENAME COLUMN nom TO name;
ALTER TABLE institutions RENAME COLUMN logo_url TO logo;
ALTER TABLE institutions RENAME COLUMN telephone TO phone;
ALTER TABLE institutions RENAME COLUMN cree_le TO created_at;

-- Suppression du résidu (aucun système de mot de passe voulu pour les institutions)
ALTER TABLE institutions DROP COLUMN mot_de_passe_hash;

-- Nouvelles colonnes
ALTER TABLE institutions ADD COLUMN category text;
ALTER TABLE institutions ADD COLUMN moyenne_avis numeric;
ALTER TABLE institutions ADD COLUMN nb_avis integer NOT NULL DEFAULT 0;
ALTER TABLE institutions ADD COLUMN quartier text;
ALTER TABLE institutions ADD COLUMN website text;
ALTER TABLE institutions ADD COLUMN site_web text;
ALTER TABLE institutions ADD COLUMN whatsapp text;
ALTER TABLE institutions ADD COLUMN avertissements integer NOT NULL DEFAULT 0;
ALTER TABLE institutions ADD COLUMN document_officiel text;
ALTER TABLE institutions ADD COLUMN documents_urls jsonb;
ALTER TABLE institutions ADD COLUMN disponibilites jsonb;