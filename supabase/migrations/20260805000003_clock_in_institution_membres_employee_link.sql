-- Clock In Shift — 3/9. Lien optionnel entre un employé (profil RH,
-- `employees`) et un compte d'accès au dashboard Yelen
-- (`institution_membres`). Décision CEO explicite : les deux concepts sont
-- différents mais reliés — ex. "400 employés, 40 managers, 15 agents Yelen,
-- 3 comptables, 1 admin, tous pointent, seuls certains accèdent au
-- dashboard".
--
-- Index unique PARTIEL (pas un simple UNIQUE) : autorise plusieurs NULL
-- (employé sans compte dashboard) tout en garantissant au plus un compte
-- dashboard par employé.
ALTER TABLE institution_membres
  ADD COLUMN employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX institution_membres_employee_id_idx
  ON institution_membres (employee_id) WHERE employee_id IS NOT NULL;
