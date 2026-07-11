-- Migration : correction colonne langue (mauvais type integer -> jsonb) 
-- + création institution_responsables (11/07/2026)

-- Fix : langue était en integer par erreur de reconstruction manuelle du schéma,
-- alors que le code (wizard profil + fiche publique) l'utilise comme tableau de 
-- chaînes. RLS bloquait toute écriture jusqu'ici, donc aucune donnée réelle perdue.
ALTER TABLE institutions DROP COLUMN langue;
ALTER TABLE institutions ADD COLUMN langue jsonb DEFAULT '[]'::jsonb;

-- Profil responsable séparé du profil entreprise
CREATE TABLE institution_responsables (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
  prenom text NOT NULL,
  nom text NOT NULL,
  role text,
  phone text,
  email text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE institution_responsables ENABLE ROW LEVEL SECURITY;

INSERT INTO institution_responsables (institution_id, prenom, nom, role)
SELECT id, responsable_prenom, responsable_nom, responsable_role
FROM institutions
WHERE responsable_prenom IS NOT NULL AND responsable_nom IS NOT NULL;