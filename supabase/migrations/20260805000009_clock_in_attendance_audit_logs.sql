-- Clock In Shift — 9/9. `attendance_audit_logs` : registre d'audit
-- immuable des corrections de pointage — "ancien horaire → nouveau horaire
-- → raison → administrateur → date → adresse IP" (brief CEO). Immuabilité
-- clonée exactement du pattern journal_activite
-- (supabase/migrations/20260723000001_journal_activite_fondations_audit.sql),
-- séquence/préfixe/fonction propres à ce module.
--
-- employee_nom/employee_matricule/membre_nom : snapshots dénormalisés (même
-- idiome que journal_activite.membre_nom et transactions_financieres.
-- membre_nom) — la ligne d'audit reste lisible même si l'employé ou le
-- membre référencé change de nom ou est archivé plus tard.
--
-- Séquence GLOBALE (toutes institutions confondues), jamais remise à zéro —
-- même raisonnement que journal_activite_audit_seq : un compteur qui ne se
-- réinitialise jamais évite tout risque de collision au passage d'année.
CREATE SEQUENCE attendance_audit_logs_audit_seq START 1;

CREATE OR REPLACE FUNCTION attendance_audit_logs_generer_audit_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('attendance_audit_logs_audit_seq');
  RETURN 'YL-ATT-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE attendance_audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  audit_id text NOT NULL UNIQUE DEFAULT attendance_audit_logs_generer_audit_id(),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_nom text NOT NULL,
  employee_matricule text NOT NULL,
  action_type text NOT NULL
    CHECK (action_type IN ('ajout_pointage', 'correction_pointage', 'override_statut_jour')),
  attendance_log_id_origine uuid REFERENCES attendance_logs(id) ON DELETE SET NULL,
  attendance_log_id_correction uuid REFERENCES attendance_logs(id) ON DELETE SET NULL,
  daily_attendance_id uuid REFERENCES daily_attendance(id) ON DELETE SET NULL,
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb,
  raison text NOT NULL,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  membre_nom text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attendance_audit_logs_institution_idx
  ON attendance_audit_logs (institution_id, created_at);
CREATE INDEX attendance_audit_logs_employee_idx
  ON attendance_audit_logs (employee_id);
CREATE INDEX attendance_audit_logs_origine_idx
  ON attendance_audit_logs (attendance_log_id_origine) WHERE attendance_log_id_origine IS NOT NULL;

ALTER TABLE attendance_audit_logs ENABLE ROW LEVEL SECURITY;

-- Immuabilité : s'applique à TOUT rôle, y compris service_role et postgres
-- (superuser SQL Editor) — contrairement à RLS, un trigger PL/pgSQL n'est
-- jamais contourné par un superuser.
--
-- ⚠️ IMPORTANT POUR BRYAN : ce trigger bloquera aussi toute correction
-- manuelle depuis le SQL Editor Supabase (UPDATE/DELETE sur
-- attendance_audit_logs). C'est voulu ("personne ne peut effacer ses
-- traces"). Pour un besoin réel et exceptionnel, dans la MÊME requête SQL
-- (même transaction) :
--   SET LOCAL app.autoriser_correction_pointage = 'on';
--   UPDATE attendance_audit_logs SET ... WHERE id = '...';
-- Le réglage ne s'applique qu'à cette requête précise et ne persiste pas.
-- Ce réglage est partagé avec attendance_logs (fichier 7) : une correction
-- réelle touche typiquement les deux tables dans la même transaction.
CREATE OR REPLACE FUNCTION attendance_audit_logs_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_pointage', true) = 'on' THEN
    RAISE WARNING 'attendance_audit_logs: modification manuelle exceptionnelle autorisée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'attendance_audit_logs est immuable : impossible de modifier ou supprimer une entrée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
END;
$$;

CREATE TRIGGER attendance_audit_logs_immuable
  BEFORE UPDATE OR DELETE ON attendance_audit_logs
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_logs_interdire_modification();
