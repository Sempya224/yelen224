-- Migration : feedback "cet article vous a-t-il aidé ?" du Help Center
-- prestataire (23/09/2026). Le contenu des articles reste codé en dur
-- (lib/helpCenter/data.ts, décision verrouillée V1) — cette table ne
-- stocke donc jamais de FK vers une table d'articles inexistante, juste
-- le slug réel (`article_id`) + son domaine, tels qu'utilisés par
-- getArticle(domaine, articleId). Visiteur public, aucune session
-- Supabase Auth possible : écriture exclusivement via service_role côté
-- API (app/api/help/articles/[articleId]/feedback), même convention que
-- toutes les tables sans session utilisateur du projet (RLS activé, zéro
-- policy).
CREATE TABLE help_center_article_feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id text NOT NULL,
  domaine text NOT NULL,
  helpful boolean NOT NULL,
  comment text NULL CHECK (char_length(comment) <= 1000),
  locale text NULL,
  article_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_center_article_feedback_article ON help_center_article_feedback (article_id, domaine);

ALTER TABLE help_center_article_feedback ENABLE ROW LEVEL SECURITY;
-- Pas de policy : accès exclusivement service_role (aucun visiteur du
-- Help Center public n'a de session Supabase Auth, même pattern que
-- feedback/notes_clients/recherches_populaires).
