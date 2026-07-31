-- Yelen Community (26/07/2026, décision CEO) — espace communautaire
-- professionnel façon LinkedIn, remplace le slot "Mes démarches" du menu
-- fixe. Mirroring exact de deux conventions déjà en place :
-- `offres` (service_role only + une seule policy de lecture publique
-- étroite sur statut='publiee') pour `posts`, et `avis_utile` (toggle
-- propriétaire) pour `post_likes`.

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  auteur_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Dénormalisé à l'écriture (service_role) : aucune policy de lecture
  -- publique n'existe sur `users` — jamais un join à la volée, jamais un
  -- champ fourni tel quel par le client.
  author_nom text NOT NULL,
  author_photo_url text,
  author_verifie boolean NOT NULL DEFAULT false,
  author_membre_depuis timestamptz NOT NULL,
  contenu text,
  images jsonb,
  statut text NOT NULL DEFAULT 'en_attente_validation'
    CHECK (statut IN ('en_attente_validation','publiee','refusee')),
  motif_refus text,
  soumis_le timestamptz NOT NULL DEFAULT now(),
  valide_le timestamptz,
  valide_par_admin_id uuid REFERENCES admin_users(id),
  nb_partages integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY posts_public_read ON posts
  FOR SELECT TO anon, authenticated USING (statut = 'publiee');

-- L'auteur doit voir ses propres posts quel que soit leur statut (en
-- attente/refusé), en plus du flux public.
CREATE POLICY posts_own_read ON posts
  FOR SELECT TO authenticated USING (auteur_id = auth.uid());

-- Aucune policy d'écriture : passe exclusivement par
-- app/api/citoyen/posts (service_role, vérifie identite_verifiee).

CREATE TABLE post_likes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, citoyen_id)
);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_likes_read_public ON post_likes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY post_likes_insert_own ON post_likes
  FOR INSERT TO authenticated WITH CHECK (citoyen_id = auth.uid());
CREATE POLICY post_likes_delete_own ON post_likes
  FOR DELETE TO authenticated USING (citoyen_id = auth.uid());

CREATE TABLE post_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Capturé à l'insertion (même raison que author_* sur posts) : aucune
  -- policy de lecture publique sur `users`.
  citoyen_nom text NOT NULL,
  citoyen_photo_url text,
  contenu text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_comments_read_public ON post_comments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY post_comments_insert_own ON post_comments
  FOR INSERT TO authenticated WITH CHECK (citoyen_id = auth.uid());
CREATE POLICY post_comments_delete_own ON post_comments
  FOR DELETE TO authenticated USING (citoyen_id = auth.uid());
