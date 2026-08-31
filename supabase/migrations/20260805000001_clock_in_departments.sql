-- Clock In Shift — module Enterprise de pointage employé (décision CEO,
-- 26/07/2026, architecture figée le 05/08/2026 après restauration du plan
-- suite à un redémarrage). Ce fichier est le 1er des 9 migrations du schéma
-- V1. Aucune route API/UI dans ce lot — schéma seul.
--
-- `departments` : simple regroupement d'employés au sein d'une institution.
-- Pas de `responsable_id` en V1 (évite une dépendance circulaire avec
-- `employees`, qui n'existe pas encore à ce stade) — ajoutable plus tard par
-- un simple ALTER TABLE sans refonte.
CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  nom text NOT NULL,
  description text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, nom)
);

-- Multi-tenant : les institutions s'authentifient via JWT signé custom
-- (lib/institutionAuth.ts), jamais via une session Supabase Auth — donc
-- auth.uid() est toujours null côté institution. RLS activé, zéro policy :
-- accès exclusivement service_role, depuis des routes qui ont déjà vérifié
-- le JWT. Même pattern que institution_membres/journal_activite.
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
