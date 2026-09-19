-- Feedback technique citoyen (écran /compte/feedback, façon "Send feedback"
-- WhatsApp) — demande Bryan 24/08/2026. Fire-and-forget : le citoyen envoie
-- et repart, aucun écran d'historique côté citoyen. Même logique que
-- rdv_abandon_feedback (migration 20260725000003) : table dédiée, RLS
-- INSERT seul, analyse faite par Bryan directement en SQL Editor
-- (service_role, hors RLS) — pas d'écran admin prévu pour l'instant.
CREATE TABLE citoyen_feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  capture_path text,
  statut text NOT NULL DEFAULT 'nouveau',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY citoyen_feedback_citoyen_insert ON citoyen_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = citoyen_id);
