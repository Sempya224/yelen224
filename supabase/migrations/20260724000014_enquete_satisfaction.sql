-- Widget "Comment on s'en sort ?" (satisfaction plateforme, façon Booking
-- "How are we doing?") — évalue Yelen en général, pas une institution
-- précise. Affiché uniquement aux citoyens connectés (décision Bryan
-- 24/07/2026), donc citoyen_id toujours renseigné, pas de cas anonyme.
CREATE TABLE enquete_satisfaction (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reponse text NOT NULL CHECK (reponse IN ('accord_total','accord','neutre','desaccord','desaccord_total')),
  commentaire text,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE enquete_satisfaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY enquete_satisfaction_insert_own ON enquete_satisfaction
  FOR INSERT TO authenticated WITH CHECK (citoyen_id = auth.uid());
-- Pas de policy SELECT : lecture exclusivement service_role (écran admin
-- /admin/satisfaction), même logique que la table feedback (institution→admin).
