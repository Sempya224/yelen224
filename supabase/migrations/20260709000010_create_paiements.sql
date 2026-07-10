-- Migration : création paiements (audit 09/07/2026)
CREATE TABLE paiements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  montant numeric(10,2) NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente',
  methode text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;