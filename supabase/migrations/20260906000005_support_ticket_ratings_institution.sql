-- Chantier "Support Yelen institution" — complément Lot A, oublié dans
-- 20260906000004 : support_ticket_ratings.citoyen_id était NOT NULL,
-- bloquant toute évaluation d'un ticket institution. Même traitement que
-- support_tickets (institution_id nullable en plus, exactement une origine).

ALTER TABLE support_ticket_ratings ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE support_ticket_ratings ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE support_ticket_ratings ADD CONSTRAINT support_ticket_ratings_une_seule_origine
  CHECK ((citoyen_id IS NOT NULL) <> (institution_id IS NOT NULL));

CREATE INDEX support_ticket_ratings_institution_idx ON support_ticket_ratings (institution_id) WHERE institution_id IS NOT NULL;
