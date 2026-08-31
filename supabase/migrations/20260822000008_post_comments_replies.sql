-- Réponses imbriquées sur les commentaires "Yelen Community" (22/08/2026,
-- retour Bryan : sheet de commentaires façon Facebook avec "Voir X
-- réponses"). Un seul niveau de nesting : parent_id pointe toujours vers
-- le commentaire racine du fil (même si on répond à une réponse), comme
-- Instagram/Facebook — jamais de profondeur illimitée.

ALTER TABLE post_comments
  ADD COLUMN parent_id uuid REFERENCES post_comments(id) ON DELETE CASCADE;

CREATE INDEX post_comments_parent_id_idx ON post_comments(parent_id);
