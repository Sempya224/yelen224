-- Clock In Shift — élargit employees.statut de 5 à 7 valeurs (ajoute
-- teletravail, mission), décision Bryan 05/08/2026 lors de la refonte
-- visuelle de l'onglet Employés. Contrainte CHECK inline non nommée dans
-- la migration d'origine (20260805000002_clock_in_employees.sql) → nom
-- auto-généré par Postgres : employees_statut_check. Confirmer ce nom
-- avant exécution avec : \d employees (si le nom diffère, adapter le DROP
-- CONSTRAINT ci-dessous).
--
-- ⚠️ Portée volontairement limitée en V1 : ces deux valeurs sont
-- purement informatives sur la fiche employé (badge affiché, filtrable)
-- — elles ne sont PAS encore intégrées au calcul de daily_attendance
-- (le job nocturne ne les connaît pas, un employé "mission"/"teletravail"
-- continue d'être évalué Absent/Incomplet s'il ne pointe pas). Étendre le
-- job pour en tenir compte est un chantier séparé, pas fait ici.
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_statut_check;

ALTER TABLE employees
  ADD CONSTRAINT employees_statut_check
  CHECK (statut IN ('actif', 'suspendu', 'en_conge', 'archive', 'desactive', 'teletravail', 'mission'));
