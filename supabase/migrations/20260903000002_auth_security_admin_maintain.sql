-- Protection Auth — refonte opérationnelle (décision CEO 03/09/2026).
-- Aucun changement au moteur anti-abus (auth_device_security/auth_ip_security/
-- auth_admin_device_security/auth_admin_ip_security inchangées, aucun seuil,
-- aucune fenêtre, aucune règle de blocage touchée). Seul ajout : un nouveau
-- event_type 'admin_maintain' sur auth_security_events, symétrique à
-- 'admin_unblock' déjà existant — permet de journaliser explicitement la
-- décision "maintenir le blocage" (jusqu'ici aucune trace n'existait pour
-- une décision de statu quo, seul le déblocage produisait un événement).
--
-- ⚠️ Nom de contrainte confirmé empiriquement (tentative d'exécution du
-- 03/09/2026 : "constraint auth_security_events_event_type_check ... already
-- exists") — c'est bien le nom par défaut attendu pour ce CHECK inline
-- déclaré dans le CREATE TABLE d'origine. Plus besoin de le retrouver
-- dynamiquement, DROP direct par ce nom.
ALTER TABLE auth_security_events
  DROP CONSTRAINT IF EXISTS auth_security_events_event_type_check;

ALTER TABLE auth_security_events
  ADD CONSTRAINT auth_security_events_event_type_check
  CHECK (event_type IN ('attempt', 'admin_unblock', 'admin_maintain'));

-- Vérifier après exécution : select conname, pg_get_constraintdef(oid) from
-- pg_constraint where conrelid = 'auth_security_events'::regclass and contype = 'c';
