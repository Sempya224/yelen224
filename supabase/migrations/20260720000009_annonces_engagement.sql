-- Refonte Communication → Annonces, Lot A (fondation, 20/07/2026)
-- Décisions CEO validées : formats riches (image/carrousel/pdf/vidéo)
-- construits maintenant ; engagement citoyen réel (vues/portée/likes/
-- commentaires/partages) construit maintenant, pas de chiffres fictifs ;
-- audience par type de citoyen reportée (aucune classification citoyen
-- n'existe en base) ; "Durée" du formulaire n'est qu'un calcul UI de
-- date_expiration = date_publication + N jours, aucune colonne dédiée.
-- "Terminée" (spec CEO) = renommage d'affichage du statut déjà calculé
-- côté client quand date_expiration est dépassée (aucune donnée nouvelle).
-- "Archivée" existe déjà comme valeur libre de `statut` (utilisée par
-- l'admin) ; cette migration ne fait que la rendre actionnable côté
-- institution — aucun changement de colonne nécessaire.
--
-- Faille corrigée au passage : `annonces` n'avait qu'une policy SELECT
-- publique (statut='publiee'), aucune policy INSERT/UPDATE/DELETE. Les
-- écritures institution passaient en direct depuis le navigateur
-- (CommunicationTab.tsx, clé anon) sans garde-fou d'appartenance. Cette
-- migration n'ajoute délibérément AUCUNE policy d'écriture sur `annonces`
-- : toutes les écritures institution passent désormais par
-- /api/institution/annonces (service_role, institution_id dérivé du JWT).

ALTER TABLE annonces ADD COLUMN format text NOT NULL DEFAULT 'image'
  CHECK (format IN ('image','carrousel','pdf','video'));
ALTER TABLE annonces ADD COLUMN media_urls jsonb;
ALTER TABLE annonces ADD COLUMN nb_partages integer NOT NULL DEFAULT 0;

ALTER TABLE annonces ENABLE ROW LEVEL SECURITY;

-- Vues — chaque rendu de l'annonce sur la fiche publique insère une ligne.
-- citoyen_id nullable (visiteur non connecté) : compte pour nb_vues mais
-- pas pour la portée (audience atteinte = citoyens distincts identifiés).
CREATE TABLE annonce_vues (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  annonce_id uuid NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
  citoyen_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE annonce_vues ENABLE ROW LEVEL SECURITY;
CREATE POLICY annonce_vues_insert ON annonce_vues
  FOR INSERT TO anon, authenticated
  WITH CHECK (citoyen_id IS NULL OR citoyen_id = auth.uid());

CREATE TABLE annonce_likes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  annonce_id uuid NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (annonce_id, citoyen_id)
);
ALTER TABLE annonce_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY annonce_likes_public_read ON annonce_likes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY annonce_likes_insert_own ON annonce_likes
  FOR INSERT TO authenticated WITH CHECK (citoyen_id = auth.uid());
CREATE POLICY annonce_likes_delete_own ON annonce_likes
  FOR DELETE TO authenticated USING (citoyen_id = auth.uid());

CREATE TABLE annonce_commentaires (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  annonce_id uuid NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contenu text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE annonce_commentaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY annonce_commentaires_public_read ON annonce_commentaires
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY annonce_commentaires_insert_own ON annonce_commentaires
  FOR INSERT TO authenticated WITH CHECK (citoyen_id = auth.uid());
CREATE POLICY annonce_commentaires_delete_own ON annonce_commentaires
  FOR DELETE TO authenticated USING (citoyen_id = auth.uid());

NOTIFY pgrst, 'reload schema';
