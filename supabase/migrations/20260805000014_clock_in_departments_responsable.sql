-- Clock In Shift — ajoute departments.responsable_id, décision Bryan
-- 05/08/2026 lors de la refonte visuelle de l'onglet Départements.
-- Anticipé dès le schéma d'origine
-- (20260805000001_clock_in_departments.sql : "Pas de responsable_id en V1
-- ... ajoutable plus tard par un simple ALTER TABLE, sans refonte") — c'est
-- exactement ce qui se passe ici.
ALTER TABLE departments
  ADD COLUMN responsable_id uuid REFERENCES employees(id) ON DELETE SET NULL;
