-- Migration : admins → admin_users (renommage + colonnes) + création admin_logs
-- Audit 09/07/2026

-- Étendre l'enum type_admin
ALTER TYPE type_admin ADD VALUE 'support';
ALTER TYPE type_admin ADD VALUE 'admin';

-- Renommer la table admins → admin_users
ALTER TABLE admins RENAME TO admin_users;

-- Renommer les colonnes
ALTER TABLE admin_users RENAME COLUMN mot_de_passe_hash TO password_hash;
ALTER TABLE admin_users RENAME COLUMN actif TO is_active;
ALTER TABLE admin_users RENAME COLUMN cree_le TO created_at;
ALTER TABLE admin_users RENAME COLUMN type TO role;

-- Nouvelles colonnes
ALTER TABLE admin_users ADD COLUMN prenom text;
ALTER TABLE admin_users ADD COLUMN last_login timestamptz;

-- Création de la table admin_logs
CREATE TABLE admin_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  action text NOT NULL,
  cible_table text,
  cible_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;