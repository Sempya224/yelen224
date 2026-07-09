-- Migration : avis — alignement avec le modèle du code (audit 09/07/2026)
ALTER TABLE avis RENAME COLUMN cree_le TO created_at;