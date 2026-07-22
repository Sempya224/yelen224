-- Assignation par membre sur l'espace de travail (16/07/2026)
-- Ajoute membre_id sur taches et evenements_agenda pour brancher la
-- fondation multi-comptes (institution_membres) sur ces 2 tables.
-- documents_travail non concerné (pas d'assignation, seulement traçable
-- via journal_activite au moment de l'upload).
ALTER TABLE taches ADD COLUMN membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL;
ALTER TABLE evenements_agenda ADD COLUMN membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL;
