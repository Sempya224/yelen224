-- "Questions des citoyens" façon Booking "Travelers are asking" — un
-- citoyen connecté peut poser une question publique à une institution
-- avant de prendre RDV (max 2 par établissement, imposé par trigger
-- serveur, pas seulement côté client). Réponse de l'institution rendue
-- publique sur la fiche une fois donnée.
CREATE TABLE questions_institution (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL,
  reponse text,
  reponse_le timestamptz,
  lu boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE questions_institution ENABLE ROW LEVEL SECURITY;

-- Citoyen connecté insère sa propre question.
CREATE POLICY questions_institution_insert_own ON questions_institution
  FOR INSERT TO authenticated WITH CHECK (citoyen_id = auth.uid());

-- Lecture publique des questions RÉPONDUES (le "chat public") + un
-- citoyen connecté voit en plus ses propres questions même en attente
-- (pour afficher "en attente de réponse" sur ce qu'il a posé).
CREATE POLICY questions_institution_read_public ON questions_institution
  FOR SELECT TO anon, authenticated USING (reponse IS NOT NULL);
CREATE POLICY questions_institution_read_own ON questions_institution
  FOR SELECT TO authenticated USING (citoyen_id = auth.uid());

-- Institution lit TOUT (répondu + en attente) via service_role
-- (app/api/institution/questions), JWT custom donc pas de session
-- Supabase Auth — aucune policy RLS dédiée nécessaire côté institution,
-- même raison que messages/clients/rdv-historique.

-- Limite serveur réelle : 2 questions maximum par (institution_id,
-- citoyen_id), pas seulement une vérification client contournable.
CREATE OR REPLACE FUNCTION limiter_questions_institution() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM questions_institution
      WHERE institution_id = NEW.institution_id AND citoyen_id = NEW.citoyen_id) >= 2 THEN
    RAISE EXCEPTION 'LIMITE_QUESTIONS_ATTEINTE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_limiter_questions_institution
BEFORE INSERT ON questions_institution
FOR EACH ROW EXECUTE FUNCTION limiter_questions_institution();
