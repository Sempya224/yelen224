-- Clock In Shift — 2/9. `employees` est le profil RH, délibérément séparé de
-- `institution_membres` (comptes d'accès au dashboard Yelen) — décision CEO
-- explicite : un employé peut ne jamais avoir de compte dashboard, et
-- inversement. Le lien optionnel est ajouté au fichier suivant
-- (institution_membres.employee_id).
--
-- `role` (admin/manager/employe) est un rôle propre à Clock In Shift,
-- indépendant du rôle institution_membres (admin/agent/comptable/
-- superviseur/dirigeant) du dashboard Yelen — décision tranchée en review de
-- plan : nécessaire car l'authentification du portail pointage se fait par
-- Identifiant+PIN contre `employees`/`employee_credentials`, pas contre
-- `institution_membres`.
--
-- Suppression toujours douce (`statut`), jamais de DELETE réel — cohérent
-- avec les FK ON DELETE RESTRICT posées depuis attendance_logs/
-- daily_attendance dans les fichiers suivants (ne bloquent jamais en
-- pratique puisqu'on ne supprime pas un employee).
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  matricule text NOT NULL,
  photo_url text,
  nom text NOT NULL,
  prenom text NOT NULL,
  telephone text,
  email text,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  poste text,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  date_embauche date NOT NULL,
  statut text NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'suspendu', 'en_conge', 'archive', 'desactive')),
  role text NOT NULL DEFAULT 'employe'
    CHECK (role IN ('admin', 'manager', 'employe')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, matricule)
);

CREATE INDEX employees_institution_statut_idx ON employees (institution_id, statut);
CREATE INDEX employees_institution_department_idx ON employees (institution_id, department_id);
CREATE INDEX employees_institution_manager_idx ON employees (institution_id, manager_id);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
