-- Migration : Projets et Notes de l'espace de travail (20/07/2026)
-- 2 nouveaux onglets de l'Espace de travail (spec CEO, refonte niveau
-- Google Workspace/Linear/Notion Calendar). RLS activé, aucune policy
-- publique : accès exclusivement via service_role dans les routes API
-- (même pattern que taches/evenements_agenda/documents_travail, migration
-- 20260713000001).
CREATE TABLE projets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  nom text NOT NULL,
  description text,
  responsable_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  date_debut date,
  date_fin_prevue date,
  statut text NOT NULL DEFAULT 'a_venir' CHECK (statut IN ('a_venir','en_cours','termine','bloque')),
  cree_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projets ENABLE ROW LEVEL SECURITY;

CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  titre text NOT NULL,
  contenu text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info_importante' CHECK (type IN ('info_client','idee_interne','rappel_admin','consigne_equipe','info_importante')),
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
