-- Clock In Shift — 6/9. Affectation d'un employé à un horaire de travail,
-- avec historique (date_debut/date_fin) pour ne jamais perdre trace d'un
-- changement d'horaire.
--
-- ON DELETE RESTRICT sur work_schedule_id : oblige à réaffecter les
-- employés avant de pouvoir supprimer un horaire.
--
-- Anti-chevauchement V1 : index unique partiel garantissant au plus une
-- affectation "ouverte" (date_fin NULL) par employé à la fois — pas une
-- garantie totale anti-chevauchement sur l'historique complet, mais
-- suffisant pour V1 sans dépendance à l'extension btree_gist.
CREATE TABLE employee_schedule_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_schedule_id uuid NOT NULL REFERENCES work_schedules(id) ON DELETE RESTRICT,
  date_debut date NOT NULL,
  date_fin date,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX employee_schedule_assignments_employee_idx
  ON employee_schedule_assignments (institution_id, employee_id, date_debut);
CREATE INDEX employee_schedule_assignments_schedule_idx
  ON employee_schedule_assignments (institution_id, work_schedule_id);
CREATE UNIQUE INDEX employee_schedule_assignments_open_idx
  ON employee_schedule_assignments (employee_id) WHERE date_fin IS NULL;

ALTER TABLE employee_schedule_assignments ENABLE ROW LEVEL SECURITY;
