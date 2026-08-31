-- Posts institutionnels dans Yelen Community (22/08/2026, retour Bryan) —
-- les institutions publient désormais aussi dans le fil Communauté, en plus
-- des citoyens. `auteur_id` référençait exclusivement `users(id)` ; on
-- ajoute une deuxième filiation exclusive vers `institutions(id)` plutôt que
-- de réutiliser `auteur_id` (id issu d'une table différente, aucune session
-- Supabase Auth côté institution — `auth.uid()` ne peut de toute façon
-- jamais correspondre à un institution_id). Les colonnes dénormalisées
-- existantes (author_nom/author_photo_url/author_verifie) suffisent pour
-- une institution (nom/logo/badge_verifie) — aucune nouvelle colonne
-- d'affichage nécessaire. Écriture exclusivement via
-- app/api/institution/communaute-posts (service_role, mirroring
-- app/api/citoyen/posts) — aucune policy d'écriture ajoutée ici, même
-- convention que la table d'origine.

ALTER TABLE posts
  ALTER COLUMN auteur_id DROP NOT NULL,
  ADD COLUMN institution_auteur_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  ADD COLUMN auteur_type text NOT NULL DEFAULT 'citoyen' CHECK (auteur_type IN ('citoyen','institution'));

ALTER TABLE posts ADD CONSTRAINT posts_auteur_exclusif CHECK (
  (auteur_type = 'citoyen'     AND auteur_id IS NOT NULL AND institution_auteur_id IS NULL) OR
  (auteur_type = 'institution' AND institution_auteur_id IS NOT NULL AND auteur_id IS NULL)
);
