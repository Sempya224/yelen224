-- Feedback d'abandon du flux de réservation (wizard /rdv/[id]) — demande
-- Bryan 25/07/2026 : personne n'oblige un citoyen à réserver, mais s'il
-- quitte via le X du header, on lui demande pourquoi avant de partir, pour
-- comprendre les points de décrochage du parcours de réservation.
-- Mirroring RLS citoyen_demarches (auth.uid() = citoyen_id) — pas de
-- lecture cross-citoyen nécessaire côté produit, l'analyse se fait par
-- Bryan directement en SQL Editor (service_role, hors RLS).
CREATE TABLE rdv_abandon_feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  etape text NOT NULL,
  raison text NOT NULL,
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rdv_abandon_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY rdv_abandon_feedback_citoyen_insert ON rdv_abandon_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = citoyen_id);
