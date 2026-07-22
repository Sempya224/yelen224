-- Lots G+H — Brouillons d'avis + compteurs vues/"utile" (chantier Avis +
-- Favoris citoyen, suite décidée par Bryan le 18/07/2026 : Yelen fait sa
-- première entrée sur son marché grand public, vise une expérience
-- avancée plutôt que de laisser ces features de côté).

-- Brouillon — un avis peut être enregistré sans être publié tout de
-- suite (le citoyen termine son commentaire plus tard, depuis Mes avis).
ALTER TABLE avis ADD COLUMN brouillon boolean NOT NULL DEFAULT false;

-- Vues d'un avis sur la fiche publique établissement — mirroring exact
-- de annonce_vues (migration Lot E1 engagement citoyen, 16/07/2026) :
-- citoyen_id nullable (visiteur anonyme), dédoublonné côté client via
-- sessionStorage, jamais l'identité exposée en lecture.
CREATE TABLE avis_vues (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  avis_id uuid NOT NULL REFERENCES avis(id) ON DELETE CASCADE,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE avis_vues ENABLE ROW LEVEL SECURITY;
CREATE POLICY avis_vues_insert_public ON avis_vues
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY avis_vues_read_public ON avis_vues
  FOR SELECT TO anon, authenticated USING (true);

-- "Utile" — mirroring exact de annonce_likes : un citoyen (jamais
-- l'auteur, vérifié côté application) marque un avis comme utile,
-- toggle insert/delete direct côté client.
CREATE TABLE avis_utile (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  avis_id uuid NOT NULL REFERENCES avis(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (avis_id, citoyen_id)
);
ALTER TABLE avis_utile ENABLE ROW LEVEL SECURITY;
CREATE POLICY avis_utile_read_public ON avis_utile
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY avis_utile_insert_own ON avis_utile
  FOR INSERT TO authenticated WITH CHECK (citoyen_id = auth.uid());
CREATE POLICY avis_utile_delete_own ON avis_utile
  FOR DELETE TO authenticated USING (citoyen_id = auth.uid());
