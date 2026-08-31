-- Correctif (20/08/2026) — 20260821000010 a été exécutée une première
-- fois dans une version antérieure (avant l'ajout de est_chambre/photos/
-- video_url/video_duree_secondes et avant le passage de `horaires` en
-- jsonb structuré). Vérifié en base par Bryan (information_schema.columns)
-- avant d'écrire cette migration — colonnes déjà présentes : type_prestation,
-- unite_prix, horaires (text), localisation, photo_url. Manquantes :
-- est_chambre, photos, video_url, video_duree_secondes. Cette migration
-- ne re-déclare aucune colonne déjà existante (éviterait l'erreur 42701
-- rencontrée), ne complète que ce qui manque réellement.

-- 1. Colonnes manquantes (jamais exécutées) — chantier Chambres puis
--    galerie photo/vidéo.
ALTER TABLE paid_services
  ADD COLUMN est_chambre boolean NOT NULL DEFAULT false,
  ADD COLUMN photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN video_url text NULL,
  ADD COLUMN video_duree_secondes integer NULL;

-- 2. `horaires` existe déjà en text (ancienne version, avant le retour
--    Bryan "pas de texte libre, utilise celle du système") — conversion
--    en jsonb (Horaire[], même structure que institutions.horaires).
--    Projet pré-lancement, aucune donnée citoyen réelle sur cette colonne
--    à ce stade (chantier jamais mis en production) : toute valeur déjà
--    présente qui ne ressemble pas à un tableau/objet JSON est mise à
--    NULL plutôt que de faire échouer la migration sur un ancien texte
--    libre de test.
ALTER TABLE paid_services
  ALTER COLUMN horaires TYPE jsonb USING (
    CASE
      WHEN horaires IS NULL THEN NULL
      WHEN horaires ~ '^\s*[\[{]' THEN horaires::jsonb
      ELSE NULL
    END
  );

-- 3. `photo_url` (single photo) est remplacée par `photos` (jusqu'à 5,
--    retour Bryan "jusqu'à 5 images et une vidéo") — colonne devenue
--    morte, jamais lue/écrite par le code actuel. Supprimée pour éviter
--    une colonne fantôme (aucune donnée réelle dessus, chantier jamais
--    mis en production).
ALTER TABLE paid_services DROP COLUMN photo_url;

-- Aucun changement de RLS : les policies existantes sur paid_services
-- (lecture publique is_active=true, écriture service_role) couvrent déjà
-- toutes les colonnes de la table sans distinction.
