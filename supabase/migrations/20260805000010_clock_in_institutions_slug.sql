-- Clock In Shift — 10/10 (suite du lot schéma du 05/08/2026). Le portail
-- employé V1 utilise l'URL yelen224.com/clock/{institution} (décision CEO,
-- sous-domaines reportés à V2). "institution" doit résoudre vers un
-- institution_id — aucune colonne URL-friendly n'existait avant ce fichier
-- (vérifié par grep : institutions n'a que id/name, pas de slug).
--
-- Backfill déterministe pour les institutions déjà existantes : nom en
-- minuscules, accents français courants translittérés, tout caractère non
-- alphanumérique réduit à un seul "-", bordures nettoyées. Collisions
-- (deux institutions au même nom normalisé) départagées par un suffixe
-- numérique stable via ROW_NUMBER(). Fallback "institution-{8 premiers
-- caractères de l'id}" si le nom ne produit aucun caractère alphanumérique
-- (cas limite, à surveiller après exécution — SELECT slug FROM institutions
-- WHERE slug LIKE 'institution-%' pour repérer les cas retombés sur ce
-- fallback).
ALTER TABLE institutions ADD COLUMN slug text;

WITH base AS (
  SELECT
    id,
    NULLIF(
      trim(both '-' from
        regexp_replace(
          lower(translate(name,
            'àâäéèêëïîôöùûüçñÀÂÄÉÈÊËÏÎÔÖÙÛÜÇÑ',
            'aaaeeeeiioouuucnAAAEEEEIIOOUUUCN'
          )),
          '[^a-z0-9]+', '-', 'g'
        )
      ),
      ''
    ) AS base_slug
  FROM institutions
),
resolved AS (
  SELECT id, COALESCE(base_slug, 'institution-' || left(id::text, 8)) AS base_slug
  FROM base
),
numbered AS (
  SELECT id, base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY id) AS rn
  FROM resolved
)
UPDATE institutions i
SET slug = CASE WHEN n.rn = 1 THEN n.base_slug ELSE n.base_slug || '-' || n.rn END
FROM numbered n
WHERE i.id = n.id;

ALTER TABLE institutions ALTER COLUMN slug SET NOT NULL;
ALTER TABLE institutions ADD CONSTRAINT institutions_slug_unique UNIQUE (slug);
ALTER TABLE institutions ADD CONSTRAINT institutions_slug_format
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
