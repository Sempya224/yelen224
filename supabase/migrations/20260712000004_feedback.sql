-- Migration : table feedback pour le canal feedback du header institution (12/07/2026)
CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  statut text NOT NULL DEFAULT 'nouveau',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
-- Pas de policy publique : accès exclusivement via service_role
-- (institution -> POST seulement, admin -> GET/PATCH), même pattern que
-- notes_clients (migration 20260712000003).
