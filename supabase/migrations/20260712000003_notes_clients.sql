-- Migration : table notes_clients pour l'écran "Mes clients" (12/07/2026)
-- rdv.notes confirmé déjà existant, pas besoin de l'ajouter.
CREATE TABLE notes_clients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  mis_a_jour_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id, citoyen_id)
);
ALTER TABLE notes_clients ENABLE ROW LEVEL SECURITY;