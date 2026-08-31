-- Compteur réel de vues de fiche institution (Lot G Search, 28/08/2026,
-- section "Populaire" — brief §9/§12). Comble un manque documenté de longue
-- date (voir commentaire historique sur Rail::railMieuxNotees,
-- app/recherche/RechercheInner.tsx : "aucun compteur de vues de profil
-- institution n'existe dans le produit, un vrai signal de popularité
-- serait fabriqué"). Mirroring exact de offre_vues
-- (supabase/migrations/20260802000001_offre_vues_clics.sql) pour la
-- structure et la policy INSERT — pas de colonne "canal" ici, pas de
-- besoin d'attribution marketing pour ce compteur, seulement le classement
-- par popularité.

CREATE TABLE institution_vues (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE institution_vues ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_vues_insert ON institution_vues
  FOR INSERT TO anon, authenticated
  WITH CHECK (citoyen_id IS NULL OR citoyen_id = auth.uid());
-- Aucune policy SELECT : lecture exclusivement via service_role
-- (app/api/citoyen/institutions/populaires), jamais exposée en lecture
-- directe côté client.

CREATE INDEX institution_vues_institution_id_idx ON institution_vues(institution_id);
CREATE INDEX institution_vues_created_at_idx ON institution_vues(created_at);
