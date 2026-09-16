-- Module Collaboration — corrections de la revue critique, 16/09/2026.

-- ── HIGH : perte de données silencieuse ──
-- collab_messages.auteur_membre_id était en ON DELETE CASCADE : supprimer
-- un membre de l'équipe (DELETE /api/institution/membres, un vrai DELETE
-- SQL, pas une suspension) effaçait TOUS les messages qu'il avait jamais
-- envoyés, dans toutes les conversations, pour tout le monde. Incohérent
-- avec la discipline du reste du projet (journal_activite, document_events,
-- jamais supprimés). Colonne rendue nullable + SET NULL : le message est
-- conservé, affiché "Ancien membre" côté API/UI quand auteur_membre_id est
-- NULL.
ALTER TABLE collab_messages ALTER COLUMN auteur_membre_id DROP NOT NULL;
ALTER TABLE collab_messages DROP CONSTRAINT collab_messages_auteur_membre_id_fkey;
ALTER TABLE collab_messages ADD CONSTRAINT collab_messages_auteur_membre_id_fkey
  FOREIGN KEY (auteur_membre_id) REFERENCES institution_membres(id) ON DELETE SET NULL;

COMMENT ON COLUMN collab_messages.auteur_membre_id IS 'NULL = auteur supprimé de l''équipe depuis (message conservé, affiché "Ancien membre").';
