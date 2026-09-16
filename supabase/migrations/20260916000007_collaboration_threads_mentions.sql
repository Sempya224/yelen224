-- Module Collaboration — Lot C (fils de réponse + @mentions), 16/09/2026.

-- ── Fils de réponse ──
-- Une réponse pointe vers le message racine auquel elle répond. Un message
-- racine (parent_message_id IS NULL) est affiché dans le fil principal ;
-- ses réponses ne le sont jamais directement, seulement dans le panneau
-- "Discussion" dédié — un seul niveau de profondeur (pas de réponse à une
-- réponse), comme Slack/Teams.
ALTER TABLE collab_messages ADD COLUMN parent_message_id uuid REFERENCES collab_messages(id) ON DELETE CASCADE;
CREATE INDEX idx_collab_messages_parent ON collab_messages(parent_message_id) WHERE parent_message_id IS NOT NULL;

-- ── @mentions ──
-- Une ligne par membre mentionné dans un message (un message peut en
-- mentionner plusieurs). "lu" distinct de collab_conversation_membres.
-- dernier_lu_le : une mention reste "à traiter" indépendamment du reste de
-- la conversation déjà lue.
CREATE TABLE collab_mentions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
  membre_id uuid NOT NULL REFERENCES institution_membres(id) ON DELETE CASCADE,
  lu boolean NOT NULL DEFAULT false,
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, membre_id)
);

ALTER TABLE collab_mentions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_collab_mentions_membre ON collab_mentions(membre_id, cree_le DESC);

COMMENT ON COLUMN collab_messages.parent_message_id IS 'NULL = message racine (fil principal) ; sinon réponse dans la discussion de ce message racine.';
COMMENT ON TABLE collab_mentions IS 'Une ligne par membre @mentionné dans un message collab_messages — alimente la vue "Mentions".';
