-- Clock In Shift — 7/9. `attendance_logs` : événements bruts de pointage
-- (une ligne par scan/action). Seulement entree/sortie — une pause est
-- simplement une sortie suivie d'une entree plus tard, ce qui unifie le
-- modèle quel que soit le régime horaire (fixe/fractionné/nuit/variable).
--
-- latitude/longitude/device_id : nullables, non utilisés pour validation en
-- V1 (pointage libre, décision CEO) — présents dès maintenant pour ne pas
-- nécessiter de refonte le jour où la géolocalisation/un device de
-- confiance devient une contrainte (V2/V3 du brief CEO).
--
-- Immuabilité au niveau base (décision tranchée en review de plan : pas
-- seulement application-layer) — même pattern que journal_activite
-- (supabase/migrations/20260723000001_journal_activite_fondations_audit.sql)
-- et que attendance_audit_logs (fichier 9 de ce lot), avec lequel cette
-- table partage le même réglage d'échappatoire
-- (app.autoriser_correction_pointage) puisqu'une correction légitime touche
-- typiquement les deux tables dans la même transaction.
--
-- ⚠️ Conséquence directe sur le mécanisme de correction : cette table ne
-- peut plus jamais subir d'UPDATE, donc aucune colonne "annule_par_audit_id"
-- n'est posée dessus. Une correction est 100% insert-only :
--   - pointage manquant : nouvelle ligne (methode='manuel') + une ligne
--     attendance_audit_logs (action_type='ajout_pointage').
--   - horaire erroné sur un pointage existant : nouvelle ligne
--     compensatoire (methode='manuel') + une ligne attendance_audit_logs
--     avec attendance_log_id_origine (ancienne ligne, jamais modifiée) et
--     attendance_log_id_correction (nouvelle ligne) renseignés.
-- Les pointages "actifs" sont déterminés par anti-jointure sur
-- attendance_audit_logs.attendance_log_id_origine (voir fichier 9) — pas de
-- flag de statut sur cette table elle-même.
--
-- ⚠️ POUR BRYAN : comme journal_activite, ce trigger bloquera aussi toute
-- correction manuelle depuis le SQL Editor Supabase. C'est voulu. Pour un
-- besoin réel et exceptionnel, dans la MÊME requête SQL (même transaction) :
--   SET LOCAL app.autoriser_correction_pointage = 'on';
--   UPDATE attendance_logs SET ... WHERE id = '...';
CREATE TABLE attendance_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  type_action text NOT NULL CHECK (type_action IN ('entree', 'sortie')),
  horodatage timestamptz NOT NULL DEFAULT now(),
  methode text NOT NULL DEFAULT 'pin'
    CHECK (methode IN ('pin', 'qr', 'manuel', 'biometrique')),
  latitude numeric,
  longitude numeric,
  device_id text,
  ip text,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attendance_logs_employee_idx
  ON attendance_logs (institution_id, employee_id, horodatage);

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION attendance_logs_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_pointage', true) = 'on' THEN
    RAISE WARNING 'attendance_logs: modification manuelle exceptionnelle autorisée (id=%).', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'attendance_logs est immuable : impossible de modifier ou supprimer une entrée (id=%). Toute correction doit passer par une nouvelle ligne + attendance_audit_logs.', OLD.id;
END;
$$;

CREATE TRIGGER attendance_logs_immuable
  BEFORE UPDATE OR DELETE ON attendance_logs
  FOR EACH ROW EXECUTE FUNCTION attendance_logs_interdire_modification();
