-- Impressions/Vues réelles par publication — Chaîne Yelen, Performance
-- (23/08/2026, retour Bryan : terminer le stub "Vues, impressions et
-- portée" côté institution). Réplique exactement la paire offre_vues
-- (passif) / offre_clics (actif) déjà dans le projet
-- (20260802000001_offre_vues_clics.sql), renommée pour les posts :
--   - post_impressions : le post était présent dans le fil chargé
--     (même contrat qu'annonce_vues/offre_vues : dédoublonné côté client
--     par sessionStorage, une ligne par citoyen par session).
--   - post_vues : le citoyen a réellement ouvert le post en détail
--     (déclenché depuis ouvrirPostDetail).
-- citoyen_id ON DELETE SET NULL (pas CASCADE) sur les deux — une vue déjà
-- comptée ne doit jamais disparaître rétroactivement si le citoyen
-- supprime son compte, même raison que offre_vues/offre_clics.
CREATE TABLE post_impressions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE post_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_impressions_insert ON post_impressions
  FOR INSERT TO anon, authenticated
  WITH CHECK (citoyen_id IS NULL OR citoyen_id = auth.uid());
-- Aucune policy SELECT : lecture exclusivement via service_role
-- (app/api/institution/communaute-posts), jamais exposée en lecture
-- directe citoyen — même garantie que offre_vues.

CREATE TABLE post_vues (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE post_vues ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_vues_insert ON post_vues
  FOR INSERT TO anon, authenticated
  WITH CHECK (citoyen_id IS NULL OR citoyen_id = auth.uid());

CREATE INDEX post_impressions_post_id_idx ON post_impressions(post_id);
CREATE INDEX post_impressions_created_at_idx ON post_impressions(created_at);
CREATE INDEX post_vues_post_id_idx ON post_vues(post_id);
CREATE INDEX post_vues_created_at_idx ON post_vues(created_at);
