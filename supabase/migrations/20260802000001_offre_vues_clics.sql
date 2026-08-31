-- Tracking réel des vues/clics d'une offre partenaire (chantier "Centre de
-- pilotage des offres", 02/08/2026). Mirroring exact d'annonce_vues
-- (supabase/migrations/20260720000009_annonces_engagement.sql) pour la
-- structure et la policy INSERT, avec un choix distinct sur la suppression
-- citoyen : ON DELETE SET NULL (pas CASCADE) pour qu'une vue déjà comptée
-- ne disparaisse jamais rétroactivement si le citoyen supprime son compte
-- (mirroring avis_vues sur ce point précis).
-- nb_clics (colonne offres) reste le compteur total canonique, inchangé
-- (déjà utilisé pour le tri des offres populaires côté citoyen) — offre_clics
-- n'existe que pour permettre un graphique de performance par jour, avec la
-- même structure et la même logique d'agrégation qu'offre_vues.

CREATE TABLE offre_vues (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  offre_id uuid NOT NULL REFERENCES offres(id) ON DELETE CASCADE,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE offre_vues ENABLE ROW LEVEL SECURITY;
CREATE POLICY offre_vues_insert ON offre_vues
  FOR INSERT TO anon, authenticated
  WITH CHECK (citoyen_id IS NULL OR citoyen_id = auth.uid());
-- Aucune policy SELECT : lecture exclusivement via service_role
-- (app/api/institution/offres/vues), jamais exposée en lecture directe.

CREATE TABLE offre_clics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  offre_id uuid NOT NULL REFERENCES offres(id) ON DELETE CASCADE,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE offre_clics ENABLE ROW LEVEL SECURITY;
-- Aucune policy : écriture exclusivement service_role depuis
-- app/api/offres/[id]/clic (déjà server-side), lecture exclusivement
-- service_role depuis app/api/institution/offres/vues.

CREATE INDEX offre_vues_offre_id_idx ON offre_vues(offre_id);
CREATE INDEX offre_vues_created_at_idx ON offre_vues(created_at);
CREATE INDEX offre_clics_offre_id_idx ON offre_clics(offre_id);
CREATE INDEX offre_clics_created_at_idx ON offre_clics(created_at);
