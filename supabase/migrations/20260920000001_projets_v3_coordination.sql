-- Migration : Projets V3 — couche de coordination de l'Espace de travail
-- (20/09/2026, validé avec Bryan). Ajoute ce qui manquait pour que
-- "Projets" connecte réellement Tâches/Documents plutôt que de rester une
-- liste isolée :
--   - projets.priorite / projets.sante : mêmes conventions que taches
--     (priorite : CHECK fermé, même échelle basse/normale/haute).
--     sante n'est JAMAIS calculée automatiquement (décision explicite du
--     brief) — nullable, renseignée uniquement par le responsable/créateur/
--     admin, NULL = "non renseignée" (jamais une valeur par défaut forcée).
--   - taches.projet_id / documents_travail.projet_id : liaison optionnelle
--     (nullable, ON DELETE SET NULL — supprimer un projet ne supprime
--     jamais les tâches/documents qui lui étaient liés, il les détache
--     seulement). Permet "même donnée, deux contextes" (item 11 du brief)
--     sans dupliquer aucune ligne.
--   - projet_milestones : nouvelle table, absente jusqu'ici. Mêmes 3
--     statuts que taches (a_faire/en_cours/termine) pour rester cohérent
--     avec le reste de l'Espace de travail plutôt qu'inventer un 4e
--     vocabulaire de statuts dans le même module.
-- RLS activé, aucune policy publique — même convention que toutes les
-- tables de l'Espace de travail (accès exclusivement service_role via les
-- routes API, migration 20260713000001).

ALTER TABLE projets
  ADD COLUMN priorite text NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse','normale','haute')),
  ADD COLUMN sante text CHECK (sante IN ('vert','orange','rouge'));

ALTER TABLE taches
  ADD COLUMN projet_id uuid REFERENCES projets(id) ON DELETE SET NULL;

ALTER TABLE documents_travail
  ADD COLUMN projet_id uuid REFERENCES projets(id) ON DELETE SET NULL;

CREATE TABLE projet_milestones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  projet_id uuid NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  titre text NOT NULL,
  statut text NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire','en_cours','termine')),
  echeance date,
  ordre integer NOT NULL DEFAULT 0,
  cree_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projet_milestones ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_taches_projet_id ON taches(projet_id) WHERE projet_id IS NOT NULL;
CREATE INDEX idx_documents_travail_projet_id ON documents_travail(projet_id) WHERE projet_id IS NOT NULL;
CREATE INDEX idx_projet_milestones_projet_id ON projet_milestones(projet_id);
