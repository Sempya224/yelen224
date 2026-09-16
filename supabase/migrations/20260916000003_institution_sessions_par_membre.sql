-- Révocation ciblée par membre (16/09/2026, revue finale du moteur de
-- réauth) — jusqu'ici institution_sessions ne portait que institution_id :
-- changer le rôle d'un membre, le suspendre ou le supprimer ne révoquait
-- JAMAIS sa session existante, qui restait valide jusqu'à 8h malgré la
-- promesse affichée dans l'UI Équipe ("Ce compte perd l'accès au dashboard
-- Yelen immédiatement" pour la suppression). Colonne nullable : NULL pour
-- toute session déjà existante ou pour les 3 flux de connexion
-- institution-wide qui n'ont pas encore de membre_principal (comportement
-- inchangé, jamais bloquant).
ALTER TABLE institution_sessions ADD COLUMN membre_id uuid REFERENCES institution_membres(id) ON DELETE CASCADE;
CREATE INDEX institution_sessions_membre_id_idx ON institution_sessions (membre_id) WHERE membre_id IS NOT NULL AND revoked_at IS NULL;
