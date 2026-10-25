/* Feedback "cette reponse vous a-t-elle aide ?" (brief Bryan 05/10/2026)
   sur la fiche institution cote citoyen : mesure si les reponses de
   l'etablissement (a un avis ou a une question) aident reellement le
   citoyen qui les a posees. Signal produit interne pour Yelen, jamais
   affiche a l'institution ni aux autres citoyens (lecture SQL directe par
   Bryan, meme esprit que recherches_populaires/help_center_article_feedback).
   Ecriture en RLS directe cote client plutot que service_role+API : le
   citoyen a ici une vraie session Supabase Auth (contrairement au visiteur
   anonyme du Help Center), meme convention que avis_utile/annonce_likes.
   Lecture limitee a sa propre ligne (savoir si on a deja vote) :
   volontairement jamais de policy publique, contrairement a avis_utile, ce
   signal ne doit jamais etre visible de l'institution ni des autres
   citoyens. Seul l'auteur de l'avis/de la question peut voter, et
   seulement une fois que l'etablissement a repondu. */

CREATE TABLE avis_reponse_utile (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  avis_id uuid NOT NULL REFERENCES avis(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  utile boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (avis_id, citoyen_id)
);

ALTER TABLE avis_reponse_utile ENABLE ROW LEVEL SECURITY;

CREATE POLICY avis_reponse_utile_read_own ON avis_reponse_utile
  FOR SELECT TO authenticated USING (citoyen_id = auth.uid());

CREATE POLICY avis_reponse_utile_insert_own ON avis_reponse_utile
  FOR INSERT TO authenticated WITH CHECK (
    citoyen_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM avis a
      WHERE a.id = avis_id AND a.citoyen_id = auth.uid() AND a.reponse_institution IS NOT NULL
    )
  );

CREATE TABLE question_reponse_utile (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id uuid NOT NULL REFERENCES questions_institution(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  utile boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, citoyen_id)
);

ALTER TABLE question_reponse_utile ENABLE ROW LEVEL SECURITY;

CREATE POLICY question_reponse_utile_read_own ON question_reponse_utile
  FOR SELECT TO authenticated USING (citoyen_id = auth.uid());

CREATE POLICY question_reponse_utile_insert_own ON question_reponse_utile
  FOR INSERT TO authenticated WITH CHECK (
    citoyen_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM questions_institution q
      WHERE q.id = question_id AND q.citoyen_id = auth.uid() AND q.reponse IS NOT NULL
    )
  );
