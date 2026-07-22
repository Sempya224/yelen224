-- Migration : Espace de travail institution (13/07/2026)
-- 3 tables : taches, evenements_agenda, documents_travail.
-- RLS activé, aucune policy publique : accès exclusivement via service_role
-- dans les routes API (même pattern que notes_clients/feedback).
CREATE TABLE taches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  titre text NOT NULL,
  description text,
  priorite text NOT NULL DEFAULT 'normale',
  statut text NOT NULL DEFAULT 'a_faire',
  echeance date,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rdv_id uuid REFERENCES rdv(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE taches ENABLE ROW LEVEL SECURITY;

CREATE TABLE evenements_agenda (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  titre text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'rappel',
  date date NOT NULL,
  heure_debut time,
  heure_fin time,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evenements_agenda ENABLE ROW LEVEL SECURITY;

CREATE TABLE documents_travail (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  nom text NOT NULL,
  categorie text NOT NULL DEFAULT 'autre',
  url text NOT NULL,
  taille bigint,
  type_mime text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE documents_travail ENABLE ROW LEVEL SECURITY;
