CREATE TABLE journal_activite (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  membre_nom text NOT NULL,
  action text NOT NULL,
  cible_table text NOT NULL,
  cible_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE journal_activite ENABLE ROW LEVEL SECURITY;
