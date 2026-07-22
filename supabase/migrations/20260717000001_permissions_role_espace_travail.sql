-- Permissions par rôle sur l'espace de travail (17/07/2026)
-- Règle validée par Bryan : "chacun ne gère que le sien" — un membre
-- non-admin ne peut modifier/supprimer que ce qui lui est assigné (déjà
-- traçable via membre_id, migration 20260716000001) OU ce qu'il a créé.
-- membre_id seul ne suffit pas pour la 2e condition : un admin peut créer
-- une tâche assignée à un agent, ou un agent peut créer une tâche non
-- assignée à personne — il faut donc mémoriser le créateur séparément.
-- documents_travail n'a pas de notion d'assignation, seulement d'auteur :
-- membre_id y représente "uploadé par".
ALTER TABLE taches ADD COLUMN cree_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL;
ALTER TABLE evenements_agenda ADD COLUMN cree_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL;
ALTER TABLE documents_travail ADD COLUMN membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL;
