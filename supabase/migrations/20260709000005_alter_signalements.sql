-- Migration : signalements — alignement avec le modèle du code (audit 09/07/2026)
ALTER TABLE signalements RENAME COLUMN cree_le TO created_at;

ALTER TABLE signalements ADD COLUMN motif text;
ALTER TABLE signalements ADD COLUMN preuve_url text;
ALTER TABLE signalements ADD COLUMN type_signaleur text;
ALTER TABLE signalements ADD COLUMN type_cible text;
ALTER TABLE signalements ADD COLUMN auteur_id uuid;
ALTER TABLE signalements ADD COLUMN cible_id uuid;
ALTER TABLE signalements ADD COLUMN cible_type text;
ALTER TABLE signalements ADD COLUMN priorite text;
ALTER TABLE signalements ADD COLUMN type text;