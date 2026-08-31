-- admin_logs — immuabilité (GAP-06-07, clos le 30/08/2026 dans le cadre
-- de la Mission Hardening Admin, point 8 du brief : "un administrateur ne
-- doit pas pouvoir modifier ou supprimer rétroactivement ses propres
-- traces").
--
-- Même pattern déjà appliqué à journal_activite (20260723000001),
-- signalement_events (20260808000005) et auth_security_events
-- (20260828000004) : bloque UPDATE/DELETE même pour service_role/
-- superutilisateur SQL Editor, échappatoire dédiée pour correction
-- exceptionnelle (jamais une correction en place, toujours une nouvelle
-- ligne insert-only + trace).

CREATE OR REPLACE FUNCTION admin_logs_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_admin_logs', true) = 'on' THEN
    RAISE WARNING 'admin_logs: modification manuelle exceptionnelle autorisée (id=%).', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'admin_logs est immuable : impossible de modifier ou supprimer une entrée (id=%).', OLD.id;
END;
$$;

CREATE TRIGGER admin_logs_immuable
  BEFORE UPDATE OR DELETE ON admin_logs
  FOR EACH ROW EXECUTE FUNCTION admin_logs_interdire_modification();
