-- Migration : Notes V3 — centre de connaissance opérationnelle (20/09/2026,
-- validé avec Bryan). Complète la couche de coordination ajoutée pour
-- Projets (migration 20260920000001) :
--   - notes.tags : text[], recherche/filtre par tag (item 13 du brief).
--   - notes.projet_id : liaison optionnelle vers projets, même convention
--     que taches.projet_id/documents_travail.projet_id (nullable,
--     ON DELETE SET NULL — supprimer un projet détache ses notes, ne les
--     supprime jamais).
--   - notes.document_ids : uuid[], référence multiple vers
--     documents_travail.id (une note peut citer plusieurs documents,
--     contrairement au lien projet qui est unique) — pas de contrainte FK
--     sur les éléments d'un tableau en PostgreSQL ; chaque id est validé
--     côté route API à l'écriture (même discipline que projet_id).
-- Pas de changement de type sur `contenu` (reste text) : l'éditeur par
-- blocs (item 6) sérialise sa structure en JSON dans cette même colonne
-- texte — les notes existantes (texte brut, non-JSON) restent lisibles
-- telles quelles côté frontend (repli automatique en un seul bloc
-- "Texte"), aucune migration de données destructive nécessaire.
ALTER TABLE notes
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN projet_id uuid REFERENCES projets(id) ON DELETE SET NULL,
  ADD COLUMN document_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX idx_notes_projet_id ON notes(projet_id) WHERE projet_id IS NOT NULL;
CREATE INDEX idx_notes_tags ON notes USING gin(tags);
