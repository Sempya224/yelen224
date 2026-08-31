-- Clock In Shift — 8/9. `daily_attendance` : résumé précalculé, une ligne
-- par (employee_id, date_jour), produit par un job nocturne (implémentation
-- du job hors périmètre de ce lot schéma — seule la forme de la table est
-- livrée ici) qui lit attendance_logs + employee_schedule_assignments/
-- work_schedules. Objectif : le dashboard fait un SELECT, jamais un
-- recalcul à la volée.
--
-- UNIQUE (employee_id, date_jour) = clé d'upsert du job (ON CONFLICT ... DO
-- UPDATE), garde un id stable entre deux exécutions pour que
-- attendance_audit_logs.daily_attendance_id (fichier 9) ne pointe jamais
-- dans le vide.
--
-- override_manuel : signale au job de ne pas écraser silencieusement une
-- correction humaine lors d'un recalcul.
--
-- Statuts V1 strictement limités aux 5 retenus par le CEO — ne pas ajouter
-- Mission/Télétravail/Validé/Jour non travaillé sans décision explicite.
-- Pas de ligne = jour non travaillé selon le planning, ou pas encore
-- d'affectation/calcul.
--
-- Contrairement à attendance_logs/attendance_audit_logs, cette table n'est
-- PAS immuable : c'est un résumé recalculable par construction, les
-- corrections manuelles légitimes s'y font par UPDATE direct (statut +
-- override_manuel) tracé dans attendance_audit_logs
-- (action_type='override_statut_jour').
CREATE TABLE daily_attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  date_jour date NOT NULL,
  work_schedule_id uuid REFERENCES work_schedules(id) ON DELETE SET NULL,
  heures_prevues_minutes integer NOT NULL DEFAULT 0,
  heures_travaillees_minutes integer NOT NULL DEFAULT 0,
  heures_normales_minutes integer NOT NULL DEFAULT 0,
  heures_supplementaires_minutes integer NOT NULL DEFAULT 0,
  retard_minutes integer NOT NULL DEFAULT 0,
  depart_anticipe_minutes integer NOT NULL DEFAULT 0,
  premiere_entree timestamptz,
  derniere_sortie timestamptz,
  nombre_pointages integer NOT NULL DEFAULT 0,
  statut text NOT NULL
    CHECK (statut IN ('Présent', 'Retard', 'Absent', 'Congé', 'Incomplet')),
  override_manuel boolean NOT NULL DEFAULT false,
  calcule_le timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date_jour)
);

CREATE INDEX daily_attendance_institution_date_idx
  ON daily_attendance (institution_id, date_jour);
CREATE INDEX daily_attendance_institution_statut_idx
  ON daily_attendance (institution_id, statut, date_jour);

ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;
