-- « Préparer ma semaine » — Phase 1 fondations (décision CEO 26/09/2026).
-- Décision d'architecture actée avec Bryan : réutiliser le moteur de
-- tâches/agenda existant (`taches`/`evenements_agenda`, Espace de travail,
-- migration 20260713000001) plutôt que dupliquer un système Task/Commitment
-- parallèle — une tâche créée depuis "Ma semaine" doit rester la même
-- tâche que celle vue dans Espace de travail → Tâches. Cette migration
-- n'ajoute donc que ce qui n'existe nulle part ailleurs : quelques colonnes
-- additives sur `taches`, et une table pour le rituel hebdomadaire
-- lui-même (3 priorités de la semaine, statut du rituel, bilan).

-- `origine` : traçabilité déjà anticipée par le brief CEO pour le jour où
-- Phase 4 branchera RDV/clients/démarches — 'manuel' par défaut pour ne
-- rien changer aux lignes existantes ni aux inserts actuels de
-- app/api/institution/taches/route.ts (qui ne renseigne pas encore ce
-- champ).
ALTER TABLE taches
  ADD COLUMN duree_estimee_minutes integer,
  ADD COLUMN origine text NOT NULL DEFAULT 'manuel'
    CHECK (origine IN ('manuel', 'rdv', 'client', 'demarche', 'recurrent', 'systeme')),
  ADD COLUMN flexible boolean NOT NULL DEFAULT true;

-- 1 ligne par membre par semaine calendaire (lundi ISO). RLS activé, aucune
-- policy publique — même convention que `taches` : institution_membres n'a
-- pas de session Supabase Auth, donc accès exclusivement via service_role
-- dans app/api/institution/preparations-semaine/route.ts.
CREATE TABLE preparations_semaine (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  membre_id uuid NOT NULL REFERENCES institution_membres(id) ON DELETE CASCADE,
  semaine_debut date NOT NULL,
  priorites jsonb NOT NULL DEFAULT '[]'::jsonb,
  statut text NOT NULL DEFAULT 'en_preparation'
    CHECK (statut IN ('en_preparation', 'active', 'terminee')),
  bilan jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  termine_le timestamptz,
  UNIQUE (membre_id, semaine_debut)
);
ALTER TABLE preparations_semaine ENABLE ROW LEVEL SECURITY;
